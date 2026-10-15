"""
Router Chat Nội bộ — WebSocket + REST API.

Hoạt động ĐỘC LẬP với hệ thống SSE (`core/events.py`).
- Realtime:   WS `/api/chat/ws?token=...&employee_code=...`
- REST:       `GET /api/chat/rooms`, `GET /api/chat/messages/{room_id}`,
              `POST /api/chat/rooms`

Message path: validate → bounded batch commit → acknowledgement/fan-out.
"""
import asyncio
import os
import time
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException, Header, Query, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import and_, or_, func, text

from app.core.auth import verify_session, verify_token
from app.core.chat_persist import (
    PendingMessage,
    build_optimistic_payload,
    new_message_id,
    persist_queue,
)
from app.core.chat_files import signed_file_url, validate_attachment, verify_file_signature
from app.core.chat_redis import ChatRedisBridge
from app.core.chat_ws import ConnectionManager
from app.core.session import SessionLocal
from app.models import ChatRoom, ChatRoomMember, ChatMessage, Employee, User
from app.services.upload_service import save_chat_upload, CHAT_UPLOAD_BASE
from app.services.chat_archive_service import (
    CHAT_ARCHIVE_BASE,
    archive_messages,
    delete_archive,
    list_archives,
    preview_message_archive,
    restore_archive,
    upload_archive,
)


class RoomCreate(BaseModel):
    type: str = "direct"
    name: Optional[str] = None
    department: Optional[str] = None
    member_codes: List[str] = []


class RoomRename(BaseModel):
    name: str


class MemberUpdate(BaseModel):
    employee_codes: List[str] = []


class ChatArchiveRequest(BaseModel):
    start_date: str
    end_date: str
    room_types: List[str] = ["department", "group", "direct"]
    room_ids: List[str] = []


class ChatRestoreRequest(BaseModel):
    filename: str


router = APIRouter(prefix="/api/chat", tags=["chat"])
manager = ConnectionManager()
redis_bridge = ChatRedisBridge(manager)

_CLOSE_CODE_UNAUTHORIZED = 1008

# Room-member cache: room_id → (expires_monotonic, codes)
# Tránh query DB mỗi tin nhắn khi group spam.
_ROOM_MEMBER_TTL_SEC = 30.0
_room_member_cache: Dict[str, Tuple[float, List[str]]] = {}
# Membership check cache: (room_id, employee_code) → (expires, ok)
_MEMBER_CHECK_TTL_SEC = 60.0
_member_check_cache: Dict[Tuple[str, str], Tuple[float, bool]] = {}


async def start_chat_runtime() -> None:
    """Gọi từ main startup — heartbeat, persist worker, Redis bridge."""
    await manager.start()
    await persist_queue.start()
    await redis_bridge.start()


async def stop_chat_runtime() -> None:
    """Gọi từ main shutdown — flush queue + huỷ background tasks."""
    await persist_queue.stop()
    await redis_bridge.stop()
    await manager.stop()


def invalidate_room_member_cache(room_id: Optional[str] = None) -> None:
    """Gọi khi thêm/bớt thành viên / đổi phòng ban."""
    if room_id is None:
        _room_member_cache.clear()
        _member_check_cache.clear()
        return
    _room_member_cache.pop(room_id, None)
    dead_keys = [k for k in _member_check_cache if k[0] == room_id]
    for k in dead_keys:
        _member_check_cache.pop(k, None)


def _normalize_user(u: dict) -> dict:
    """Chuẩn hoá dict user từ verify_session (REST) và _resolve_ws_user (WS)."""
    return {
        "employee_code": u.get("user_code") or u.get("employee_code") or "",
        "role": u.get("user_role") or u.get("role") or "user",
        "department": u.get("department") or "",
        "full_name": u.get("full_name") or "",
    }


def _require_admin(
    x_user_code: Optional[str],
    x_user_role: Optional[str],
    x_user_dept: Optional[str],
    x_user_token: Optional[str],
) -> dict:
    user = _normalize_user(verify_session(x_user_code, x_user_role, x_user_dept, x_user_token))
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Chỉ quản trị viên được quản lý backup chat")
    return user


def _same_dept(a: Optional[str], b: Optional[str]) -> bool:
    return bool(a) and bool(b) and (a.strip().lower() == b.strip().lower())


def _department_member_codes(db, department: str) -> List[str]:
    """Danh sách nhân viên CÓ tài khoản thuộc phòng ban (dùng cho phòng department)."""
    if not department:
        return []
    rows = (
        db.query(User.employee_code)
        .join(Employee, Employee.employee_code == User.employee_code)
        .filter(Employee.department == department)
        .all()
    )
    return [r[0] for r in rows]


