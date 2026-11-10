"""Dịch vụ Mail: IMAP sync, SMTP send, demo mailbox.

Nguyên tắc:
- import thư viện mạng (imapclient/aiosmtplib/cryptography) theo kiểu lazy để
  backend vẫn khởi động được khi image chưa cài đủ dependency.
- Không log mật khẩu / token.
- Mỗi message lỗi được bỏ qua, không làm hỏng cả folder.
"""
import json
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from email.utils import getaddresses, parsedate_to_datetime, parseaddr

from app.core.db import execute, fetchall, fetchone, insert
from app.core.mail_crypto import decrypt_secret, encrypt_secret
from app.core.mail_html import plain_snippet, sanitize_html

logger = logging.getLogger(__name__)

_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
MAIL_STORAGE_ROOT = os.path.join(_BACKEND_ROOT, "storage", "mail")
MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

_STANDARD_FOLDERS = [
    ("INBOX", "Hộp thư đến", "inbox", 0),
    ("Sent", "Đã gửi", "sent", 10),
    ("Drafts", "Thư nháp", "drafts", 20),
    ("Trash", "Đã xoá", "trash", 30),
    ("Junk", "Thư rác", "junk", 40),
]

_FOLDER_ROLE_MAP = {
    "inbox": "inbox",
    "sent": "sent",
    "sent items": "sent",
    "sent messages": "sent",
    "drafts": "drafts",
    "draft": "drafts",
    "trash": "trash",
    "deleted items": "trash",
    "deleted messages": "trash",
    "junk": "junk",
    "junk e-mail": "junk",
    "spam": "junk",
    "bulk mail": "junk",
}


def _now() -> datetime:
    return datetime.utcnow()


def _naive_utc(value):
    if not isinstance(value, datetime):
        return value
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _decode_header_value(value) -> str:
    if value is None:
        return ""
    try:
        return str(value).strip()
    except Exception:
        return ""


def _strip_message_id(value: str) -> str:
    return (value or "").strip().strip("<>").strip()


def _folder_role(path: str) -> str:
    tail = (path or "").replace("\\", "/").rstrip("/").split("/")[-1].strip().lower()
    return _FOLDER_ROLE_MAP.get(tail, "custom")


def _ensure_folder(account_id: int, path: str, name: str = "", role: str = "", sort_order: int = 100) -> int:
    display = name or (path.rstrip("/").split("/")[-1] or path)
    folder_role = role or _folder_role(path)
    folder_id = insert(
        """
        INSERT INTO mail_folders (account_id, path, name, role, unread_count, total_count, sort_order)
        VALUES (:account_id, :path, :name, :role, 0, 0, :sort_order)
        ON CONFLICT (account_id, path) DO UPDATE
        SET name = EXCLUDED.name, role = EXCLUDED.role
        RETURNING id
        """,
        {
            "account_id": account_id,
            "path": path,
            "name": display,
            "role": folder_role,
            "sort_order": sort_order,
        },
    )
    if folder_id is not None:
        return int(folder_id)
    row = fetchone(
        "SELECT id FROM mail_folders WHERE account_id = :account_id AND path = :path",
        {"account_id": account_id, "path": path},
    )
    return int(row["id"])


def _refresh_folder_counts(folder_id: int) -> None:
    row = fetchone(
        """
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE is_read = FALSE) AS unread
        FROM mail_messages
        WHERE folder_id = :folder_id
        """,
        {"folder_id": folder_id},
    ) or {"total": 0, "unread": 0}
    execute(
        "UPDATE mail_folders SET total_count = :total, unread_count = :unread WHERE id = :id",
        {"total": int(row.get("total") or 0), "unread": int(row.get("unread") or 0), "id": folder_id},
    )


def get_account(account_id: int, employee_code: str | None = None) -> dict | None:
    sql = "SELECT * FROM mail_accounts WHERE id = :id"
    params = {"id": account_id}
    if employee_code is not None:
        sql += " AND employee_code = :code"
        params["code"] = employee_code
    return fetchone(sql, params)


def list_accounts(employee_code: str) -> list[dict]:
    rows = fetchall(
        "SELECT * FROM mail_accounts WHERE employee_code = :code ORDER BY id",
        {"code": employee_code},
    )
    for row in rows:
        row.pop("secret_encrypted", None)
    return rows


