"""Module "Thông báo WhatsApp" (key: wa-records).

Nơi lưu + xem các bản ghi bot Hermes trích từ group WhatsApp (đặt lịch /
check-in vị trí / báo cáo). Hai mặt tách bạch:

- Ingest (bot -> app): POST /api/wa-records/ingest, xác thực CHỈ bằng header
  X-Bot-Secret so với biến môi trường WA_BOT_SECRET (file .env.wa trên server,
  không nằm trong git). Không dùng session người dùng cho đường này.
- Đọc/ghi (app): GET list/detail + PATCH status, xác thực bằng session
  X-User-* như các router khác. Quyền do trang Phân quyền quyết định hoàn
  toàn (module "wa-records": xem cần can_view, sửa trạng thái cần can_edit;
  admin luôn được phép). Giai đoạn phát triển chỉ cấp cho admin — trưởng/
  phó phòng và user thường bị 403 cho tới khi admin cấp quyền ở Phân quyền.

Hợp đồng ingest: docs/wa_ingest_contract.md.
"""
import hmac
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query

from ..core.auth import verify_session
from ..core.db import execute, fetchall, fetchone, insert
from .auth import _get_effective_permissions

router = APIRouter(prefix="/api/wa-records", tags=["wa-records"])

RECORD_TYPES = ("datlich", "checkin", "baocao")
STATUSES = ("moi", "daxuly", "huy")
MAX_PAGE_SIZE = 100

_COLS = """
    id, record_type, sender_name, sender_phone, group_name, title, content,
    scheduled_at, place, lat::float8 AS lat, lng::float8 AS lng,
    raw_message, source, status, created_at
"""


# ---------------------------------------------------------------------------
# Xác thực
# ---------------------------------------------------------------------------

def _require_bot_secret(x_bot_secret: Optional[str]) -> None:
    expected = (os.environ.get("WA_BOT_SECRET") or "").strip()
    if not expected:
        raise HTTPException(503, "Ingest chưa được cấu hình (thiếu WA_BOT_SECRET trên server)")
    if not x_bot_secret or not hmac.compare_digest(x_bot_secret.strip(), expected):
        raise HTTPException(401, "Bot secret không hợp lệ")


def _require_wa_user(
    x_user_code: Optional[str],
    x_user_role: Optional[str],
    x_user_dept: Optional[str],
    x_user_token: Optional[str],
    need_edit: bool = False,
) -> dict:
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    role = user["user_role"]
    if role == "admin":
        return user
    perms = _get_effective_permissions(user["user_code"])
    perm = perms.get("wa-records") or {}
    if need_edit:
        allowed = bool(perm.get("can_edit"))
    else:
        allowed = bool(perm.get("can_view") or perm.get("can_edit"))
    if not allowed:
        raise HTTPException(403, "Bạn không có quyền truy cập module Thông báo WhatsApp")
    return user


def _auth(
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
) -> dict:
    return _require_wa_user(x_user_code, x_user_role, x_user_dept, x_user_token)


def _auth_edit(
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
) -> dict:
    return _require_wa_user(x_user_code, x_user_role, x_user_dept, x_user_token, need_edit=True)


# ---------------------------------------------------------------------------
# Ingest — bot Hermes ghi bản ghi
# ---------------------------------------------------------------------------

def _parse_scheduled_at(value):
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if not isinstance(value, str):
        raise HTTPException(400, "scheduled_at phải là chuỗi ISO 8601")
    try:
        return datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(400, "scheduled_at không đúng định dạng ISO 8601")


def _parse_coord(value, field, lo, hi):
    if value is None or value == "":
        return None
    try:
        num = float(value)
    except (TypeError, ValueError):
        raise HTTPException(400, f"{field} phải là số")
    if not (lo <= num <= hi):
        raise HTTPException(400, f"{field} ngoài khoảng hợp lệ ({lo}..{hi})")
    return num


