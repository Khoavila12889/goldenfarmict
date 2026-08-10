"""
Router Chat Nội bộ — WebSocket + REST API.

Hoạt động ĐỘC LẬP với hệ thống SSE (`core/events.py`).
- Realtime:   WS `/api/chat/ws?token=...&employee_code=...`
- REST:       `GET /api/chat/rooms`, `GET /api/chat/messages/{room_id}`,
              `POST /api/chat/rooms`
"""
import os
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Header, Query, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.core.auth import verify_session, verify_token
from app.core.chat_ws import ConnectionManager
from app.core.session import SessionLocal
from app.models import ChatRoom, ChatRoomMember, ChatMessage, Employee, User
from app.services.upload_service import save_chat_upload, CHAT_UPLOAD_BASE


class RoomCreate(BaseModel):
    type: str = "direct"
    name: Optional[str] = None
    department: Optional[str] = None
    member_codes: List[str] = []


class RoomRename(BaseModel):
    name: str


class MemberUpdate(BaseModel):
    employee_codes: List[str] = []


router = APIRouter(prefix="/api/chat", tags=["chat"])
manager = ConnectionManager()

_CLOSE_CODE_UNAUTHORIZED = 1008


def _normalize_user(u: dict) -> dict:
    """Chuẩn hoá dict user từ verify_session (REST) và _resolve_ws_user (WS)."""
    return {
        "employee_code": u.get("user_code") or u.get("employee_code") or "",
        "role": u.get("user_role") or u.get("role") or "user",
        "department": u.get("department") or "",
        "full_name": u.get("full_name") or "",
    }


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
        "attachment_url": msg.attachment_url,
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


def _room_member_codes(room_id: str) -> List[str]:
    db = SessionLocal()
    try:
        room = db.get(ChatRoom, room_id)
        if not room:
            return []
        if room.type == "department":
            return _department_member_codes(db, room.department or "")
        rows = db.query(ChatRoomMember.employee_code).filter(ChatRoomMember.room_id == room_id).all()
        return [r[0] for r in rows]
    finally:
        db.close()


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


def _handle_incoming_message(user: dict, data: dict) -> Optional[dict]:
    """Lưu tin nhắn vào DB và trả về payload đã serialize để broadcast."""
    if not isinstance(data, dict):
        return None
    room_id = (data.get("room_id") or "").strip()
    content = (data.get("content") or "").strip()
    attachment_url = (data.get("attachment_url") or "").strip() or None
    attachment_name = (data.get("attachment_name") or "").strip() or None
    attachment_type = (data.get("attachment_type") or "").strip() or None
    attachment_size = data.get("attachment_size")

    if not room_id:
        return None
    if not content and not attachment_url:
        return None

    db = SessionLocal()
    try:
        room = db.get(ChatRoom, room_id)
        if not room:
            return None
        if not _is_room_member(db, room, user["employee_code"]):
            return None

        msg = ChatMessage(
            room_id=room_id,
            sender_id=user["employee_code"],
            content=content,
            attachment_url=attachment_url,
            attachment_name=attachment_name,
            attachment_type=attachment_type,
            attachment_size=attachment_size,
        )
        db.add(msg)
        db.commit()
        db.refresh(msg)
        return _serialize_message(msg, user["full_name"])
    except Exception:
        db.rollback()
        return None
    finally:
        db.close()


# ---------------------------------------------------------------------------
# WebSocket — realtime chat
# ---------------------------------------------------------------------------
@router.websocket("/ws")
async def chat_ws(
    websocket: WebSocket,
    token: str = Query(default=""),
    employee_code: str = Query(default=""),
):
    user = _resolve_ws_user(employee_code.strip(), token.strip())
    if user is None:
        await websocket.close(code=_CLOSE_CODE_UNAUTHORIZED)
        return

    await manager.connect(websocket, user["employee_code"])
    try:
        await _broadcast_presence(user["employee_code"], True)
        while True:
            data = await websocket.receive_json()
            message = _handle_incoming_message(user, data)
            if message:
                await manager.broadcast_to_room(message, _room_member_codes(message["room_id"]))
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"Chat WS error ({user['employee_code']}): {e}")
    finally:
        await manager.disconnect(user["employee_code"])
        await _broadcast_presence(user["employee_code"], False)


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

        rows = db.query(ChatRoom).all()
        rooms = []
        online = _online_codes()
        for room in rows:
            if not _is_room_member(db, room, user["employee_code"]):
                continue
            member_codes = _room_member_codes(room.id)
            last_msg = (
                db.query(ChatMessage)
                .filter(ChatMessage.room_id == room.id)
                .order_by(ChatMessage.created_at.desc())
                .first()
            )
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
                    _serialize_message(last_msg, _sender_name(db, last_msg.sender_id))
                    if last_msg else None
                ),
                "created_at": room.created_at.isoformat() if room.created_at else None,
            })
        rooms.sort(key=lambda r: r["created_at"] or "", reverse=True)
        return {"status": "success", "data": rooms}
    finally:
        db.close()


@router.get("/messages/{room_id}")
def get_messages(
    room_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
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

        rows = (
            db.query(ChatMessage)
            .filter(ChatMessage.room_id == room_id)
            .order_by(ChatMessage.created_at.asc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        messages = [_serialize_message(m, _sender_name(db, m.sender_id)) for m in rows]
        return {"status": "success", "data": messages}
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
        return {
            "status": "success",
            "message": f"Đã thêm {added} thành viên",
            "member_codes": _room_member_codes(room.id),
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
        return {
            "status": "success",
            "message": "Đã xoá thành viên",
            "member_codes": _room_member_codes(room.id),
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
    return {
        "status": "success",
        "data": result,
        "message": "File đã được tải lên",
    }


@router.get("/uploads/{filename}")
def serve_chat_file(filename: str):
    file_path = os.path.join(CHAT_UPLOAD_BASE, filename)

    # Security: prevent path traversal
    real_path = os.path.realpath(file_path)
    real_base = os.path.realpath(CHAT_UPLOAD_BASE)
    if not real_path.startswith(real_base):
        raise HTTPException(status_code=400, detail="Đường dẫn file không hợp lệ")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File không tồn tại")

    return FileResponse(file_path, filename=filename)