def create_account(employee_code: str, payload: dict) -> dict:
    provider = (payload.get("provider") or "imap").strip().lower()
    email_address = (payload.get("email_address") or "").strip()
    password = payload.get("password") or ""
    if not email_address:
        raise ValueError("Thiếu địa chỉ email")
    if provider not in ("imap", "demo"):
        raise ValueError("Provider chưa hỗ trợ. Dùng 'imap' hoặc 'demo'.")
    if provider == "imap" and not password:
        raise ValueError("Thiếu mật khẩu / app password")

    config = {
        "provider": provider,
        "email_address": email_address,
        "display_name": (payload.get("display_name") or "").strip(),
        "imap_host": (payload.get("imap_host") or "").strip(),
        "imap_port": int(payload.get("imap_port") or 993),
        "imap_tls": bool(payload.get("imap_tls", True)),
        "smtp_host": (payload.get("smtp_host") or "").strip(),
        "smtp_port": int(payload.get("smtp_port") or 465),
        "smtp_tls": bool(payload.get("smtp_tls", True)),
        "username": (payload.get("username") or email_address).strip(),
    }

    if provider == "imap" and payload.get("test", True):
        result = test_connection({**config, "password": password})
        if not result.get("imap"):
            raise ValueError("Không kết nối được IMAP: " + "; ".join(result.get("errors") or ["unknown"]))

    secret = encrypt_secret(password)
    new_id = insert(
        """
        INSERT INTO mail_accounts
            (employee_code, provider, email_address, display_name,
             imap_host, imap_port, imap_tls, smtp_host, smtp_port, smtp_tls,
             username, secret_encrypted, sync_enabled, sync_limit, is_demo,
             created_at, updated_at)
        VALUES
            (:employee_code, :provider, :email_address, :display_name,
             :imap_host, :imap_port, :imap_tls, :smtp_host, :smtp_port, :smtp_tls,
             :username, :secret, TRUE, :sync_limit, :is_demo,
             NOW(), NOW())
        RETURNING id
        """,
        {
            **config,
            "employee_code": employee_code,
            "secret": secret,
            "sync_limit": int(payload.get("sync_limit") or 200),
            "is_demo": provider == "demo",
        },
    )
    _ensure_folder(new_id, "INBOX", "Hộp thư đến", "inbox", 0)
    row = get_account(new_id, employee_code)
    if row:
        row.pop("secret_encrypted", None)
    return row or {}


def delete_account(account_id: int, employee_code: str) -> None:
    execute(
        "DELETE FROM mail_accounts WHERE id = :id AND employee_code = :code",
        {"id": account_id, "code": employee_code},
    )


def test_connection(config: dict) -> dict:
    result = {"imap": False, "smtp": False, "errors": []}
    email_address = (config.get("email_address") or "").strip()
    username = (config.get("username") or email_address).strip()
    password = config.get("password") or ""

    imap_host = (config.get("imap_host") or "").strip()
    if imap_host:
        try:
            from imapclient import IMAPClient

            if config.get("imap_tls", True):
                server = IMAPClient(imap_host, port=int(config.get("imap_port") or 993), ssl=True, timeout=20)
            else:
                server = IMAPClient(imap_host, port=int(config.get("imap_port") or 143), ssl=False, timeout=20)
                server.starttls()
            try:
                server.login(username, password)
                server.list_folders()
                result["imap"] = True
            finally:
                try:
                    server.logout()
                except Exception:
                    pass
        except Exception as exc:
            result["errors"].append(f"IMAP: {exc}")
    else:
        result["errors"].append("IMAP: thiếu imap_host")

    smtp_host = (config.get("smtp_host") or "").strip()
    if smtp_host:
        try:
            import smtplib

            if config.get("smtp_tls", True):
                server = smtplib.SMTP_SSL(smtp_host, int(config.get("smtp_port") or 465), timeout=20)
            else:
                server = smtplib.SMTP(smtp_host, int(config.get("smtp_port") or 587), timeout=20)
                server.starttls()
            try:
                server.ehlo()
                if password:
                    server.login(username, password)
                result["smtp"] = True
            finally:
                try:
                    server.quit()
                except Exception:
                    pass
        except Exception as exc:
            result["errors"].append(f"SMTP: {exc}")
    else:
        result["errors"].append("SMTP: thiếu smtp_host")
    return result


def _safe_filename(name: str) -> str:
    base = os.path.basename(name or "").strip() or "attachment"
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", base)
    return base[:180] or "attachment"