@router.post("/ingest")
def ingest_record(body: dict, x_bot_secret: Optional[str] = Header(None, alias="X-Bot-Secret")):
    _require_bot_secret(x_bot_secret)
    if not isinstance(body, dict):
        raise HTTPException(400, "Body phải là JSON object")

    record_type = (body.get("record_type") or "").strip()
    if record_type not in RECORD_TYPES:
        raise HTTPException(400, f"record_type phải thuộc {list(RECORD_TYPES)}")

    title = (body.get("title") or "").strip()
    content = (body.get("content") or "").strip()
    if not title and not content:
        raise HTTPException(400, "Thiếu nội dung bản ghi (title hoặc content)")

    scheduled_at = _parse_scheduled_at(body.get("scheduled_at"))
    lat = _parse_coord(body.get("lat"), "lat", -90, 90)
    lng = _parse_coord(body.get("lng"), "lng", -180, 180)
    if record_type == "checkin" and (lat is None or lng is None):
        raise HTTPException(400, "Bản ghi checkin bắt buộc có lat và lng")

    new_id = insert(
        """
        INSERT INTO wa_records
            (record_type, sender_name, sender_phone, group_name, title, content,
             scheduled_at, place, lat, lng, raw_message, source)
        VALUES
            (:rtype, :sender_name, :sender_phone, :group_name, :title, :content,
             :scheduled_at, :place, :lat, :lng, :raw_message, :source)
        RETURNING id
        """,
        {
            "rtype": record_type,
            "sender_name": (body.get("sender_name") or "").strip(),
            "sender_phone": (body.get("sender_phone") or "").strip(),
            "group_name": (body.get("group_name") or "").strip(),
            "title": title,
            "content": content,
            "scheduled_at": scheduled_at,
            "place": (body.get("place") or "").strip(),
            "lat": lat,
            "lng": lng,
            "raw_message": body.get("raw_message") or "",
            "source": (body.get("source") or "hermes").strip() or "hermes",
        },
    )
    return {"success": True, "id": new_id}


# ---------------------------------------------------------------------------
# Đọc / cập nhật trạng thái — người dùng trong app
# ---------------------------------------------------------------------------

@router.get("")
def list_records(
    record_type: str = Query(""),
    status: str = Query(""),
    q: str = Query(""),
    date_from: str = Query(""),
    date_to: str = Query(""),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    _auth(x_user_code, x_user_role, x_user_dept, x_user_token)

    where = ["1=1"]
    params: dict = {}
    if record_type:
        if record_type not in RECORD_TYPES:
            raise HTTPException(400, f"record_type phải thuộc {list(RECORD_TYPES)}")
        where.append("record_type = :rtype")
        params["rtype"] = record_type
    if status:
        if status not in STATUSES:
            raise HTTPException(400, f"status phải thuộc {list(STATUSES)}")
        where.append("status = :status")
        params["status"] = status
    if q.strip():
        where.append("(title ILIKE :q OR content ILIKE :q OR sender_name ILIKE :q OR place ILIKE :q OR group_name ILIKE :q)")
        params["q"] = f"%{q.strip()}%"
    if date_from.strip():
        where.append("created_at >= :dfrom")
        params["dfrom"] = date_from.strip()
    if date_to.strip():
        where.append("created_at < (:dto)::date + INTERVAL '1 day'")
        params["dto"] = date_to.strip()

    where_sql = " AND ".join(where)
    total_row = fetchone(f"SELECT COUNT(*) AS total FROM wa_records WHERE {where_sql}", params)
    total = int((total_row or {}).get("total", 0))

    params["limit"] = page_size
    params["offset"] = (page - 1) * page_size
    rows = fetchall(
        f"""
        SELECT {_COLS} FROM wa_records
        WHERE {where_sql}
        ORDER BY created_at DESC, id DESC
        LIMIT :limit OFFSET :offset
        """,
        params,
    )
    return {"data": rows, "total": total, "page": page, "page_size": page_size}


@router.get("/{record_id}")
def get_record(
    record_id: int,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    _auth(x_user_code, x_user_role, x_user_dept, x_user_token)
    row = fetchone(f"SELECT {_COLS} FROM wa_records WHERE id = :id", {"id": record_id})
    if not row:
        raise HTTPException(404, "Không tìm thấy bản ghi")
    return {"data": row}


@router.patch("/{record_id}/status")
def update_status(
    record_id: int,
    body: dict,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    _auth_edit(x_user_code, x_user_role, x_user_dept, x_user_token)
    status = (body or {}).get("status", "")
    if status not in STATUSES:
        raise HTTPException(400, f"status phải thuộc {list(STATUSES)}")
    row = fetchone("SELECT id FROM wa_records WHERE id = :id", {"id": record_id})
    if not row:
        raise HTTPException(404, "Không tìm thấy bản ghi")
    execute("UPDATE wa_records SET status = :status WHERE id = :id", {"status": status, "id": record_id})
    updated = fetchone(f"SELECT {_COLS} FROM wa_records WHERE id = :id", {"id": record_id})
    return {"success": True, "data": updated}
