"""Module Mail — lớp email client kiểu Outlook trên nền FastAPI hiện có.

P0/P1: tài khoản IMAP/SMTP, đồng bộ thư, folder/list/detail, cờ đọc/star,
soạn–gửi–nháp, tìm kiếm PostgreSQL, đính kèm, hộp thư demo.
"""
import asyncio
import json
import logging
import os
from urllib.parse import urlencode

from fastapi import APIRouter, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from app.core.auth import verify_session
from app.core.db import execute, fetchall, fetchone, insert
from app.routers.auth import _get_effective_permissions
from app.services import mail_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mail", tags=["mail"])

_sync_task = None


def _auth(code, role, dept, token, write: bool = False) -> dict:
    identity = verify_session(code, role, dept, token)
    if identity.get("user_role") == "admin":
        return identity
    perms = _get_effective_permissions(identity.get("user_code", "")).get("mail", {})
    can_view = bool(perms.get("can_view") or perms.get("can_edit"))
    can_edit = bool(perms.get("can_edit"))
    if write and not can_edit:
        raise HTTPException(403, "Bạn không có quyền soạn/gửi hoặc thay đổi thư")
    if not can_view:
        raise HTTPException(403, "Bạn không có quyền truy cập Mail")
    return identity


def _account_or_404(account_id, identity: dict) -> dict:
    account = mail_service.get_account(int(account_id), identity["user_code"])
    if not account:
        raise HTTPException(404, "Hộp thư không tồn tại")
    return account


def _default_account(identity: dict) -> dict:
    account = fetchone(
        "SELECT * FROM mail_accounts WHERE employee_code = :code ORDER BY id LIMIT 1",
        {"code": identity["user_code"]},
    )
    if not account:
        raise HTTPException(404, "Chưa có hộp thư. Hãy thêm hộp thư hoặc dùng dữ liệu demo.")
    return account


_STANDARD_FOLDER_FALLBACK = {
    "inbox": ("INBOX", "Hộp thư đến", 0),
    "sent": ("Sent", "Đã gửi", 10),
    "drafts": ("Drafts", "Thư nháp", 20),
    "trash": ("Trash", "Đã xoá", 30),
    "junk": ("Junk", "Thư rác", 40),
}


def _folder_for(account_id: int, folder) -> dict:
    if folder is None or str(folder).strip() == "":
        folder = "inbox"
    folder = str(folder)
    if folder.isdigit():
        row = fetchone(
            "SELECT * FROM mail_folders WHERE id = :id AND account_id = :account_id",
            {"id": int(folder), "account_id": account_id},
        )
    else:
        row = fetchone(
            "SELECT * FROM mail_folders WHERE account_id = :account_id AND (role = :role OR path = :path) ORDER BY id LIMIT 1",
            {"account_id": account_id, "role": folder, "path": folder},
        )
    if not row and folder in _STANDARD_FOLDER_FALLBACK:
        path, name, order = _STANDARD_FOLDER_FALLBACK[folder]
        folder_id = mail_service._ensure_folder(account_id, path, name, folder, order)
        row = fetchone("SELECT * FROM mail_folders WHERE id = :id", {"id": folder_id})
    if not row:
        raise HTTPException(404, "Thư mục không tồn tại")
    return row


def _message_or_404(message_id: int, identity: dict) -> dict:
    row = fetchone(
        """
        SELECT m.*, f.role AS folder_role, f.path AS folder_path
        FROM mail_messages m
        JOIN mail_folders f ON f.id = m.folder_id
        JOIN mail_accounts a ON a.id = m.account_id
        WHERE m.id = :id AND a.employee_code = :code
        """,
        {"id": int(message_id), "code": identity["user_code"]},
    )
    if not row:
        raise HTTPException(404, "Không tìm thấy thư")
    return row


def _download_url(attachment_id: int, identity: dict) -> str:
    query = urlencode({
        "user_code": identity["user_code"],
        "user_role": identity.get("user_role") or "",
        "user_token": identity.get("_token") or "",
    })
    return f"/api/mail/attachments/{attachment_id}/download?{query}"


def _serialize_message(row: dict) -> dict:
    result = dict(row)
    for key in ("to_json", "cc_json", "bcc_json"):
        try:
            result[key.replace("_json", "")] = json.loads(result.get(key) or "[]")
        except Exception:
            result[key.replace("_json", "")] = []
        result.pop(key, None)
    return result


# ─── Accounts ──────────────────────────────────────────────────────────

@router.get("/accounts")
def list_accounts(
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token"),
):
    user = _auth(x_user_code, x_user_role, x_user_dept, x_user_token)
    return {"accounts": mail_service.list_accounts(user["user_code"])}