def _save_attachment_bytes(account_id: int, folder_id: int, uid: int, index: int, filename: str, data: bytes) -> str:
    rel_dir = os.path.join("mail", str(account_id), str(folder_id))
    abs_dir = os.path.join(MAIL_STORAGE_ROOT, str(account_id), str(folder_id))
    os.makedirs(abs_dir, exist_ok=True)
    stored_name = f"{uid}-{index}-{uuid.uuid4().hex[:8]}-{_safe_filename(filename)}"
    with open(os.path.join(abs_dir, stored_name), "wb") as handle:
        handle.write(data)
    return os.path.join(rel_dir, stored_name).replace("\\", "/")


def save_outgoing_upload(filename: str, data: bytes) -> dict:
    if len(data) > MAX_ATTACHMENT_BYTES:
        raise ValueError("Tệp đính kèm vượt quá 20MB")
    rel_dir = os.path.join("mail", "outgoing")
    abs_dir = os.path.join(MAIL_STORAGE_ROOT, "outgoing")
    os.makedirs(abs_dir, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}-{_safe_filename(filename)}"
    with open(os.path.join(abs_dir, stored_name), "wb") as handle:
        handle.write(data)
    return {
        "filename": filename,
        "storage_path": os.path.join(rel_dir, stored_name).replace("\\", "/"),
        "size_bytes": len(data),
        "mime_type": _guess_mime(filename),
    }


def _guess_mime(filename: str) -> str:
    import mimetypes

    return mimetypes.guess_type(filename or "")[0] or "application/octet-stream"


def _parse_email(raw: bytes) -> dict:
    parsed = BytesParser(policy=policy.default).parsebytes(raw)
    subject = _decode_header_value(parsed.get("Subject"))
    from_name, from_email = parseaddr(_decode_header_value(parsed.get("From")))
    to_list = [
        {"name": _decode_header_value(name), "email": (email or "").strip()}
        for name, email in getaddresses(parsed.get_all("To", []))
    ]
    cc_list = [
        {"name": _decode_header_value(name), "email": (email or "").strip()}
        for name, email in getaddresses(parsed.get_all("Cc", []))
    ]
    bcc_list = [
        {"name": _decode_header_value(name), "email": (email or "").strip()}
        for name, email in getaddresses(parsed.get_all("Bcc", []))
    ]

    sent_at = None
    date_header = parsed.get("Date")
    if date_header:
        try:
            sent_at = _naive_utc(parsedate_to_datetime(str(date_header)))
        except Exception:
            sent_at = None

    message_id = _strip_message_id(_decode_header_value(parsed.get("Message-ID")))
    in_reply_to = _strip_message_id(_decode_header_value(parsed.get("In-Reply-To")))
    references = _decode_header_value(parsed.get("References")).split()
    thread_key = _strip_message_id(references[0]) if references else (in_reply_to or message_id)

    plain_parts: list[str] = []
    html_parts: list[str] = []
    attachments: list[dict] = []

    def collect(part, index):
        disposition = (part.get_content_disposition() or "").lower()
        filename = part.get_filename()
        if filename or disposition == "attachment":
            try:
                data = part.get_payload(decode=True) or b""
            except Exception:
                data = b""
            if data:
                attachments.append({
                    "filename": _decode_header_value(filename) or f"attachment-{index}",
                    "mime_type": part.get_content_type() or "application/octet-stream",
                    "size_bytes": len(data),
                    "content_id": _strip_message_id(_decode_header_value(part.get("Content-ID"))),
                    "data": data,
                })
            return
        content_type = (part.get_content_type() or "").lower()
        try:
            content = part.get_content()
        except Exception:
            payload = part.get_payload(decode=True) or b""
            content = payload.decode("utf-8", errors="replace")
        if not isinstance(content, str):
            content = str(content)
        if content_type == "text/plain":
            plain_parts.append(content)
        elif content_type == "text/html":
            html_parts.append(content)

    if parsed.is_multipart():
        for index, part in enumerate(parsed.walk()):
            if part.is_multipart():
                continue
            collect(part, index)
    else:
        collect(parsed, 0)

    plain_text = "\n".join(part for part in plain_parts if part).strip()
    html_text = "\n".join(part for part in html_parts if part).strip()
    return {
        "subject": subject,
        "from_name": from_name,
        "from_email": from_email,
        "to_list": to_list,
        "cc_list": cc_list,
        "bcc_list": bcc_list,
        "sent_at": sent_at,
        "message_id": message_id,
        "thread_key": thread_key or message_id,
        "text_plain": plain_text,
        "text_html": sanitize_html(html_text) if html_text else "",
        "snippet": plain_snippet(plain_text or re.sub(r"<[^>]+>", " ", html_text)),
        "attachments": attachments,
    }