def _is_room_member(db, room: Optional[ChatRoom], employee_code: str) -> bool:
    """Thành viên phòng: bảng member cho direct/group, phòng ban là theo employees.department.

    Admin được xem/quản lý mọi phòng phòng ban (để quản trị toàn hệ thống).
    """
    if not room:
        return False
    if room.type == "department":
        role = db.query(User.role).filter(User.employee_code == employee_code).first()
        if role and role[0] == "admin":
            return True
        dept = db.query(Employee.department).filter(Employee.employee_code == employee_code).first()
        return dept is not None and _same_dept(dept[0], room.department)
    return (
        db.query(ChatRoomMember)
        .filter(ChatRoomMember.room_id == room.id, ChatRoomMember.employee_code == employee_code)
        .count()
        > 0
    )


def _ensure_department_room(db, department: str) -> Optional[ChatRoom]:
    """Tự tạo phòng phòng ban nếu chưa tồn tại (chạy khi user mở Chat)."""
    if not department:
        return None
    room = (
        db.query(ChatRoom)
        .filter(ChatRoom.type == "department", ChatRoom.department == department)
        .first()
    )
    if room:
        return room
    room = ChatRoom(type="department", name=department, department=department, owner_code=None)
    db.add(room)
    db.commit()
    db.refresh(room)
    return room


def _can_manage_room(user: dict, room: Optional[ChatRoom]) -> bool:
    """Quyền quản lý phòng (đổi tên / thêm bớt thành viên / xoá).

    - admin: mọi phòng.
    - trưởng phòng (head): phòng phòng ban đúng phòng ban của mình.
    - chủ nhóm (owner): nhóm do mình tạo.
    """
    if not room:
        return False
    if user["role"] == "admin":
        return True
    if room.type == "department":
        return user["role"] == "head" and _same_dept(user["department"], room.department)
    if room.type == "group":
        return room.owner_code == user["employee_code"]
    return False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _serialize_message(msg: ChatMessage, sender_name: str = "") -> dict:
    return {
        "id": msg.id,
        "room_id": msg.room_id,
        "sender_id": msg.sender_id,
        "sender_name": sender_name,
        "content": msg.content,
        "attachment_url": signed_file_url(msg.attachment_url),
        "attachment_name": msg.attachment_name,
        "attachment_type": msg.attachment_type,
        "attachment_size": msg.attachment_size,
        "is_pinned": bool(msg.is_pinned),
        "pinned_by": msg.pinned_by,
        "pinned_at": msg.pinned_at.isoformat() if msg.pinned_at else None,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
    }


def _pinned_messages(db, room_id: str) -> List[dict]:
    """Tin nhắn đang ghim của phòng (mới ghim trước)."""
    rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.room_id == room_id, ChatMessage.is_pinned == 1)
        .order_by(ChatMessage.pinned_at.desc())
        .limit(50)
        .all()
    )
    return [_serialize_message(m, _sender_name(db, m.sender_id)) for m in rows]


def _sender_name(db, employee_code: Optional[str]) -> str:
    if not employee_code:
        return ""
    row = db.query(Employee.full_name).filter(Employee.employee_code == employee_code).first()
    return row[0] if row else employee_code


def _room_member_codes(room_id: str, *, use_cache: bool = True) -> List[str]:
    """Danh sách thành viên phòng — có TTL cache để giảm DB hit khi spam."""
    if use_cache:
        cached = _room_member_cache.get(room_id)
        if cached and cached[0] > time.monotonic():
            return cached[1]

    db = SessionLocal()
    try:
        room = db.get(ChatRoom, room_id)
        if not room:
            codes: List[str] = []
        elif room.type == "department":
            codes = _department_member_codes(db, room.department or "")
        else:
            rows = (
                db.query(ChatRoomMember.employee_code)
                .filter(ChatRoomMember.room_id == room_id)
                .all()
            )
            codes = [r[0] for r in rows]
    finally:
        db.close()

    _room_member_cache[room_id] = (time.monotonic() + _ROOM_MEMBER_TTL_SEC, codes)
    return codes


def _cached_is_member(room_id: str, employee_code: str) -> bool:
    """Membership check với cache ngắn — tránh DB sync mỗi tin nhắn."""
    key = (room_id, employee_code)
    cached = _member_check_cache.get(key)
    if cached and cached[0] > time.monotonic():
        return cached[1]

    db = SessionLocal()
    try:
        room = db.get(ChatRoom, room_id)
        ok = _is_room_member(db, room, employee_code)
    finally:
        db.close()
    _member_check_cache[key] = (time.monotonic() + _MEMBER_CHECK_TTL_SEC, ok)
    return ok


def _online_codes() -> set:
    """Tập employee_code đang có WebSocket kết nối (đang online)."""
    return set(manager.active_connections())


async def _broadcast_presence(changed_code: str, status: bool) -> None:
    """Gửi sự kiện presence (kèm toàn bộ danh sách online) tới mọi user đang online."""
    online = manager.active_connections()
    await manager.broadcast_to_room(
        {
            "event": "presence",
            "online": online,
            "changed": changed_code,
            "status": bool(status),
        },
        online,
    )


