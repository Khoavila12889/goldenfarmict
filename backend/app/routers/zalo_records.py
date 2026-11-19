"""Module "Thông báo Zalo" (key: zalo-records).

Nơi lưu + xem các thông báo bot Zalo cá nhân (zca-js, /home/zalo-personal-bot)
trích từ các group Zalo thuộc danh sách bắt tin ZALO_CAPTURE_GROUPS của bot.
Song sinh của module "Thông báo WhatsApp" (wa_records.py) — cùng khuôn:

- Ingest (bot -> app): POST /api/zalo-records/ingest, xác thực CHỈ bằng header
  X-Bot-Secret so với biến môi trường ZALO_BOT_SECRET (file .env.zalo trên
  server, không nằm trong git). Không dùng session người dùng cho đường này.
  Ingest IDEMPOTENT theo msg_id (cột UNIQUE): relay gửi lại cùng một tin sẽ
  nhận 200 kèm id của dòng đã có và cờ duplicate=true, không tạo trùng.
- Đọc/ghi (app): GET list/detail + PATCH status, xác thực bằng session
  X-User-* như các router khác. Quyền do trang Phân quyền quyết định hoàn
  toàn (module "zalo-records": xem cần can_view, sửa trạng thái cần can_edit;
  admin luôn được phép). Giai đoạn phát triển chỉ cấp cho admin — trưởng/
  phó phòng và user thường bị 403 cho tới khi admin cấp quyền ở Phân quyền.

Khác phía WhatsApp: v1 chỉ có MỘT loại bản ghi 'thongbao' (thông báo chính
thức do bot phân loại bằng LLM phía Zalo) và KHÔNG có định tuyến đăng thẳng
Dashboard — mọi thông báo đều vào module này chờ admin xem.

Hợp đồng ingest: docs/zalo_ingest_contract.md.
"""
import hmac
import os
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query

from ..core.auth import verify_session
from ..core.db import execute, fetchall, fetchone, insert
from .auth import _get_effective_permissions

router = APIRouter(prefix="/api/zalo-records", tags=["zalo-records"])

RECORD_TYPES = ("thongbao",)
STATUSES = ("moi", "daxuly", "huy")
MAX_PAGE_SIZE = 100

_COLS = """
    id, record_type, sender_name, sender_phone, sender_id, group_name,
    group_id, title, content, raw_message, msg_id, source, status, created_at
"""


# ---------------------------------------------------------------------------
# Xác thực
# ---------------------------------------------------------------------------

def _require_bot_secret(x_bot_secret: Optional[str]) -> None:
    expected = (os.environ.get("ZALO_BOT_SECRET") or "").strip()
    if not expected:
        raise HTTPException(503, "Ingest chưa được cấu hình (thiếu ZALO_BOT_SECRET trên server)")
    if not x_bot_secret or not hmac.compare_digest(x_bot_secret.strip(), expected):
        raise HTTPException(401, "Bot secret không hợp lệ")


def _require_zalo_user(
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
    perm = perms.get("zalo-records") or {}
    if need_edit:
        allowed = bool(perm.get("can_edit"))
    else:
        allowed = bool(perm.get("can_view") or perm.get("can_edit"))
    if not allowed:
        raise HTTPException(403, "Bạn không có quyền truy cập module Thông báo Zalo")
    return user


def _auth(
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
) -> dict:
    return _require_zalo_user(x_user_code, x_user_role, x_user_dept, x_user_token)


def _auth_edit(
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
) -> dict:
    return _require_zalo_user(x_user_code, x_user_role, x_user_dept, x_user_token, need_edit=True)


# ---------------------------------------------------------------------------
# Ingest — bot Zalo ghi bản ghi (idempotent theo msg_id)
# ---------------------------------------------------------------------------

@router.post("/ingest")
def ingest_record(body: dict, x_bot_secret: Optional[str] = Header(None, alias="X-Bot-Secret")):
    _require_bot_secret(x_bot_secret)
    if not isinstance(body, dict):
        raise HTTPException(400, "Body phải là JSON object")

    record_type = (body.get("record_type") or "").strip()
    if record_type not in RECORD_TYPES:
        raise HTTPException(400, f"record_type phải thuộc {list(RECORD_TYPES)}")

    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(400, "Thông báo (thongbao) thiếu title")
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(400, "Thông báo (thongbao) thiếu content")

    msg_id = (body.get("msg_id") or "").strip() or None

    # Idempotent: relay gửi lại cùng msg_id -> trả id cũ, không tạo trùng.
    if msg_id:
        existing = fetchone(
            "SELECT id FROM zalo_records WHERE msg_id = :msg_id",
            {"msg_id": msg_id},
        )
        if existing:
            return {"success": True, "id": existing["id"], "duplicate": True}

    params = {
        "rtype": record_type,
        "sender_name": (body.get("sender_name") or "").strip(),
        "sender_phone": (body.get("sender_phone") or "").strip(),
        "sender_id": (body.get("sender_id") or "").strip(),
        "group_name": (body.get("group_name") or "").strip(),
        "group_id": (body.get("group_id") or "").strip(),
        "title": title,
        "content": content,
        "raw_message": body.get("raw_message") or "",
        "msg_id": msg_id,
        "source": (body.get("source") or "zalo-bot").strip() or "zalo-bot",
    }
    try:
        new_id = insert(
            """
            INSERT INTO zalo_records
                (record_type, sender_name, sender_phone, sender_id, group_name,
                 group_id, title, content, raw_message, msg_id, source)
            VALUES
                (:rtype, :sender_name, :sender_phone, :sender_id, :group_name,
                 :group_id, :title, :content, :raw_message, :msg_id, :source)
            RETURNING id
            """,
            params,
        )
    except Exception:
        # Đua nhau trên cùng msg_id (hai request song song): dòng thắng đã
        # nằm trong DB — trả duplicate thay vì 500.
        if msg_id:
            existing = fetchone(
                "SELECT id FROM zalo_records WHERE msg_id = :msg_id",
                {"msg_id": msg_id},
            )
            if existing:
                return {"success": True, "id": existing["id"], "duplicate": True}
        raise
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
        where.append("(title ILIKE :q OR content ILIKE :q OR sender_name ILIKE :q OR group_name ILIKE :q)")
        params["q"] = f"%{q.strip()}%"
    if date_from.strip():
        where.append("created_at >= :dfrom")
        params["dfrom"] = date_from.strip()
    if date_to.strip():
        where.append("created_at < (:dto)::date + INTERVAL '1 day'")
        params["dto"] = date_to.strip()

    where_sql = " AND ".join(where)
    total_row = fetchone(f"SELECT COUNT(*) AS total FROM zalo_records WHERE {where_sql}", params)
    total = int((total_row or {}).get("total", 0))

    params["limit"] = page_size
    params["offset"] = (page - 1) * page_size
    rows = fetchall(
        f"""
        SELECT {_COLS} FROM zalo_records
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
    row = fetchone(f"SELECT {_COLS} FROM zalo_records WHERE id = :id", {"id": record_id})
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
    row = fetchone("SELECT id FROM zalo_records WHERE id = :id", {"id": record_id})
    if not row:
        raise HTTPException(404, "Không tìm thấy bản ghi")
    execute("UPDATE zalo_records SET status = :status WHERE id = :id", {"status": status, "id": record_id})
    updated = fetchone(f"SELECT {_COLS} FROM zalo_records WHERE id = :id", {"id": record_id})
    return {"success": True, "data": updated}