def _store_parsed_message(account_id: int, folder_id: int, uid: int, parsed: dict, raw: bytes,
                          received_at=None, is_read=False, is_starred=False) -> int | None:
    existing = fetchone(
        "SELECT id FROM mail_messages WHERE account_id = :account_id AND folder_id = :folder_id AND uid = :uid",
        {"account_id": account_id, "folder_id": folder_id, "uid": uid},
    )
    if existing:
        execute(
            "UPDATE mail_messages SET is_read = :is_read, is_starred = :is_starred WHERE id = :id",
            {"is_read": bool(is_read), "is_starred": bool(is_starred), "id": existing["id"]},
        )
        return None

    received = _naive_utc(received_at) or parsed.get("sent_at") or _now()
    new_id = insert(
        """
        INSERT INTO mail_messages
            (account_id, folder_id, uid, message_id, thread_key, subject, snippet,
             from_name, from_email, to_json, cc_json, bcc_json, sent_at, received_at,
             is_read, is_starred, is_draft, has_attachment, size_bytes, raw_path, created_at)
        VALUES
            (:account_id, :folder_id, :uid, :message_id, :thread_key, :subject, :snippet,
             :from_name, :from_email, :to_json, :cc_json, :bcc_json, :sent_at, :received_at,
             :is_read, :is_starred, FALSE, :has_attachment, :size_bytes, :raw_path, :created_at)
        RETURNING id
        """,
        {
            "account_id": account_id,
            "folder_id": folder_id,
            "uid": uid,
            "message_id": parsed.get("message_id") or "",
            "thread_key": parsed.get("thread_key") or "",
            "subject": parsed.get("subject") or "(Không có tiêu đề)",
            "snippet": parsed.get("snippet") or "",
            "from_name": parsed.get("from_name") or "",
            "from_email": parsed.get("from_email") or "",
            "to_json": json.dumps(parsed.get("to_list") or [], ensure_ascii=False),
            "cc_json": json.dumps(parsed.get("cc_list") or [], ensure_ascii=False),
            "bcc_json": json.dumps(parsed.get("bcc_list") or [], ensure_ascii=False),
            "sent_at": parsed.get("sent_at"),
            "received_at": received,
            "is_read": bool(is_read),
            "is_starred": bool(is_starred),
            "has_attachment": bool(parsed.get("attachments")),
            "size_bytes": len(raw or b""),
            "raw_path": "",
            "created_at": _now(),
        },
    )
    if new_id is None:
        return None

    execute(
        "INSERT INTO mail_message_bodies (message_id, text_plain, text_html) VALUES (:id, :plain, :html)",
        {"id": new_id, "plain": parsed.get("text_plain") or "", "html": parsed.get("text_html") or ""},
    )

    for index, att in enumerate(parsed.get("attachments") or []):
        storage_path = _save_attachment_bytes(
            account_id, folder_id, uid, index, att.get("filename") or "attachment", att.get("data") or b""
        )
        execute(
            """
            INSERT INTO mail_attachments
                (message_id, filename, mime_type, size_bytes, content_id, storage_path)
            VALUES (:message_id, :filename, :mime_type, :size_bytes, :content_id, :storage_path)
            """,
            {
                "message_id": new_id,
                "filename": att.get("filename") or "attachment",
                "mime_type": att.get("mime_type") or "application/octet-stream",
                "size_bytes": int(att.get("size_bytes") or 0),
                "content_id": att.get("content_id") or "",
                "storage_path": storage_path,
            },
        )
    return new_id


def _upsert_sync_state(account_id: int, folder_path: str, uidvalidity: int, last_uid: int,
                       status: str, error: str = "") -> None:
    execute(
        """
        INSERT INTO mail_sync_state (account_id, folder_path, uidvalidity, last_uid, last_sync_at, status, last_error)
        VALUES (:account_id, :folder_path, :uidvalidity, :last_uid, :last_sync_at, :status, :error)
        ON CONFLICT (account_id, folder_path) DO UPDATE
        SET uidvalidity = EXCLUDED.uidvalidity,
            last_uid = EXCLUDED.last_uid,
            last_sync_at = EXCLUDED.last_sync_at,
            status = EXCLUDED.status,
            last_error = EXCLUDED.last_error
        """,
        {
            "account_id": account_id,
            "folder_path": folder_path,
            "uidvalidity": int(uidvalidity or 0),
            "last_uid": int(last_uid or 0),
            "last_sync_at": _now(),
            "status": status,
            "error": (error or "")[:2000],
        },
    )