def _resolve_ws_user(employee_code: str, token: str) -> Optional[dict]:
    """Xác thực token cho WebSocket (WS không gửi Header Authorization)."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.employee_code == employee_code).first()
        if not user or not token:
            return None
        if not verify_token(employee_code, token, user.role):
            return None
        emp = db.query(Employee).filter(Employee.employee_code == employee_code).first()
        return {
            "employee_code": employee_code,
            "role": user.role,
            "full_name": emp.full_name if emp else employee_code,
        }
    finally:
        db.close()


async def _handle_incoming_message(user: dict, data: dict) -> Optional[dict]:
    """Validate and commit before broadcasting; database I/O runs off-loop."""
    if not isinstance(data, dict):
        raise ValueError("Dữ liệu tin nhắn không hợp lệ")

    # Application-level heartbeat từ client
    event = data.get("event")
    if event in ("pong", "ping"):
        return None

    for field, maximum in {"room_id": 36, "content": 10000, "attachment_url": 512,
                           "attachment_name": 255, "attachment_type": 50,
                           "client_temp_id": 100}.items():
        value = data.get(field)
        if value is not None and (not isinstance(value, str) or len(value) > maximum):
            raise ValueError(f"Trường {field} không hợp lệ hoặc quá dài")
    size = data.get("attachment_size")
    if size is not None and (type(size) is not int or not 0 <= size <= 10 * 1024 * 1024):
        raise ValueError("Kích thước tệp không hợp lệ")

    room_id = (data.get("room_id") or "").strip()
    content = (data.get("content") or "").strip()
    attachment_url = (data.get("attachment_url") or "").strip() or None
    attachment_name = (data.get("attachment_name") or "").strip() or None
    attachment_type = (data.get("attachment_type") or "").strip() or None
    attachment_size = data.get("attachment_size")
    client_temp_id = (data.get("client_temp_id") or "").strip() or None

    if not room_id or (not content and not attachment_url):
        raise ValueError("Tin nhắn hoặc phòng chat trống")

    # Membership check — cache hit = 0 DB round-trip
    loop = asyncio.get_running_loop()
    is_member = await loop.run_in_executor(
        None, _cached_is_member, room_id, user["employee_code"]
    )
    if not is_member:
        raise ValueError("Bạn không còn là thành viên phòng chat")

    if attachment_url:
        attachment_url = validate_attachment(attachment_url)

    msg_id = new_message_id()
    created_at = datetime.utcnow()

    pending = PendingMessage(
        id=msg_id,
        room_id=room_id,
        sender_id=user["employee_code"],
        content=content,
        attachment_url=attachment_url,
        attachment_name=attachment_name,
        attachment_type=attachment_type,
        attachment_size=attachment_size,
        created_at=created_at,
    )

    await persist_queue.persist(pending)

    return build_optimistic_payload(
        msg_id=msg_id,
        room_id=room_id,
        sender_id=user["employee_code"],
        sender_name=user.get("full_name") or user["employee_code"],
        content=content,
        attachment_url=signed_file_url(attachment_url),
        attachment_name=attachment_name,
        attachment_type=attachment_type,
        attachment_size=attachment_size,
        created_at=created_at,
        client_temp_id=client_temp_id,
    )


# ---------------------------------------------------------------------------
# WebSocket — realtime chat
# ---------------------------------------------------------------------------
@router.websocket("/ws")
async def chat_ws(
    websocket: WebSocket,
    token: str = Query(default=""),
    employee_code: str = Query(default=""),
):
    # Auth sync — chỉ 1 lần lúc connect; chạy executor để không block loop.
    loop = asyncio.get_running_loop()
    user = await loop.run_in_executor(
        None, _resolve_ws_user, employee_code.strip(), token.strip()
    )
    if user is None:
        # accept rồi close, hoặc close trước accept tuỳ Starlette version.
        try:
            await websocket.close(code=_CLOSE_CODE_UNAUTHORIZED)
        except Exception:
            pass
        return

    await manager.connect(websocket, user["employee_code"])
    code = user["employee_code"]
    try:
        await _broadcast_presence(code, True)
        while True:
            try:
                data = await websocket.receive_json()
            except ValueError:
                await manager.send_personal_message({"event": "message_error", "detail": "JSON không hợp lệ"}, code)
                continue
            manager.touch(websocket)

            # Client pong / ignore control frames
            if isinstance(data, dict) and data.get("event") in ("pong", "ping"):
                if data.get("event") == "ping":
                    try:
                        await manager.send_personal_message({"event": "pong", "ts": data.get("ts")}, code)
                    except Exception:
                        break
                continue

            try:
                message = await _handle_incoming_message(user, data)
            except (ValueError, RuntimeError) as exc:
                await manager.send_personal_message({
                    "event": "message_error", "detail": str(exc),
                    "client_temp_id": data.get("client_temp_id") if isinstance(data, dict) else None,
                }, code)
                continue
            if message:
                # Lấy member codes (cache) trong executor nếu cache miss có DB.
                members = await loop.run_in_executor(
                    None, _room_member_codes, message["room_id"]
                )
                # Fan-out song song — không block event loop theo từng user.
                await manager.broadcast_to_room(message, members)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"Chat WS error ({code}): {e}")
    finally:
        # Chỉ disconnect *socket này* — multi-tab an toàn.
        fully_offline = await manager.disconnect(websocket, code)
        if fully_offline:
            await _broadcast_presence(code, False)


@router.get("/perf-stats")
def chat_perf_stats(
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    """Metrics ConnectionManager / persist queue / Redis (admin)."""
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    if (user.get("user_role") or user.get("role")) != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return {
        "status": "success",
        "data": {
            "connections": manager.stats(),
            "persist": persist_queue.stats(),
            "redis": redis_bridge.stats(),
            "room_cache_entries": len(_room_member_cache),
        },
    }


# ---------------------------------------------------------------------------
# REST — backup / dọn dữ liệu chat cũ (admin)
# ---------------------------------------------------------------------------
@router.post("/archives/preview")
def preview_chat_archive(
    data: ChatArchiveRequest,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    """Xem số tin phòng ban/nhóm/1-1 trong khoảng ngày mà chưa thay đổi dữ liệu."""
    _require_admin(x_user_code, x_user_role, x_user_dept, x_user_token)
    try:
        result = preview_message_archive(data.start_date, data.end_date, data.room_types, data.room_ids)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "success", "data": result}


@router.post("/archives", status_code=201)
def create_chat_archive(
    data: ChatArchiveRequest,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    """Tạo ZIP đã kiểm tra thành công, sau đó mới xóa tin trong khoảng ngày."""
    _require_admin(x_user_code, x_user_role, x_user_dept, x_user_token)
    try:
        result = archive_messages(data.start_date, data.end_date, data.room_types, data.room_ids)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Không thể tạo backup chat: {exc}") from exc
    message = "Không có tin nhắn trong khoảng đã chọn" if not result.get("filename") else "Đã nén, backup và dọn tin nhắn trong khoảng đã chọn"
    return {"status": "success", "data": result, "message": message}


@router.get("/archives")
def get_chat_archives(
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    _require_admin(x_user_code, x_user_role, x_user_dept, x_user_token)
    return {"status": "success", "data": list_archives()}


@router.post("/archives/upload", status_code=201)
def upload_chat_archive(
    file: UploadFile = File(...),
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    """Nhập lại ZIP đã tải về PC để có thể khôi phục lịch sử chat."""
    _require_admin(x_user_code, x_user_role, x_user_dept, x_user_token)
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file backup ZIP")
    try:
        result = upload_archive(file.file)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Không thể tải backup lên: {exc}") from exc
    finally:
        file.file.close()
    return {"status": "success", "data": result, "message": "Đã tải và kiểm tra file backup"}


@router.get("/archives/{filename}/download")
def download_chat_archive(
    filename: str,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    _require_admin(x_user_code, x_user_role, x_user_dept, x_user_token)
    path = CHAT_ARCHIVE_BASE / filename
    if path.name != filename or not path.is_file():
        raise HTTPException(status_code=404, detail="Không tìm thấy bản backup")
    return FileResponse(path, filename=filename, media_type="application/zip")


@router.delete("/archives/{filename}")
def delete_chat_archive(
    filename: str,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    _require_admin(x_user_code, x_user_role, x_user_dept, x_user_token)
    try:
        delete_archive(filename)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "success", "message": "Đã xóa file backup khỏi server"}


@router.post("/archives/restore")
def restore_chat_archive_endpoint(
    data: ChatRestoreRequest,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    _require_admin(x_user_code, x_user_role, x_user_dept, x_user_token)
    try:
        result = restore_archive(data.filename)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Không thể khôi phục backup chat: {exc}") from exc
    invalidate_room_member_cache()
    return {"status": "success", "data": result, "message": "Đã khôi phục dữ liệu chat"}


# ---------------------------------------------------------------------------
# REST — danh sách phòng & lịch sử tin nhắn
# ---------------------------------------------------------------------------
@router.get("/contacts")
def chat_contacts(
    q: str = Query(""),
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    """Danh sách nhân viên CÓ tài khoản (users) để tạo phòng chat.

    Chỉ trả về những người thực sự có thể tham gia phòng — tránh lỗi
    'Mã nhân viên không tồn tại' khi tạo phòng.
    """
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)

    db = SessionLocal()
    try:
        query = (
            db.query(Employee)
            .join(User, User.employee_code == Employee.employee_code)
            .filter(Employee.employee_code != user["user_code"])
        )
        kw = q.strip()
        if kw:
            like = f"%{kw}%"
            query = query.filter(
                (Employee.full_name.ilike(like))
                | (Employee.employee_code.ilike(like))
                | (Employee.department.ilike(like))
            )
        rows = query.order_by(Employee.full_name).limit(500).all()
        online = _online_codes()
        return {
            "status": "success",
            "data": [
                {
                    "employee_code": r.employee_code,
                    "full_name": r.full_name,
                    "department": r.department,
                    "position": r.position,
                    "status": r.status or "active",
                    "online": r.employee_code in online,
                }
                for r in rows
            ],
        }
    finally:
        db.close()


@router.get("/online")
def get_online_users(
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    """Danh sách nhân viên đang online (có WebSocket chat kết nối)."""
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    user = _normalize_user(user)

    codes = manager.active_connections()
    if not codes:
        return {"status": "success", "data": []}

    db = SessionLocal()
    try:
        rows = (
            db.query(Employee.employee_code, Employee.full_name, Employee.department, Employee.position)
            .filter(Employee.employee_code.in_(codes))
            .all()
        )
        info = {r.employee_code: r for r in rows}
        data = []
        for code in codes:
            r = info.get(code)
            data.append({
                "employee_code": code,
                "full_name": r.full_name if r else code,
                "department": r.department if r else "",
                "position": r.position if r else "",
                "online": True,
            })
        return {"status": "success", "data": data}
    finally:
        db.close()


@router.get("/rooms")
def get_rooms(
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    user = _normalize_user(user)

    db = SessionLocal()
    try:
        _ensure_department_room(db, user["department"])

        membership = db.query(ChatRoomMember.room_id).filter(ChatRoomMember.employee_code == user["employee_code"])
        department_filter = ChatRoom.type == "department"
        if user["role"] != "admin":
            department_filter = and_(department_filter,
                func.lower(func.trim(ChatRoom.department)) == (user["department"] or "").strip().lower())
        latest_id = (db.query(ChatMessage.id).filter(ChatMessage.room_id == ChatRoom.id)
                     .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
                     .limit(1).correlate(ChatRoom).scalar_subquery())
        rows = (db.query(ChatRoom, ChatMessage).outerjoin(ChatMessage, ChatMessage.id == latest_id)
                .filter(or_(ChatRoom.id.in_(membership), department_filter)).all())
        room_ids = [room.id for room, _ in rows]
        members = {}
        for room_id, code in db.query(ChatRoomMember.room_id, ChatRoomMember.employee_code).filter(ChatRoomMember.room_id.in_(room_ids)).all():
            members.setdefault(room_id, []).append(code)
        employees = db.query(Employee.employee_code, Employee.full_name, Employee.department).join(User, User.employee_code == Employee.employee_code).all()
        names = {code: name for code, name, _ in employees}
        departments = {}
        for code, _, dept in employees:
            departments.setdefault((dept or "").strip().lower(), []).append(code)
        rooms = []
        online = _online_codes()
        for room, last_msg in rows:
            member_codes = (departments.get((room.department or "").strip().lower(), [])
                            if room.type == "department" else members.get(room.id, []))
            online_codes = [c for c in member_codes if c in online]
            rooms.append({
                "id": room.id,
                "type": room.type,
                "name": room.name,
                "department": room.department,
                "owner_code": room.owner_code,
                "member_codes": member_codes,
                "member_count": len(member_codes),
                "online_codes": online_codes,
                "online_count": len(online_codes),
                "can_manage": _can_manage_room(user, room),
                "last_message": (
                    _serialize_message(last_msg, names.get(last_msg.sender_id, last_msg.sender_id))
                    if last_msg else None
                ),
                "created_at": room.created_at.isoformat() if room.created_at else None,
            })
        rooms.sort(key=lambda r: (r["last_message"] or {}).get("created_at") or r["created_at"] or "", reverse=True)
        return {"status": "success", "data": rooms}
    finally:
        db.close()


@router.get("/messages/{room_id}")
def get_messages(
    room_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    before: Optional[str] = Query(None, max_length=100),
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    user = _normalize_user(user)

    db = SessionLocal()
    try:
        room = db.get(ChatRoom, room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Không tìm thấy phòng chat")

        if not _is_room_member(db, room, user["employee_code"]):
            raise HTTPException(status_code=403, detail="Bạn không phải thành viên của phòng chat này")

        query = db.query(ChatMessage).filter(ChatMessage.room_id == room_id)
        if before:
            try:
                timestamp, message_id = before.rsplit("|", 1)
                cursor_time = datetime.fromisoformat(timestamp)
                if cursor_time.tzinfo is not None or not message_id:
                    raise ValueError()
            except ValueError:
                raise HTTPException(status_code=400, detail="Cursor không hợp lệ")
            query = query.filter(or_(ChatMessage.created_at < cursor_time,
                and_(ChatMessage.created_at == cursor_time, ChatMessage.id < message_id)))
        rows = query.order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc()).offset(offset).limit(limit + 1).all()
        has_more = len(rows) > limit
        rows = rows[:limit]
        next_cursor = f"{rows[-1].created_at.isoformat()}|{rows[-1].id}" if rows else None
        names = dict(db.query(Employee.employee_code, Employee.full_name).filter(
            Employee.employee_code.in_({m.sender_id for m in rows})).all()) if rows else {}
        messages = [_serialize_message(m, names.get(m.sender_id, m.sender_id)) for m in reversed(rows)]
        return {"status": "success", "data": messages, "has_more": has_more, "next_cursor": next_cursor}
    finally:
        db.close()


@router.post("/rooms", status_code=201)
def create_room(
    data: RoomCreate,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    user = _normalize_user(user)

    room_type = (data.type or "direct").strip().lower()
    if room_type not in ("direct", "group", "department"):
        raise HTTPException(status_code=400, detail="Loại phòng không hợp lệ (chỉ chấp nhận direct/group/department)")

    codes = list(dict.fromkeys(c.strip() for c in data.member_codes if c and c.strip()))
    if user["employee_code"] not in codes:
        codes.insert(0, user["employee_code"])
    if not codes:
        raise HTTPException(status_code=400, detail="Phòng chat phải có ít nhất một thành viên")

    db = SessionLocal()
    try:
        # ── Phòng phòng ban ──────────────────────────────────────
        if room_type == "department":
            dept_name = (data.department or "").strip() or user["department"]
            if not dept_name:
                raise HTTPException(status_code=400, detail="Chưa xác định được phòng ban")

            if user["role"] == "user":
                raise HTTPException(status_code=403, detail="Chỉ admin hoặc trưởng phòng mới tạo được phòng phòng ban")
            if user["role"] == "head" and not _same_dept(dept_name, user["department"]):
                raise HTTPException(status_code=403, detail="Trưởng phòng chỉ có thể tạo phòng cho phòng ban của mình")

            existing = (
                db.query(ChatRoom)
                .filter(ChatRoom.type == "department", ChatRoom.department == dept_name)
                .first()
            )
            if existing:
                return {
                    "status": "success",
                    "data": {
                        "id": existing.id,
                        "type": existing.type,
                        "name": existing.name,
                        "department": existing.department,
                        "member_codes": _department_member_codes(db, dept_name),
                        "created_at": existing.created_at.isoformat() if existing.created_at else None,
                    },
                    "message": "Phòng phòng ban đã tồn tại",
                }

            room = ChatRoom(type="department", name=dept_name, department=dept_name, owner_code=user["employee_code"])
            db.add(room)
            db.commit()
            db.refresh(room)
            return {
                "status": "success",
                "data": {
                    "id": room.id,
                    "type": room.type,
                    "name": room.name,
                    "department": room.department,
                    "member_codes": _department_member_codes(db, dept_name),
                    "created_at": room.created_at.isoformat() if room.created_at else None,
                },
                "message": "Đã tạo phòng phòng ban",
            }

        # ── Direct / Group ───────────────────────────────────────
        valid = {
            r[0]
            for r in db.query(User.employee_code).filter(User.employee_code.in_(codes)).all()
        }
        missing = [c for c in codes if c not in valid]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Mã nhân viên không tồn tại: {', '.join(missing)}",
            )

        if room_type == "direct":
            if len(codes) != 2:
                raise HTTPException(status_code=400, detail="Chat cá nhân cần đúng hai người")
            pair_key = "chat-direct:" + ":".join(sorted(codes))
            db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": pair_key})
            candidates = (db.query(ChatRoomMember.room_id)
                .group_by(ChatRoomMember.room_id)
                .having(func.count() == 2)
                .having(func.count().filter(ChatRoomMember.employee_code.in_(codes)) == 2))
            existing = db.query(ChatRoom).filter(ChatRoom.type == "direct", ChatRoom.id.in_(candidates)).first()
            if existing:
                return {"status": "success", "data": {
                    "id": existing.id, "type": existing.type, "name": existing.name,
                    "member_codes": codes, "owner_code": existing.owner_code,
                    "created_at": existing.created_at.isoformat() if existing.created_at else None,
                }}
        if len(codes) > 500:
            raise HTTPException(status_code=400, detail="Nhóm hỗ trợ tối đa 500 thành viên")

        room = ChatRoom(
            type=room_type,
            name=(data.name or None) if room_type == "group" else None,
            owner_code=user["employee_code"],
        )
        db.add(room)
        db.flush()
        for code in codes:
            db.add(ChatRoomMember(room_id=room.id, employee_code=code))
        db.commit()
        db.refresh(room)

        return {
            "status": "success",
            "data": {
                "id": room.id,
                "type": room.type,
                "name": room.name,
                "department": room.department,
                "owner_code": room.owner_code,
                "member_codes": codes,
                "created_at": room.created_at.isoformat() if room.created_at else None,
            },
            "message": "Đã tạo phòng chat",
        }
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Quản lý phòng — đổi tên / xoá / thêm bớt thành viên
# ---------------------------------------------------------------------------
@router.get("/rooms/{room_id}/members")
def room_members(
    room_id: str,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    user = _normalize_user(user)

    db = SessionLocal()
    try:
        room = db.get(ChatRoom, room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Không tìm thấy phòng chat")
        if not _is_room_member(db, room, user["employee_code"]):
            raise HTTPException(status_code=403, detail="Bạn không phải thành viên của phòng chat này")

        codes = _room_member_codes(room_id)
        members = []
        if codes:
            online = _online_codes()
            rows = (
                db.query(Employee.employee_code, Employee.full_name, Employee.department, Employee.position)
                .filter(Employee.employee_code.in_(codes))
                .all()
            )
            info = {r.employee_code: r for r in rows}
            for code in codes:
                r = info.get(code)
                members.append({
                    "employee_code": code,
                    "full_name": r.full_name if r else code,
                    "department": r.department if r else "",
                    "position": r.position if r else "",
                    "is_owner": room.owner_code == code,
                    "online": code in online,
                })
        return {"status": "success", "data": members}
    finally:
        db.close()


@router.put("/rooms/{room_id}")
def rename_room(
    room_id: str,
    data: RoomRename,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    user = _normalize_user(user)

    name = (data.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tên phòng không được để trống")

    db = SessionLocal()
    try:
        room = db.get(ChatRoom, room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Không tìm thấy phòng chat")
        if room.type == "direct":
            raise HTTPException(status_code=400, detail="Phòng 1-1 không thể đổi tên")
        if not _can_manage_room(user, room):
            raise HTTPException(status_code=403, detail="Bạn không có quyền đổi tên phòng này")

        room.name = name
        if room.type == "department":
            room.department = name
        db.commit()
        return {"status": "success", "message": "Đã đổi tên phòng", "name": name}
    finally:
        db.close()


@router.delete("/rooms/{room_id}")
def delete_room(
    room_id: str,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    user = _normalize_user(user)

    db = SessionLocal()
    try:
        room = db.get(ChatRoom, room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Không tìm thấy phòng chat")
        if not _can_manage_room(user, room):
            raise HTTPException(status_code=403, detail="Bạn không có quyền xoá phòng này")

        db.delete(room)
        db.commit()
        invalidate_room_member_cache(room_id)
        return {"status": "success", "message": "Đã xoá phòng chat"}
    finally:
        db.close()


@router.post("/rooms/{room_id}/members")
def add_room_members(
    room_id: str,
    data: MemberUpdate,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    user = _normalize_user(user)

    codes = list(dict.fromkeys(c.strip() for c in data.employee_codes if c and c.strip()))
    if not codes:
        raise HTTPException(status_code=400, detail="Chưa chọn thành viên để thêm")

    db = SessionLocal()
    try:
        room = db.get(ChatRoom, room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Không tìm thấy phòng chat")
        if room.type in ("direct", "department"):
            raise HTTPException(status_code=400, detail="Chỉ phòng nhóm mới thêm/bớt thành viên thủ công")
        if not _can_manage_room(user, room):
            raise HTTPException(status_code=403, detail="Bạn không có quyền thêm thành viên")

        db.query(ChatRoom).filter(ChatRoom.id == room_id).with_for_update().one()
        current_codes = {r[0] for r in db.query(ChatRoomMember.employee_code).filter(ChatRoomMember.room_id == room_id).all()}
        if len(current_codes.union(codes)) > 500:
            raise HTTPException(status_code=400, detail="Nhóm hỗ trợ tối đa 500 thành viên")

        valid = {r[0] for r in db.query(User.employee_code).filter(User.employee_code.in_(codes)).all()}
        missing = [c for c in codes if c not in valid]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Mã nhân viên không tồn tại: {', '.join(missing)}",
            )

        existing = {
            r[0]
            for r in db.query(ChatRoomMember.employee_code)
            .filter(ChatRoomMember.room_id == room_id, ChatRoomMember.employee_code.in_(codes))
            .all()
        }
        added = 0
        for code in codes:
            if code in existing:
                continue
            db.add(ChatRoomMember(room_id=room.id, employee_code=code))
            added += 1
        db.commit()
        invalidate_room_member_cache(room_id)
        return {
            "status": "success",
            "message": f"Đã thêm {added} thành viên",
            "member_codes": _room_member_codes(room.id, use_cache=False),
        }
    finally:
        db.close()


@router.delete("/rooms/{room_id}/members/{employee_code}")
def remove_room_member(
    room_id: str,
    employee_code: str,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    user = _normalize_user(user)

    db = SessionLocal()
    try:
        room = db.get(ChatRoom, room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Không tìm thấy phòng chat")
        if room.type in ("direct", "department"):
            raise HTTPException(status_code=400, detail="Chỉ phòng nhóm mới thêm/bớt thành viên thủ công")
        if not _can_manage_room(user, room):
            raise HTTPException(status_code=403, detail="Bạn không có quyền xoá thành viên")
        if room.owner_code == employee_code:
            raise HTTPException(status_code=400, detail="Không thể xoá chủ nhóm khỏi nhóm")

        db.query(ChatRoomMember).filter(
            ChatRoomMember.room_id == room_id,
            ChatRoomMember.employee_code == employee_code,
        ).delete()
        db.commit()
        invalidate_room_member_cache(room_id)
        return {
            "status": "success",
            "message": "Đã xoá thành viên",
            "member_codes": _room_member_codes(room.id, use_cache=False),
        }
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Ghim tin nhắn quan trọng lên header box chat
# ---------------------------------------------------------------------------
@router.get("/rooms/{room_id}/pinned")
def get_pinned_messages(
    room_id: str,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    user = _normalize_user(user)

    db = SessionLocal()
    try:
        room = db.get(ChatRoom, room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Không tìm thấy phòng chat")
        if not _is_room_member(db, room, user["employee_code"]):
            raise HTTPException(status_code=403, detail="Bạn không phải thành viên của phòng chat này")
        return {"status": "success", "data": _pinned_messages(db, room_id)}
    finally:
        db.close()


@router.put("/messages/{message_id}/pin")
async def pin_message(
    message_id: str,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    user = _normalize_user(user)

    db = SessionLocal()
    try:
        msg = db.get(ChatMessage, message_id)
        if not msg:
            raise HTTPException(status_code=404, detail="Không tìm thấy tin nhắn")
        room = db.get(ChatRoom, msg.room_id)
        if not _is_room_member(db, room, user["employee_code"]):
            raise HTTPException(status_code=403, detail="Bạn không phải thành viên của phòng chat này")

        msg.is_pinned = 1
        msg.pinned_by = user["employee_code"]
        msg.pinned_at = datetime.utcnow()
        db.commit()

        payload = {"event": "pin_updated", "room_id": msg.room_id, "pinned": _pinned_messages(db, msg.room_id)}
        await manager.broadcast_to_room(payload, _room_member_codes(msg.room_id))
        return {"status": "success", "data": payload["pinned"], "message": "Đã ghim tin nhắn"}
    finally:
        db.close()


@router.delete("/messages/{message_id}/pin")
async def unpin_message(
    message_id: str,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    user = _normalize_user(user)

    db = SessionLocal()
    try:
        msg = db.get(ChatMessage, message_id)
        if not msg:
            raise HTTPException(status_code=404, detail="Không tìm thấy tin nhắn")
        room = db.get(ChatRoom, msg.room_id)
        if not _is_room_member(db, room, user["employee_code"]):
            raise HTTPException(status_code=403, detail="Bạn không phải thành viên của phòng chat này")
        if msg.pinned_by != user["employee_code"] and not _can_manage_room(user, room):
            raise HTTPException(status_code=403, detail="Chỉ người ghim hoặc người quản lý phòng mới bỏ ghim được")

        msg.is_pinned = 0
        msg.pinned_by = None
        msg.pinned_at = None
        db.commit()

        payload = {"event": "pin_updated", "room_id": msg.room_id, "pinned": _pinned_messages(db, msg.room_id)}
        await manager.broadcast_to_room(payload, _room_member_codes(msg.room_id))
        return {"status": "success", "data": payload["pinned"], "message": "Đã bỏ ghim tin nhắn"}
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Upload & serve file đính kèm (ảnh / pdf / xlsx)
# ---------------------------------------------------------------------------
@router.post("/upload", status_code=201)
async def upload_chat_file(
    file: UploadFile = File(...),
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)

    result = await save_chat_upload(file)
    result["file_url"] = signed_file_url(result["file_url"])
    return {
        "status": "success",
        "data": result,
        "message": "File đã được tải lên",
    }


@router.get("/uploads/{filename}")
def serve_chat_file(filename: str, expires: int = Query(0), signature: str = Query("", max_length=64)):
    if not verify_file_signature(filename, expires, signature):
        raise HTTPException(status_code=403, detail="Liên kết hết hạn hoặc không hợp lệ; mở lại phòng chat")
    file_path = os.path.join(CHAT_UPLOAD_BASE, filename)

    # Security: prevent path traversal
    real_path = os.path.realpath(file_path)
    real_base = os.path.realpath(CHAT_UPLOAD_BASE)
    if os.path.commonpath([real_path, real_base]) != real_base:
        raise HTTPException(status_code=400, detail="Đường dẫn file không hợp lệ")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File không tồn tại")

    return FileResponse(file_path, filename=filename, headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})
