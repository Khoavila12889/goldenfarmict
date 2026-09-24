"""Archive and restore chat messages by a Vietnam-local date range.

Each ZIP contains room/member/message rows and referenced attachments. Rooms
are kept active; messages are deleted only after the ZIP is verified.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
import uuid
import zipfile
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Iterable, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import func

from app.core.session import SessionLocal
from app.models import ChatMessage, ChatRoom, ChatRoomMember, User
from app.services.upload_service import CHAT_UPLOAD_BASE


ARCHIVE_VERSION = 2
LOCAL_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
CHAT_ARCHIVE_BASE = Path(os.environ.get(
    "CHAT_ARCHIVE_DIR",
    str(Path(__file__).resolve().parents[2] / "storage" / "chat-archives"),
))
_SAFE_ARCHIVE_NAME = re.compile(r"^chat-archive-[0-9TZ-]+-[0-9a-f]{8}\.zip$")


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    return datetime.fromisoformat(value) if value else None


def _parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Ngày phải có định dạng YYYY-MM-DD") from exc


def _utc_bounds(start_date: str, end_date: str) -> tuple[date, date, datetime, datetime]:
    """Convert an inclusive Vietnam-local date range to half-open naive UTC."""
    start = _parse_date(start_date)
    end = _parse_date(end_date)
    if end < start:
        raise ValueError("Ngày kết thúc phải bằng hoặc sau ngày bắt đầu")
    if end >= datetime.now(LOCAL_TZ).date():
        raise ValueError("Chỉ được backup đến hết ngày hôm qua để tránh tin nhắn đang phát sinh")
    if (end - start).days > 366:
        raise ValueError("Mỗi lần backup tối đa 367 ngày")
    start_local = datetime.combine(start, time.min, tzinfo=LOCAL_TZ)
    end_local = datetime.combine(end + timedelta(days=1), time.min, tzinfo=LOCAL_TZ)
    start_utc = start_local.astimezone(timezone.utc).replace(tzinfo=None)
    end_utc = end_local.astimezone(timezone.utc).replace(tzinfo=None)
    return start, end, start_utc, end_utc


def _room_types(room_types: Iterable[str]) -> list[str]:
    result = sorted(set(room_types) & {"direct", "group"})
    if not result:
        raise ValueError("Chọn ít nhất một loại phòng chat 1-1 hoặc nhóm")
    return result


def _stored_attachment_name(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    name = Path(url.split("?", 1)[0]).name
    if not name or name in (".", "..") or Path(name).name != name:
        return None
    return name


def _archive_path(filename: str) -> Path:
    if not _SAFE_ARCHIVE_NAME.fullmatch(filename or ""):
        raise ValueError("Tên bản lưu không hợp lệ")
    return CHAT_ARCHIVE_BASE / filename


def preview_message_archive(start_date: str, end_date: str, room_types: Iterable[str]) -> dict:
    start, end, start_utc, end_utc = _utc_bounds(start_date, end_date)
    allowed_types = _room_types(room_types)
    db = SessionLocal()
    try:
        rows = (
            db.query(
                ChatRoom.id, ChatRoom.type, ChatRoom.name,
                func.count(ChatMessage.id).label("message_count"),
                func.min(ChatMessage.created_at).label("first_message_at"),
                func.max(ChatMessage.created_at).label("last_message_at"),
            )
            .join(ChatMessage, ChatMessage.room_id == ChatRoom.id)
            .filter(ChatRoom.type.in_(allowed_types))
            .filter(ChatMessage.created_at >= start_utc, ChatMessage.created_at < end_utc)
            .group_by(ChatRoom.id, ChatRoom.type, ChatRoom.name)
            .order_by(func.count(ChatMessage.id).desc())
            .all()
        )
        rooms = [{
            "id": row.id, "type": row.type, "name": row.name,
            "message_count": int(row.message_count),
            "first_message_at": _iso(row.first_message_at),
            "last_message_at": _iso(row.last_message_at),
        } for row in rows]
        return {
            "start_date": start.isoformat(), "end_date": end.isoformat(),
            "room_types": allowed_types, "rooms": rooms,
            "room_count": len(rooms),
            "message_count": sum(room["message_count"] for room in rooms),
        }
    finally:
        db.close()


def _manifest_for_messages(db, start_date: str, end_date: str, start_utc: datetime,
                           end_utc: datetime, allowed_types: list[str]):
    messages = (
        db.query(ChatMessage)
        .join(ChatRoom, ChatRoom.id == ChatMessage.room_id)
        .filter(ChatRoom.type.in_(allowed_types))
        .filter(ChatMessage.created_at >= start_utc, ChatMessage.created_at < end_utc)
        .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
        .all()
    )
    room_ids = sorted({message.room_id for message in messages})
    rooms = db.query(ChatRoom).filter(ChatRoom.id.in_(room_ids)).all() if room_ids else []
    members = db.query(ChatRoomMember).filter(ChatRoomMember.room_id.in_(room_ids)).all() if room_ids else []
    attachments = []
    missing_attachments = []
    for message in messages:
        stored_name = _stored_attachment_name(message.attachment_url)
        if not stored_name:
            continue
        source = Path(CHAT_UPLOAD_BASE) / stored_name
        if source.is_file():
            attachments.append((source, stored_name))
        else:
            missing_attachments.append(stored_name)

    manifest = {
        "format": "goldenfarm-chat-archive", "version": ARCHIVE_VERSION,
        "created_at": datetime.utcnow().isoformat(), "timezone": str(LOCAL_TZ),
        "start_date": start_date, "end_date": end_date, "room_types": allowed_types,
        "rooms": [{
            "id": room.id, "type": room.type, "name": room.name,
            "department": room.department, "owner_code": room.owner_code,
            "created_at": _iso(room.created_at),
        } for room in rooms],
        "members": [{
            "room_id": member.room_id, "employee_code": member.employee_code,
            "created_at": _iso(member.created_at),
        } for member in members],
        "messages": [{
            "id": message.id, "room_id": message.room_id, "sender_id": message.sender_id,
            "content": message.content, "attachment_url": message.attachment_url,
            "attachment_name": message.attachment_name, "attachment_type": message.attachment_type,
            "attachment_size": message.attachment_size, "is_pinned": int(message.is_pinned or 0),
            "pinned_by": message.pinned_by, "pinned_at": _iso(message.pinned_at),
            "created_at": _iso(message.created_at),
        } for message in messages],
        "missing_attachments": sorted(set(missing_attachments)),
    }
    return manifest, attachments, [message.id for message in messages]


def archive_messages(start_date: str, end_date: str, room_types: Iterable[str]) -> dict:
    start, end, start_utc, end_utc = _utc_bounds(start_date, end_date)
    allowed_types = _room_types(room_types)
    CHAT_ARCHIVE_BASE.mkdir(parents=True, exist_ok=True)
    filename = (
        f"chat-archive-{start.isoformat()}-{end.isoformat()}-"
        f"{datetime.utcnow().strftime('%Y-%m-%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}.zip"
    )
    destination = CHAT_ARCHIVE_BASE / filename
    temp_path = None
    database_committed = False
    db = SessionLocal()
    try:
        manifest, attachments, message_ids = _manifest_for_messages(
            db, start.isoformat(), end.isoformat(), start_utc, end_utc, allowed_types
        )
        if not message_ids:
            return {"start_date": start.isoformat(), "end_date": end.isoformat(),
                    "room_count": 0, "message_count": 0, "filename": None, "size": 0}

        fd, raw_temp = tempfile.mkstemp(prefix=".chat-archive-", suffix=".zip", dir=CHAT_ARCHIVE_BASE)
        os.close(fd)
        temp_path = Path(raw_temp)
        with zipfile.ZipFile(temp_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
            seen = set()
            for source, stored_name in attachments:
                if stored_name not in seen:
                    archive.write(source, f"attachments/{stored_name}")
                    seen.add(stored_name)
        with zipfile.ZipFile(temp_path, "r") as archive:
            if archive.testzip() is not None:
                raise RuntimeError("Không thể xác minh gói lưu trữ vừa tạo")
        os.replace(temp_path, destination)
        temp_path = None

        deleted = db.query(ChatMessage).filter(ChatMessage.id.in_(message_ids)).delete(synchronize_session=False)
        if deleted != len(message_ids):
            raise RuntimeError("Số tin nhắn chuẩn bị xóa không khớp với backup")
        db.commit()
        database_committed = True

        removed_files = 0
        cleanup_errors = []
        for source, stored_name in attachments:
            still_used = db.query(ChatMessage.id).filter(ChatMessage.attachment_url.like(f"%/{stored_name}")).first()
            if not still_used and source.exists():
                try:
                    source.unlink()
                    removed_files += 1
                except OSError:
                    cleanup_errors.append(stored_name)
        return {
            "start_date": start.isoformat(), "end_date": end.isoformat(),
            "room_count": len(manifest["rooms"]), "message_count": len(message_ids),
            "filename": filename, "size": destination.stat().st_size,
            "missing_attachments": manifest["missing_attachments"],
            "removed_attachment_files": removed_files,
            "attachment_cleanup_errors": cleanup_errors,
        }
    except Exception:
        db.rollback()
        if not database_committed and destination.exists():
            destination.unlink()
        raise
    finally:
        if temp_path and temp_path.exists():
            temp_path.unlink()
        db.close()


def _read_manifest(path: Path) -> dict:
    with zipfile.ZipFile(path, "r") as archive:
        try:
            raw = archive.read("manifest.json")
        except KeyError as exc:
            raise ValueError("Gói backup thiếu manifest.json") from exc
    data = json.loads(raw.decode("utf-8"))
    if data.get("format") != "goldenfarm-chat-archive" or data.get("version") != ARCHIVE_VERSION:
        raise ValueError("Định dạng hoặc phiên bản backup không được hỗ trợ")
    return data


def list_archives() -> list[dict]:
    if not CHAT_ARCHIVE_BASE.exists():
        return []
    result = []
    for path in sorted(CHAT_ARCHIVE_BASE.glob("chat-archive-*.zip"), reverse=True):
        try:
            manifest = _read_manifest(path)
            result.append({
                "filename": path.name, "size": path.stat().st_size,
                "created_at": manifest.get("created_at"),
                "start_date": manifest.get("start_date"), "end_date": manifest.get("end_date"),
                "room_count": len(manifest.get("rooms", [])),
                "message_count": len(manifest.get("messages", [])),
                "missing_attachments": len(manifest.get("missing_attachments", [])),
            })
        except Exception as exc:
            result.append({"filename": path.name, "size": path.stat().st_size, "error": str(exc)})
    return result


def restore_archive(filename: str) -> dict:
    path = _archive_path(filename)
    if not path.is_file():
        raise FileNotFoundError("Không tìm thấy bản backup")
    manifest = _read_manifest(path)
    db = SessionLocal()
    copied_files = []
    try:
        valid_users = {row[0] for row in db.query(User.employee_code).all()}
        existing_room_ids = {row[0] for row in db.query(ChatRoom.id).all()}
        created_room_ids = set()
        for row in manifest.get("rooms", []):
            if row["id"] in existing_room_ids:
                continue
            db.add(ChatRoom(
                id=row["id"], type=row["type"], name=row.get("name"), department=row.get("department"),
                owner_code=row.get("owner_code") if row.get("owner_code") in valid_users else None,
                created_at=_parse_dt(row.get("created_at")) or datetime.utcnow(),
            ))
            created_room_ids.add(row["id"])
        db.flush()
        restored_members = 0
        for row in manifest.get("members", []):
            if row["room_id"] not in created_room_ids or row.get("employee_code") not in valid_users:
                continue
            db.add(ChatRoomMember(
                room_id=row["room_id"], employee_code=row["employee_code"],
                created_at=_parse_dt(row.get("created_at")) or datetime.utcnow(),
            ))
            restored_members += 1

        message_rows = manifest.get("messages", [])
        message_ids = [row["id"] for row in message_rows]
        existing_message_ids = ({row[0] for row in db.query(ChatMessage.id)
                                 .filter(ChatMessage.id.in_(message_ids)).all()} if message_ids else set())
        restored_messages = 0
        for row in message_rows:
            if row["id"] in existing_message_ids:
                continue
            db.add(ChatMessage(
                id=row["id"], room_id=row["room_id"],
                sender_id=row.get("sender_id") if row.get("sender_id") in valid_users else None,
                content=row.get("content") or "", attachment_url=row.get("attachment_url"),
                attachment_name=row.get("attachment_name"), attachment_type=row.get("attachment_type"),
                attachment_size=row.get("attachment_size"), is_pinned=int(row.get("is_pinned") or 0),
                pinned_by=row.get("pinned_by"), pinned_at=_parse_dt(row.get("pinned_at")),
                created_at=_parse_dt(row.get("created_at")) or datetime.utcnow(),
            ))
            restored_messages += 1
        db.flush()

        Path(CHAT_UPLOAD_BASE).mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(path, "r") as archive:
            for member in archive.infolist():
                if not member.filename.startswith("attachments/") or member.is_dir():
                    continue
                stored_name = Path(member.filename).name
                if not stored_name or member.filename != f"attachments/{stored_name}":
                    raise ValueError("Đường dẫn file trong backup không hợp lệ")
                target = Path(CHAT_UPLOAD_BASE) / stored_name
                if target.exists():
                    continue
                with archive.open(member) as source, target.open("xb") as output:
                    shutil.copyfileobj(source, output)
                copied_files.append(target)
        db.commit()
        return {
            "filename": filename, "start_date": manifest.get("start_date"), "end_date": manifest.get("end_date"),
            "room_count": len(manifest.get("rooms", [])), "created_room_count": len(created_room_ids),
            "message_count": restored_messages, "skipped_message_count": len(existing_message_ids),
            "member_count": restored_members, "attachment_count": len(copied_files),
        }
    except Exception:
        db.rollback()
        for copied_path in copied_files:
            copied_path.unlink(missing_ok=True)
        raise
    finally:
        db.close()