def sync_account(account_id: int, limit: int | None = None) -> dict:
    account = fetchone("SELECT * FROM mail_accounts WHERE id = :id", {"id": account_id})
    if not account:
        raise ValueError("Hộp thư không tồn tại")
    if account.get("is_demo") or account.get("provider") == "demo":
        return {"ok": True, "demo": True, "folders": 0, "new_messages": 0}

    try:
        from imapclient import IMAPClient
    except Exception as exc:
        raise RuntimeError("Thiếu thư viện imapclient trên backend") from exc

    password = decrypt_secret(account.get("secret_encrypted") or "")
    host = (account.get("imap_host") or "").strip()
    if not host:
        raise ValueError("Hộp thư chưa cấu hình IMAP host")

    port = int(account.get("imap_port") or 993)
    server = None
    total_new = 0
    folder_count = 0
    try:
        if account.get("imap_tls", True):
            server = IMAPClient(host, port=port, ssl=True, timeout=30)
        else:
            server = IMAPClient(host, port=port, ssl=False, timeout=30)
            server.starttls()
        server.login(account.get("username") or account.get("email_address"), password)

        try:
            folder_list = server.list_folders()
        except Exception:
            folder_list = [( (), "/", "INBOX" )]

        folder_list = sorted(folder_list, key=lambda item: (item[2].lower() != "inbox", item[2].lower()))
        for flags, _delimiter, path in folder_list:
            folder_count += 1
            try:
                folder_id = _ensure_folder(account_id, path)
                selected = server.select_folder(path, readonly=False)
                uidvalidity = int(selected.get(b"UIDVALIDITY") or 0)
                state = fetchone(
                    "SELECT * FROM mail_sync_state WHERE account_id = :account_id AND folder_path = :path",
                    {"account_id": account_id, "path": path},
                )
                last_uid = 0
                if state and int(state.get("uidvalidity") or 0) == uidvalidity:
                    last_uid = int(state.get("last_uid") or 0)

                if last_uid:
                    uids = server.search(["UID", f"{last_uid + 1}:*"])
                else:
                    uids = server.search(["ALL"])
                uids = sorted(int(uid) for uid in (uids or []))
                cap = int(limit or account.get("sync_limit") or 200)
                if len(uids) > cap:
                    uids = uids[-cap:]

                new_last_uid = last_uid
                if uids:
                    fetched = server.fetch(uids, ["BODY.PEEK[]", "FLAGS", "RFC822.SIZE", "INTERNALDATE"])
                    for uid in uids:
                        data = fetched.get(uid) or {}
                        raw = data.get(b"BODY[]") or data.get(b"BODY.PEEK[]") or b""
                        if not raw:
                            continue
                        try:
                            parsed = _parse_email(raw)
                        except Exception as exc:
                            logger.warning("mail parse failed account=%s folder=%s uid=%s: %s", account_id, path, uid, exc)
                            continue
                        raw_flags = {str(flag).lower() for flag in (data.get(b"FLAGS") or ())}
                        is_read = "\\seen" in raw_flags
                        is_starred = "\\flagged" in raw_flags
                        try:
                            created = _store_parsed_message(
                                account_id, folder_id, uid, parsed, raw,
                                received_at=data.get(b"INTERNALDATE"),
                                is_read=is_read,
                                is_starred=is_starred,
                            )
                            if created:
                                total_new += 1
                        except Exception as exc:
                            logger.warning("mail store failed account=%s folder=%s uid=%s: %s", account_id, path, uid, exc)
                        new_last_uid = max(new_last_uid, uid)
                _refresh_folder_counts(folder_id)
                _upsert_sync_state(account_id, path, uidvalidity, new_last_uid, "ok", "")
            except Exception as exc:
                logger.warning("mail sync folder failed account=%s folder=%s: %s", account_id, path, exc)
                try:
                    _upsert_sync_state(account_id, path, 0, 0, "error", str(exc))
                except Exception:
                    pass
    finally:
        if server is not None:
            try:
                server.logout()
            except Exception:
                pass

    _publish_mail_event("mail_sync", {"account_id": account_id, "new_messages": total_new})
    return {"ok": True, "demo": False, "folders": folder_count, "new_messages": total_new}


def _publish_mail_event(event: str, payload: dict) -> None:
    try:
        from app.core import events

        events.publish_sync(event, payload)
    except Exception:
        pass


# ─── Demo mailbox ──────────────────────────────────────────────────────