@router.post("/accounts", status_code=201)
async def create_account(
    payload: dict,
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token"),
):
    user = _auth(x_user_code, x_user_role, x_user_dept, x_user_token, write=True)
    try:
        account = await asyncio.to_thread(mail_service.create_account, user["user_code"], payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        logger.exception("mail create account failed")
        raise HTTPException(500, f"Không tạo được hộp thư: {exc}")
    return {"account": account}


@router.post("/accounts/test")
async def test_account(
    payload: dict,
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token"),
):
    _auth(x_user_code, x_user_role, x_user_dept, x_user_token, write=True)
    return await asyncio.to_thread(mail_service.test_connection, payload)


@router.delete("/accounts/{account_id}")
def delete_account(
    account_id: int,
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token"),
):
    user = _auth(x_user_code, x_user_role, x_user_dept, x_user_token, write=True)
    _account_or_404(account_id, user)
    mail_service.delete_account(account_id, user["user_code"])
    return {"ok": True}


@router.post("/accounts/{account_id}/sync")
async def sync_account(
    account_id: int,
    limit: int | None = Query(None, ge=1, le=2000),
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token"),
):
    user = _auth(x_user_code, x_user_role, x_user_dept, x_user_token, write=True)
    _account_or_404(account_id, user)
    try:
        result = await asyncio.to_thread(mail_service.sync_account, account_id, limit)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        logger.exception("mail sync failed account=%s", account_id)
        raise HTTPException(502, f"Đồng bộ thất bại: {exc}")
    return result


@router.post("/demo", status_code=201)
async def create_demo(
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token"),
):
    user = _auth(x_user_code, x_user_role, x_user_dept, x_user_token, write=True)
    account = await asyncio.to_thread(mail_service.seed_demo_account, user["user_code"])
    return {"account": account}


# ─── Folders / messages ────────────────────────────────────────────────

@router.get("/folders")
def list_folders(
    account_id: int | None = Query(None),
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token"),
):
    user = _auth(x_user_code, x_user_role, x_user_dept, x_user_token)
    account = _account_or_404(account_id, user) if account_id else _default_account(user)
    folders = fetchall(
        """
        SELECT id, account_id, path, name, role, unread_count, total_count, sort_order
        FROM mail_folders WHERE account_id = :account_id
        ORDER BY sort_order, name
        """,
        {"account_id": account["id"]},
    )
    return {"account": {k: v for k, v in account.items() if k != "secret_encrypted"}, "folders": folders}


@router.get("/messages")
def list_messages(
    account_id: int | None = Query(None),
    folder: str | None = Query("inbox"),
    q: str | None = Query(None, max_length=200),
    filter: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token"),
):
    user = _auth(x_user_code, x_user_role, x_user_dept, x_user_token)
    account = _account_or_404(account_id, user) if account_id else _default_account(user)
    folder_row = _folder_for(int(account["id"]), folder)

    clauses = ["m.account_id = :account_id", "m.folder_id = :folder_id"]
    params = {"account_id": account["id"], "folder_id": folder_row["id"]}
    if q and q.strip():
        clauses.append("(m.subject ILIKE :q OR m.from_name ILIKE :q OR m.from_email ILIKE :q OR m.snippet ILIKE :q)")
        params["q"] = f"%{q.strip()}%"
    if filter == "unread":
        clauses.append("m.is_read = FALSE")
    elif filter == "starred":
        clauses.append("m.is_starred = TRUE")
    elif filter == "attachment":
        clauses.append("m.has_attachment = TRUE")

    where = " AND ".join(clauses)
    total_row = fetchone(f"SELECT COUNT(*) AS c FROM mail_messages m WHERE {where}", params) or {"c": 0}
    offset = (page - 1) * page_size
    rows = fetchall(
        f"""
        SELECT m.id, m.account_id, m.folder_id, m.uid, m.message_id, m.thread_key,
               m.subject, m.snippet, m.from_name, m.from_email,
               m.to_json, m.cc_json, m.bcc_json, m.sent_at, m.received_at,
               m.is_read, m.is_starred, m.is_draft, m.has_attachment, m.size_bytes
        FROM mail_messages m
        WHERE {where}
        ORDER BY COALESCE(m.received_at, m.sent_at, m.created_at) DESC, m.id DESC
        LIMIT :limit OFFSET :offset
        """,
        {**params, "limit": page_size, "offset": offset},
    )
    return {
        "account_id": account["id"],
        "folder": folder_row,
        "messages": [_serialize_message(row) for row in rows],
        "total": int(total_row.get("c") or 0),
        "page": page,
        "page_size": page_size,
    }


@router.get("/messages/{message_id}")
def get_message(
    message_id: int,
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token"),
):
    user = _auth(x_user_code, x_user_role, x_user_dept, x_user_token)
    identity = {**user, "_token": x_user_token}
    row = _message_or_404(message_id, identity)
    body = fetchone(
        "SELECT text_plain, text_html FROM mail_message_bodies WHERE message_id = :id",
        {"id": message_id},
    ) or {}
    attachments = fetchall(
        "SELECT id, filename, mime_type, size_bytes, content_id FROM mail_attachments WHERE message_id = :id ORDER BY id",
        {"id": message_id},
    )
    for att in attachments:
        att["download_url"] = _download_url(int(att["id"]), identity)

    if not row.get("is_read"):
        execute("UPDATE mail_messages SET is_read = TRUE WHERE id = :id", {"id": message_id})
        mail_service._refresh_folder_counts(int(row["folder_id"]))
        row["is_read"] = True
        mail_service._publish_mail_event("mail_unread", {"account_id": row["account_id"]})

    message = _serialize_message(row)
    message["body"] = body
    message["attachments"] = attachments
    return {"message": message}


@router.get("/threads/{thread_key}")
def get_thread(
    thread_key: str,
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token"),
):
    user = _auth(x_user_code, x_user_role, x_user_dept, x_user_token)
    rows = fetchall(
        """
        SELECT m.id, m.subject, m.snippet, m.from_name, m.from_email,
               m.sent_at, m.received_at, m.is_read, m.is_starred, m.has_attachment
        FROM mail_messages m
        JOIN mail_accounts a ON a.id = m.account_id
        WHERE a.employee_code = :code AND m.thread_key = :thread_key
        ORDER BY COALESCE(m.received_at, m.sent_at, m.created_at)
        """,
        {"code": user["user_code"], "thread_key": thread_key},
    )
    return {"messages": rows}


@router.post("/messages/{message_id}/flags")
def update_flags(
    message_id: int,
    payload: dict,
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token"),
):
    user = _auth(x_user_code, x_user_role, x_user_dept, x_user_token, write=True)
    row = _message_or_404(message_id, user)
    old_folder_id = int(row["folder_id"])

    sets = []
    params = {"id": message_id}
    if "read" in payload:
        sets.append("is_read = :is_read")
        params["is_read"] = bool(payload.get("read"))
    if "starred" in payload:
        sets.append("is_starred = :is_starred")
        params["is_starred"] = bool(payload.get("starred"))

    new_folder_id = old_folder_id
    target = payload.get("folder") or payload.get("folder_role")
    if target:
        folder_row = _folder_for(int(row["account_id"]), target)
        new_folder_id = int(folder_row["id"])
        sets.append("folder_id = :folder_id")
        params["folder_id"] = new_folder_id

    if not sets:
        return {"ok": True}
    execute(f"UPDATE mail_messages SET {', '.join(sets)} WHERE id = :id", params)
    mail_service._refresh_folder_counts(old_folder_id)
    if new_folder_id != old_folder_id:
        mail_service._refresh_folder_counts(new_folder_id)
    mail_service._publish_mail_event("mail_unread", {"account_id": row["account_id"]})
    return {"ok": True}


@router.delete("/messages/{message_id}")
def delete_message(
    message_id: int,
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token"),
):
    user = _auth(x_user_code, x_user_role, x_user_dept, x_user_token, write=True)
    row = _message_or_404(message_id, user)
    if row.get("folder_role") == "trash":
        execute("DELETE FROM mail_messages WHERE id = :id", {"id": message_id})
        mail_service._refresh_folder_counts(int(row["folder_id"]))
    else:
        folder_row = _folder_for(int(row["account_id"]), "trash")
        execute(
            "UPDATE mail_messages SET folder_id = :folder_id WHERE id = :id",
            {"folder_id": folder_row["id"], "id": message_id},
        )
        mail_service._refresh_folder_counts(int(row["folder_id"]))
        mail_service._refresh_folder_counts(int(folder_row["id"]))
    return {"ok": True}


@router.get("/unread")
def unread_counts(
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token"),
):
    user = _auth(x_user_code, x_user_role, x_user_dept, x_user_token)
    rows = fetchall(
        """
        SELECT f.account_id, f.id AS folder_id, f.role, f.name, f.unread_count
        FROM mail_folders f
        JOIN mail_accounts a ON a.id = f.account_id
        WHERE a.employee_code = :code
        ORDER BY f.account_id, f.sort_order
        """,
        {"code": user["user_code"]},
    )
    total = sum(int(row.get("unread_count") or 0) for row in rows if row.get("role") == "inbox")
    return {"folders": rows, "inbox_unread": total}


@router.get("/contacts")
def contacts(
    q: str | None = Query(None, max_length=100),
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token"),
):
    user = _auth(x_user_code, x_user_role, x_user_dept, x_user_token)
    like = f"%{(q or '').strip()}%"
    rows = fetchall(
        """
        SELECT DISTINCT m.from_email AS email, m.from_name AS name
        FROM mail_messages m
        JOIN mail_accounts a ON a.id = m.account_id
        WHERE a.employee_code = :code AND m.from_email <> ''
          AND (m.from_email ILIKE :q OR m.from_name ILIKE :q)
        UNION
        SELECT e.email AS email, e.full_name AS name
        FROM employees e
        WHERE e.email <> '' AND (e.email ILIKE :q OR e.full_name ILIKE :q)
        LIMIT 15
        """,
        {"code": user["user_code"], "q": like},
    )
    return {"contacts": [row for row in rows if row.get("email")]}


# ─── Attachments ───────────────────────────────────────────────────────

@router.post("/attachments/upload", status_code=201)
async def upload_attachment(
    file: UploadFile = File(...),
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token"),
):
    _auth(x_user_code, x_user_role, x_user_dept, x_user_token, write=True)
    data = await file.read()
    try:
        result = await asyncio.to_thread(mail_service.save_outgoing_upload, file.filename or "attachment", data)
    except ValueError as exc:
        raise HTTPException(413, str(exc))
    return result


@router.get("/attachments/{attachment_id}/download")
def download_attachment(
    attachment_id: int,
    user_code: str = Query(None),
    user_role: str = Query(None),
    user_token: str = Query(None),
):
    identity = verify_session(user_code, user_role, None, user_token)
    row = fetchone(
        """
        SELECT att.id, att.filename, att.mime_type, att.storage_path, m.account_id
        FROM mail_attachments att
        JOIN mail_messages m ON m.id = att.message_id
        JOIN mail_accounts a ON a.id = m.account_id
        WHERE att.id = :id AND a.employee_code = :code
        """,
        {"id": attachment_id, "code": identity["user_code"]},
    )
    if not row:
        raise HTTPException(404, "Không tìm thấy tệp đính kèm")
    rel_path = (row.get("storage_path") or "").replace("\\", "/")
    storage_root = os.path.abspath(mail_service.MAIL_STORAGE_ROOT)
    file_path = os.path.abspath(os.path.join(storage_root, "..", rel_path))
    if not file_path.startswith(storage_root + os.sep) or not os.path.isfile(file_path):
        raise HTTPException(404, "Tệp không còn trên máy chủ")
    return FileResponse(
        file_path,
        filename=row.get("filename") or "attachment",
        media_type=row.get("mime_type") or "application/octet-stream",
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


# ─── Drafts / send ─────────────────────────────────────────────────────

def _clean_recipients(value) -> list[dict]:
    result = []
    for item in value or []:
        if isinstance(item, str):
            email = item.strip()
            name = ""
        else:
            email = (item.get("email") or "").strip()
            name = (item.get("name") or "").strip()
        if email:
            result.append({"name": name, "email": email})
    return result


@router.get("/drafts")
def list_drafts(
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token"),
):
    user = _auth(x_user_code, x_user_role, x_user_dept, x_user_token)
    rows = fetchall(
        """
        SELECT d.*, a.email_address
        FROM mail_drafts d
        JOIN mail_accounts a ON a.id = d.account_id
        WHERE d.employee_code = :code
        ORDER BY d.updated_at DESC
        """,
        {"code": user["user_code"]},
    )
    return {"drafts": rows}


@router.post("/drafts", status_code=201)
def create_draft(
    payload: dict,
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token"),
):
    user = _auth(x_user_code, x_user_role, x_user_dept, x_user_token, write=True)
    account_id = payload.get("account_id")
    if account_id:
        _account_or_404(account_id, user)
    else:
        account_id = _default_account(user)["id"]
    draft_id = insert(
        """
        INSERT INTO mail_drafts
            (account_id, employee_code, in_reply_to, to_json, cc_json, bcc_json,
             subject, body_html, attachments_json, created_at, updated_at)
        VALUES
            (:account_id, :code, :in_reply_to, :to_json, :cc_json, :bcc_json,
             :subject, :body_html, :attachments_json, :created_at, :updated_at)
        RETURNING id
        """,
        {
            "account_id": account_id,
            "code": user["user_code"],
            "in_reply_to": payload.get("in_reply_to") or "",
            "to_json": json.dumps(_clean_recipients(payload.get("to")), ensure_ascii=False),
            "cc_json": json.dumps(_clean_recipients(payload.get("cc")), ensure_ascii=False),
            "bcc_json": json.dumps(_clean_recipients(payload.get("bcc")), ensure_ascii=False),
            "subject": payload.get("subject") or "",
            "body_html": payload.get("body_html") or "",
            "attachments_json": json.dumps(payload.get("attachments") or [], ensure_ascii=False),
            "created_at": mail_service._now(),
            "updated_at": mail_service._now(),
        },
    )
    return {"draft_id": draft_id}


@router.patch("/drafts/{draft_id}")
def update_draft(
    draft_id: int,
    payload: dict,
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token"),
):
    user = _auth(x_user_code, x_user_role, x_user_dept, x_user_token, write=True)
    existing = fetchone(
        "SELECT id FROM mail_drafts WHERE id = :id AND employee_code = :code",
        {"id": draft_id, "code": user["user_code"]},
    )
    if not existing:
        raise HTTPException(404, "Không tìm thấy bản nháp")

    sets = []
    params = {"id": draft_id, "updated_at": mail_service._now()}
    sets.append("updated_at = :updated_at")
    if "subject" in payload:
        sets.append("subject = :subject")
        params["subject"] = payload.get("subject") or ""
    if "body_html" in payload:
        sets.append("body_html = :body_html")
        params["body_html"] = payload.get("body_html") or ""
    if "to" in payload:
        sets.append("to_json = :to_json")
        params["to_json"] = json.dumps(_clean_recipients(payload.get("to")), ensure_ascii=False)
    if "cc" in payload:
        sets.append("cc_json = :cc_json")
        params["cc_json"] = json.dumps(_clean_recipients(payload.get("cc")), ensure_ascii=False)
    if "bcc" in payload:
        sets.append("bcc_json = :bcc_json")
        params["bcc_json"] = json.dumps(_clean_recipients(payload.get("bcc")), ensure_ascii=False)
    if "attachments" in payload:
        sets.append("attachments_json = :attachments_json")
        params["attachments_json"] = json.dumps(payload.get("attachments") or [], ensure_ascii=False)
    execute(f"UPDATE mail_drafts SET {', '.join(sets)} WHERE id = :id", params)
    return {"ok": True}


@router.delete("/drafts/{draft_id}")
def delete_draft(
    draft_id: int,
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token"),
):
    user = _auth(x_user_code, x_user_role, x_user_dept, x_user_token, write=True)
    execute(
        "DELETE FROM mail_drafts WHERE id = :id AND employee_code = :code",
        {"id": draft_id, "code": user["user_code"]},
    )
    return {"ok": True}


@router.post("/drafts/{draft_id}/send")
async def send_draft(
    draft_id: int,
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token"),
):
    user = _auth(x_user_code, x_user_role, x_user_dept, x_user_token, write=True)
    try:
        result = await asyncio.to_thread(mail_service.send_draft, draft_id, user["user_code"])
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        logger.exception("mail send failed draft=%s", draft_id)
        raise HTTPException(502, f"Gửi thư thất bại: {exc}")
    return result


# ─── Background sync runtime ───────────────────────────────────────────

async def start_mail_runtime() -> None:
    global _sync_task
    if os.environ.get("MAIL_SYNC_DISABLED", "").lower() in ("1", "true", "yes"):
        return
    if _sync_task and not _sync_task.done():
        return
    _sync_task = asyncio.create_task(_mail_sync_loop(), name="mail-sync-worker")


async def stop_mail_runtime() -> None:
    global _sync_task
    if not _sync_task:
        return
    _sync_task.cancel()
    try:
        await _sync_task
    except asyncio.CancelledError:
        pass
    finally:
        _sync_task = None


async def _mail_sync_loop() -> None:
    try:
        await asyncio.sleep(int(os.environ.get("MAIL_SYNC_START_DELAY", "20")))
    except Exception:
        pass
    interval = max(30, int(os.environ.get("MAIL_SYNC_INTERVAL", "120")))
    while True:
        try:
            accounts = await asyncio.to_thread(
                fetchall,
                "SELECT id FROM mail_accounts WHERE sync_enabled = TRUE AND is_demo = FALSE ORDER BY id",
            )
            for account in accounts:
                try:
                    await asyncio.to_thread(mail_service.sync_account, int(account["id"]))
                except Exception as exc:
                    logger.warning("mail background sync account=%s: %s", account.get("id"), exc)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("mail sync loop: %s", exc)
        await asyncio.sleep(interval)