_DEMO_MESSAGES = [
    {
        "folder": "inbox",
        "subject": "Kế hoạch sản xuất tuần 45 — cần xác nhận",
        "from_name": "Nguyễn Thị Lan",
        "from_email": "lan.nguyen@goldenfarm.local",
        "hours_ago": 1,
        "read": False,
        "starred": True,
        "attachment": "ke-hoach-tuan-45.txt",
        "body": "<p>Chào anh/chị,</p><p>Em gửi kế hoạch sản xuất tuần 45. Nhờ anh/chị kiểm tra phần <b>nguyên liệu</b> và phản hồi trước 16h hôm nay.</p><p>Trân trọng,<br/>Lan</p>",
    },
    {
        "folder": "inbox",
        "subject": "Báo cáo tồn kho tháng 10/2026",
        "from_name": "Trần Văn Minh",
        "from_email": "minh.tran@goldenfarm.local",
        "hours_ago": 4,
        "read": False,
        "starred": False,
        "attachment": "bao-cao-ton-kho.txt",
        "body": "<p>Gửi ban giám đốc báo cáo tồn kho tháng 10.</p><ul><li>Nguyên liệu A: 1.240 kg</li><li>Nguyên liệu B: 860 kg</li><li>Thành phẩm: 4.520 thùng</li></ul>",
    },
    {
        "folder": "inbox",
        "subject": "Phê duyệt đề nghị mua thiết bị IT",
        "from_name": "Phòng Hành chính",
        "from_email": "admin@goldenfarm.local",
        "hours_ago": 22,
        "read": True,
        "starred": False,
        "attachment": "",
        "body": "<p>Đề nghị mua 5 màn hình 24 inch phục vụ phòng kế toán đã được duyệt. Vui lòng cập nhật vào module Thiết bị.</p>",
    },
    {
        "folder": "inbox",
        "subject": "Lịch họp giao ban quý IV",
        "from_name": "Ban Giám đốc",
        "from_email": "bgd@goldenfarm.local",
        "hours_ago": 30,
        "read": True,
        "starred": True,
        "attachment": "",
        "body": "<p>Kính mời các trưởng phòng tham dự họp giao ban quý IV vào 9:00 thứ Hai tuần sau tại phòng họp lớn.</p>",
    },
    {
        "folder": "inbox",
        "subject": "Cảnh báo: đăng nhập lạ vào tài khoản",
        "from_name": "Microsoft 365",
        "from_email": "security@microsoft.com",
        "hours_ago": 48,
        "read": True,
        "starred": False,
        "attachment": "",
        "body": "<p>Chúng tôi phát hiện một đăng nhập từ thiết bị lạ. Nếu không phải bạn, hãy đổi mật khẩu ngay.</p>",
    },
    {
        "folder": "sent",
        "subject": "Re: Kế hoạch sản xuất tuần 45",
        "from_name": "Bạn",
        "from_email": "demo@goldenfarm.local",
        "hours_ago": 3,
        "read": True,
        "starred": False,
        "attachment": "",
        "body": "<p>Chị Lan xem giúp em phần định mức nguyên liệu nhé. Phần còn lại em đã xác nhận.</p>",
    },
    {
        "folder": "drafts",
        "subject": "Đề xuất cải tiến quy trình đóng gói",
        "from_name": "Bạn",
        "from_email": "demo@goldenfarm.local",
        "hours_ago": 6,
        "read": True,
        "starred": False,
        "attachment": "",
        "body": "<p>Em đang soạn đề xuất...</p>",
    },
]


def seed_demo_account(employee_code: str) -> dict:
    existing = fetchone(
        "SELECT * FROM mail_accounts WHERE employee_code = :code AND is_demo = TRUE ORDER BY id LIMIT 1",
        {"code": employee_code},
    )
    if not existing:
        new_id = insert(
            """
            INSERT INTO mail_accounts
                (employee_code, provider, email_address, display_name, imap_host, imap_port, imap_tls,
                 smtp_host, smtp_port, smtp_tls, username, secret_encrypted, sync_enabled, sync_limit, is_demo,
                 created_at, updated_at)
            VALUES
                (:code, 'demo', :email, 'Hộp thư demo', '', 993, TRUE, '', 465, TRUE, :email, '', TRUE, 200, TRUE,
                 NOW(), NOW())
            RETURNING id
            """,
            {"code": employee_code, "email": f"demo.{employee_code}@goldenfarm.local"},
        )
        existing = fetchone("SELECT * FROM mail_accounts WHERE id = :id", {"id": new_id})

    account_id = int(existing["id"])
    folder_ids = {}
    for path, name, role, order in _STANDARD_FOLDERS:
        folder_ids[role] = _ensure_folder(account_id, path, name, role, order)

    count = fetchone("SELECT COUNT(*) AS c FROM mail_messages WHERE account_id = :id", {"id": account_id})
    if int((count or {}).get("c") or 0) == 0:
        sender_email = existing.get("email_address") or f"demo.{employee_code}@goldenfarm.local"
        for item in _DEMO_MESSAGES:
            role = item["folder"]
            folder_id = folder_ids[role]
            received = _now() - timedelta(hours=item["hours_ago"])
            attachments = []
            if item.get("attachment"):
                data = (
                    "GoldenFarm ICT — dữ liệu demo\n"
                    f"Tiêu đề: {item['subject']}\n"
                    f"Người gửi: {item['from_name']} <{item['from_email']}>\n"
                ).encode("utf-8")
                attachments.append({
                    "filename": item["attachment"],
                    "mime_type": "text/plain",
                    "size_bytes": len(data),
                    "content_id": "",
                    "data": data,
                })
            parsed = {
                "subject": item["subject"],
                "from_name": item["from_name"],
                "from_email": sender_email if role != "inbox" else item["from_email"],
                "to_list": [{"name": "", "email": sender_email}],
                "cc_list": [],
                "bcc_list": [],
                "sent_at": received,
                "message_id": f"<demo-{uuid.uuid4().hex}@goldenfarm.local>",
                "thread_key": f"demo-{uuid.uuid4().hex}",
                "text_plain": re.sub(r"<[^>]+>", " ", item["body"]),
                "text_html": sanitize_html(item["body"]),
                "snippet": plain_snippet(re.sub(r"<[^>]+>", " ", item["body"])),
                "attachments": attachments,
            }
            _store_parsed_message(
                account_id, folder_id, None, parsed, b"",
                received_at=received,
                is_read=item["read"],
                is_starred=item["starred"],
            )
    for folder_id in folder_ids.values():
        _refresh_folder_counts(folder_id)

    row = fetchone("SELECT * FROM mail_accounts WHERE id = :id", {"id": account_id})
    if row:
        row.pop("secret_encrypted", None)
    _publish_mail_event("mail_sync", {"account_id": account_id, "demo": True})
    return row or {}


# ─── Send ──────────────────────────────────────────────────────────────

def _load_draft(draft_id: int, employee_code: str) -> dict:
    draft = fetchone(
        "SELECT * FROM mail_drafts WHERE id = :id AND employee_code = :code",
        {"id": draft_id, "code": employee_code},
    )
    if not draft:
        raise ValueError("Không tìm thấy bản nháp")
    return draft


def _parse_json_list(value) -> list:
    try:
        data = json.loads(value or "[]")
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _recipient_list(items) -> list[dict]:
    result = []
    for item in items or []:
        if isinstance(item, str):
            email = item.strip()
            name = ""
        else:
            email = (item.get("email") or "").strip()
            name = (item.get("name") or "").strip()
        if email:
            result.append({"name": name, "email": email})
    return result


def _build_message(account: dict, draft: dict, approved_sender: str | None = None) -> EmailMessage:
    to_list = _recipient_list(_parse_json_list(draft.get("to_json")))
    cc_list = _recipient_list(_parse_json_list(draft.get("cc_json")))
    bcc_list = _recipient_list(_parse_json_list(draft.get("bcc_json")))
    if not to_list:
        raise ValueError("Chưa có người nhận")

    msg = EmailMessage()
    display = (account.get("display_name") or "").strip()
    sender = approved_sender or account.get("email_address")
    msg["From"] = f"{display} <{sender}>" if display else sender
    msg["To"] = ", ".join(item["email"] for item in to_list)
    if cc_list:
        msg["Cc"] = ", ".join(item["email"] for item in cc_list)
    msg["Subject"] = draft.get("subject") or "(Không có tiêu đề)"

    body_html = draft.get("body_html") or ""
    plain = re.sub(r"<[^>]+>", " ", body_html)
    plain = re.sub(r"\s+", " ", plain).strip()
    msg.set_content(plain or "")
    if body_html:
        msg.add_alternative(body_html, subtype="html")

    for att in _parse_json_list(draft.get("attachments_json")):
        storage_path = (att.get("storage_path") or "").replace("\\", "/")
        abs_path = os.path.abspath(os.path.join(MAIL_STORAGE_ROOT, "..", storage_path))
        if not abs_path.startswith(os.path.abspath(MAIL_STORAGE_ROOT) + os.sep):
            continue
        if not os.path.isfile(abs_path):
            continue
        with open(abs_path, "rb") as handle:
            data = handle.read()
        mime = att.get("mime_type") or _guess_mime(att.get("filename") or "")
        maintype, _, subtype = mime.partition("/")
        msg.add_attachment(data, maintype=maintype or "application", subtype=subtype or "octet-stream",
                           filename=att.get("filename") or "attachment")
    return msg


def _smtp_send(account: dict, message: EmailMessage, password: str) -> None:
    import smtplib

    host = (account.get("smtp_host") or "").strip()
    if not host:
        raise ValueError("Hộp thư chưa cấu hình SMTP host")
    port = int(account.get("smtp_port") or 465)
    if account.get("smtp_tls", True):
        server = smtplib.SMTP_SSL(host, port, timeout=30)
    else:
        server = smtplib.SMTP(host, port, timeout=30)
        server.starttls()
    try:
        username = account.get("username") or account.get("email_address")
        if password:
            server.login(username, password)
        server.send_message(message)
    finally:
        try:
            server.quit()
        except Exception:
            pass


def _insert_sent_copy(account: dict, draft: dict, message: EmailMessage) -> None:
    folder = fetchone(
        "SELECT id FROM mail_folders WHERE account_id = :account_id AND role = 'sent' ORDER BY id LIMIT 1",
        {"account_id": account["id"]},
    )
    if not folder:
        folder_id = _ensure_folder(int(account["id"]), "Sent", "Đã gửi", "sent", 10)
    else:
        folder_id = int(folder["id"])
    to_list = _recipient_list(_parse_json_list(draft.get("to_json")))
    cc_list = _recipient_list(_parse_json_list(draft.get("cc_json")))
    parsed = {
        "subject": draft.get("subject") or "(Không có tiêu đề)",
        "from_name": account.get("display_name") or "",
        "from_email": account.get("email_address") or "",
        "to_list": to_list,
        "cc_list": cc_list,
        "bcc_list": [],
        "sent_at": _now(),
        "message_id": f"<sent-{uuid.uuid4().hex}@goldenfarm.local>",
        "thread_key": draft.get("in_reply_to") or f"sent-{uuid.uuid4().hex}",
        "text_plain": re.sub(r"<[^>]+>", " ", draft.get("body_html") or ""),
        "text_html": sanitize_html(draft.get("body_html") or ""),
        "snippet": plain_snippet(re.sub(r"<[^>]+>", " ", draft.get("body_html") or "")),
        "attachments": [],
    }
    _store_parsed_message(
        int(account["id"]), folder_id, None, parsed, b"",
        received_at=_now(), is_read=True, is_starred=False,
    )
    _refresh_folder_counts(folder_id)


def send_draft(draft_id: int, employee_code: str) -> dict:
    draft = _load_draft(draft_id, employee_code)
    account = fetchone(
        "SELECT * FROM mail_accounts WHERE id = :id AND employee_code = :code",
        {"id": draft["account_id"], "code": employee_code},
    )
    if not account:
        raise ValueError("Hộp thư không tồn tại")

    message = _build_message(account, draft)
    outbox_id = insert(
        """
        INSERT INTO mail_outbox (account_id, draft_id, payload_json, status, attempts, created_at)
        VALUES (:account_id, :draft_id, :payload, 'queued', 0, :created_at)
        RETURNING id
        """,
        {
            "account_id": account["id"],
            "draft_id": draft_id,
            "payload": json.dumps({"subject": draft.get("subject"), "to": draft.get("to_json")}, ensure_ascii=False),
            "created_at": _now(),
        },
    )
    try:
        if account.get("is_demo") or account.get("provider") == "demo":
            _insert_sent_copy(account, draft, message)
        else:
            password = decrypt_secret(account.get("secret_encrypted") or "")
            _smtp_send(account, message, password)
        execute(
            "UPDATE mail_outbox SET status = 'sent', sent_at = :sent_at WHERE id = :id",
            {"sent_at": _now(), "id": outbox_id},
        )
        execute("DELETE FROM mail_drafts WHERE id = :id", {"id": draft_id})
        _publish_mail_event("mail_sent", {"account_id": account["id"], "draft_id": draft_id})
        return {"ok": True, "outbox_id": outbox_id}
    except Exception as exc:
        execute(
            "UPDATE mail_outbox SET status = 'failed', attempts = attempts + 1, last_error = :error WHERE id = :id",
            {"error": str(exc)[:2000], "id": outbox_id},
        )
        raise
