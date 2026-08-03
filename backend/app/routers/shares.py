"""
File Sharing module — share files from any storage (SMB/FTP/Google Drive).

Access model:
  - ALL    -> every authenticated internal user
  - DEPT   -> authenticated users of the chosen department
  - PUBLIC -> anyone holding the share_token (no login needed)

Security:
  - share_token is a high-entropy random string, used only in public URLs.
  - Management endpoints require a valid session token.
  - Every public access re-checks `expires_at` before piping the stream.
  - For ALL/DEPT shares, OnlyOffice gets a short-lived signed download token
    so the Document Server can fetch the file server-to-server without the
    user's session.
"""
import os
import secrets
import io
import zipfile
import tempfile
from datetime import datetime
from urllib.parse import quote
from fastapi import APIRouter, Query, Request, HTTPException
from pydantic import BaseModel
from ..core.db import fetchall, fetchone, execute, insert
from ..core.auth import verify_token
from .documents import (
    _get_file_bytes,
    _put_file_bytes,
    _OO_MIME,
    _sign_doc_token,
    _verify_doc_token,
    _make_doc_key,
    _resolve_doc_key,
    _oo_document_type,
    _ONLYOFFICE_PUBLIC_URL,
    _ONLYOFFICE_ENABLED,
    _TEMP_TOKEN_EXPIRE,
    _norm_path,
    _path_within,
    _gdrive_folder_within,
    _browse_smb,
    _browse_ftp,
    _browse_gdrive,
    _is_hidden_system_name,
)

router = APIRouter(prefix="/api", tags=["shares"])

_ALLOWED_TYPES = ('ALL', 'DEPT', 'PUBLIC')
_ALLOWED_ITEMS = ('file', 'folder')

# Permissions stored as a comma list in document_shares.permissions:
#   view     — open/preview (always granted; baseline of sharing)
#   download — allow downloading the file / zipping the folder
#   edit     — OnlyOffice edit mode (internal ALL/DEPT only, never PUBLIC)
_ALLOWED_PERMISSIONS = ('view', 'download', 'edit')


def _parse_permissions(share: dict) -> set:
    """Return the permission set of a share (defaults to view+download)."""
    raw = (share.get('permissions') or 'view,download')
    return {p.strip() for p in raw.split(',') if p.strip() in _ALLOWED_PERMISSIONS} | {'view'}


def _normalize_permissions(perms: str, share_type: str) -> str:
    """Validate + canonicalize a comma list of permissions.

    - Keeps only known permission names.
    - 'view' is always granted.
    - PUBLIC shares can never be edited -> 'edit' is stripped.
    """
    allowed = {'view', 'download', 'edit'}
    if share_type == 'PUBLIC':
        allowed.discard('edit')
    chosen = {p.strip() for p in (perms or '').split(',') if p.strip() in allowed}
    chosen.add('view')
    ordered = [p for p in ('view', 'download', 'edit') if p in chosen]
    return ','.join(ordered)

# Limits for the "download folder as .zip" convenience feature.
_ARCHIVE_MAX_FILES = int(os.environ.get('SHARE_ARCHIVE_MAX_FILES', '200'))
_ARCHIVE_MAX_BYTES = int(os.environ.get('SHARE_ARCHIVE_MAX_BYTES', str(200 * 1024 * 1024)))  # 200 MB
_ARCHIVE_MAX_DEPTH = int(os.environ.get('SHARE_ARCHIVE_MAX_DEPTH', '10'))


def _fmt_bytes(n: int) -> str:
    for unit in ('B', 'KB', 'MB', 'GB'):
        if n < 1024 or unit == 'GB':
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def _require_user(user_code: str, token: str, role: str):
    """Validate the session of an internal user."""
    if not user_code or not token:
        raise HTTPException(401, "Thiếu thông tin đăng nhập")
    if not verify_token(user_code, token, role or 'user'):
        raise HTTPException(401, "Phiên đăng nhập không hợp lệ")
    emp = fetchone("SELECT department, full_name FROM employees WHERE employee_code=:code", {"code": user_code})
    return {
        "user_code": user_code,
        "user_role": role or 'user',
        "department": (emp['department'] or '') if emp else '',
        "full_name": (emp['full_name'] or user_code) if emp else user_code,
    }


def _get_share_by_token(share_token: str) -> dict:
    row = fetchone("SELECT * FROM document_shares WHERE share_token=:t", {"t": share_token})
    if not row:
        raise HTTPException(404, "Link chia sẻ không tồn tại")
    return row


def _now_str() -> str:
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def _normalize_expiry(expires_at: str) -> str:
    """Normalize a user-supplied expiry to 'YYYY-MM-DD HH:MM:SS'.

    A bare date means end of that day.
    """
    expires_at = (expires_at or '').strip()
    if not expires_at:
        return ''
    if len(expires_at) == 10 and expires_at[4] == '-' and expires_at[7] == '-':
        return f"{expires_at} 23:59:59"
    if len(expires_at) == 16:  # YYYY-MM-DD HH:MM
        return f"{expires_at}:00"
    return expires_at


def _is_expired(expires_at: str) -> bool:
    if not expires_at:
        return False
    return expires_at <= _now_str()


def _resolve_file_meta(cfg, file_path: str) -> str:
    """Return the base filename for display purposes."""
    return os.path.basename(file_path)


def _build_public_stream(cfg, file_path: str, file_id: str, filename: str, disposition: str = 'inline'):
    """Download file bytes (server-side auth) and return a StreamingResponse.

    `disposition` is 'inline' (preview / OnlyOffice server-to-server fetch,
    only needs the 'view' permission) or 'attachment' (saving a copy, needs
    the 'download' permission).
    """
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    mime_type = _OO_MIME.get(ext)
    if not mime_type:
        import mimetypes
        mime_type, _ = mimetypes.guess_type(filename)
    if not mime_type:
        mime_type = 'application/octet-stream'

    data = _get_file_bytes(cfg, file_path, file_id)

    safe_name = filename.encode('ascii', 'ignore').decode('ascii') or 'document'
    cd = f"{disposition}; filename=\"{safe_name}\"; filename*=UTF-8''{quote(filename)}"

    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        io.BytesIO(data),
        media_type=mime_type,
        headers={
            "Content-Disposition": cd,
            "Content-Length": str(len(data)),
            "Access-Control-Allow-Origin": "*",
            "X-Content-Type-Options": "nosniff",
        }
    )


def _resolve_folder_target(share: dict, cfg: dict, file_path: str, file_id: str = ''):
    """Validate and resolve a file inside a shared folder.

    Returns (absolute_file_path, file_id, display_name). Throws 403 when the
    requested file is outside the shared folder (path traversal for SMB/FTP,
    ancestor check for Google Drive).
    """
    if not file_path:
        raise HTTPException(400, "Thiếu đường dẫn file trong thư mục chia sẻ")

    if cfg['type'] == 'gdrive':
        root_id = share.get('file_id') or share.get('file_path') or cfg.get('remote_path')
        if not _gdrive_folder_within(cfg, root_id, file_path):
            raise HTTPException(403, "File nằm ngoài thư mục được chia sẻ")
        return file_path, (file_id or file_path or ''), os.path.basename(file_path) or 'document'

    root = _norm_path(share.get('file_path', ''))
    target = _norm_path(file_path)
    if not _path_within(root, target):
        raise HTTPException(403, "File nằm ngoài thư mục được chia sẻ")
    return target, (file_id or ''), os.path.basename(target) or 'document'


# ═══════════════════════════════════════════════════════════════
# Management endpoints (require login)
# ═══════════════════════════════════════════════════════════════

class ShareIn(BaseModel):
    config_id: int
    file_path: str
    file_id: str = ''
    file_name: str = ''
    item_type: str = 'file'
    share_type: str = 'ALL'
    department_id: int | None = None
    expires_at: str = ''
    permissions: str = 'view,download'


@router.get("/documents/shares")
def list_shares(
    config_id: int = Query(...),
    file_path: str = Query(...),
    user_code: str = Query(''),
    token: str = Query(''),
    user_role: str = Query('user')
):
    _require_user(user_code, token, user_role)
    rows = fetchall("""
        SELECT s.*, COALESCE(d.name, '') AS department_name
        FROM document_shares s
        LEFT JOIN departments d ON d.id = s.department_id
        WHERE s.config_id=:sid AND s.file_path=:fp
        ORDER BY s.created_at DESC
    """, {"sid": config_id, "fp": file_path})
    for r in rows:
        r['expired'] = _is_expired(r.get('expires_at', ''))
    return {"data": rows}


@router.post("/documents/shares")
def create_share(
    body: ShareIn,
    user_code: str = Query(''),
    token: str = Query(''),
    user_role: str = Query('user')
):
    user = _require_user(user_code, token, user_role)

    if body.share_type not in _ALLOWED_TYPES:
        raise HTTPException(400, "share_type phải là ALL, DEPT hoặc PUBLIC")
    if body.item_type not in _ALLOWED_ITEMS:
        raise HTTPException(400, "item_type phải là 'file' hoặc 'folder'")
    if body.share_type == 'DEPT' and not body.department_id:
        raise HTTPException(400, "Vui lòng chọn phòng ban cho chia sẻ theo phòng ban")

    cfg = fetchone("SELECT * FROM storage_config WHERE id=:id", {"id": body.config_id})
    if not cfg:
        raise HTTPException(404, "Storage config không tồn tại")

    expires_at = _normalize_expiry(body.expires_at)
    permissions = _normalize_permissions(body.permissions, body.share_type)
    filename = body.file_name or _resolve_file_meta(cfg, body.file_path)
    department_id = body.department_id if body.share_type == 'DEPT' else None

    # Reuse an existing share for the same item+target+creator, else create new.
    existing = fetchone("""
        SELECT id FROM document_shares
        WHERE config_id=:sid AND item_type=:it AND file_path=:fp
          AND share_type=:st
          AND COALESCE(department_id, 0) = COALESCE(:did, 0)
          AND created_by=:by
        ORDER BY id DESC LIMIT 1
    """, {"sid": body.config_id, "it": body.item_type, "fp": body.file_path, "st": body.share_type, "did": department_id, "by": user_code})

    now = _now_str()
    share_token = secrets.token_urlsafe(32)
    params = {
        "config_id": body.config_id,
        "item_type": body.item_type,
        "file_path": body.file_path,
        "file_id": body.file_id or '',
        "file_name": filename,
        "share_type": body.share_type,
        "department_id": department_id,
        "share_token": share_token,
        "permissions": permissions,
        "created_by": user_code,
        "created_at": now,
        "updated_at": now,
        "expires_at": expires_at,
    }

    if existing:
        execute("""
            UPDATE document_shares SET
                file_id=:file_id, file_name=:file_name, department_id=:department_id,
                permissions=:permissions, expires_at=:expires_at, updated_at=:updated_at
            WHERE id=:id
        """, {**params, "id": existing['id']})
        row = fetchone("SELECT * FROM document_shares WHERE id=:id", {"id": existing['id']})
    else:
        new_id = insert("""
            INSERT INTO document_shares
                (config_id, item_type, file_path, file_id, file_name, share_type,
                 department_id, share_token, permissions, created_by, created_at, updated_at, expires_at)
            VALUES
                (:config_id, :item_type, :file_path, :file_id, :file_name, :share_type,
                 :department_id, :share_token, :permissions, :created_by, :created_at, :updated_at, :expires_at)
            RETURNING id
        """, params)
        row = fetchone("SELECT * FROM document_shares WHERE id=:id", {"id": new_id})

    return {"success": True, "data": row}


@router.delete("/documents/shares/{share_id}")
def delete_share(
    share_id: int,
    user_code: str = Query(''),
    token: str = Query(''),
    user_role: str = Query('user')
):
    user = _require_user(user_code, token, user_role)
    row = fetchone("SELECT * FROM document_shares WHERE id=:id", {"id": share_id})
    if not row:
        raise HTTPException(404, "Chia sẻ không tồn tại")
    if row.get('created_by') != user_code and user['user_role'] not in ('admin', 'head'):
        raise HTTPException(403, "Bạn không có quyền thu hồi chia sẻ này")
    execute("DELETE FROM document_shares WHERE id=:id", {"id": share_id})
    return {"success": True}


# ═══════════════════════════════════════════════════════════════
# Public endpoints (token-based)
# ═══════════════════════════════════════════════════════════════

@router.get("/shares/{share_token}/info")
def share_info(
    share_token: str,
    user_code: str = Query(''),
    token: str = Query(''),
    user_role: str = Query('user')
):
    share = _get_share_by_token(share_token)
    expired = _is_expired(share.get('expires_at', ''))

    # ALL/DEPT require a valid login; PUBLIC is open.
    if share['share_type'] != 'PUBLIC':
        try:
            _require_user(user_code, token, user_role)
        except HTTPException:
            raise HTTPException(401, "Chia sẻ này chỉ dành cho nhân viên nội bộ. Vui lòng đăng nhập.")

    dept_name = ''
    if share['share_type'] == 'DEPT':
        d = fetchone("SELECT name FROM departments WHERE id=:id", {"id": share.get('department_id')})
        dept_name = d['name'] if d else ''

    return {
        "success": True,
        "data": {
            "id": share['id'],
            "item_type": share.get('item_type', 'file'),
            "file_name": share.get('file_name') or os.path.basename(share['file_path']),
            "share_type": share['share_type'],
            "department_id": share.get('department_id'),
            "department_name": dept_name,
            "permissions": _parse_permissions(share),
            "expires_at": share.get('expires_at', ''),
            "expired": expired,
        }
    }


@router.get("/shares/{share_token}/contents")
def share_contents(
    share_token: str,
    path: str = Query(''),
    user_code: str = Query(''),
    token: str = Query(''),
    user_role: str = Query('user')
):
    """List the children of a shared folder (token-based, no login for PUBLIC).

    `path` is the current location inside the share:
      - SMB/FTP: absolute storage path (e.g. `/Tai lieu/Chung/sub`)
      - GDrive : the Google Drive folder id
    The backend re-validates the location on every request so a guest can
    never browse outside the shared root.
    """
    share = _get_share_by_token(share_token)
    if share.get('item_type', 'file') != 'folder':
        raise HTTPException(400, "Link chia sẻ này không phải là thư mục")
    if _is_expired(share.get('expires_at', '')):
        raise HTTPException(403, "Link chia sẻ đã hết hạn")

    if share['share_type'] != 'PUBLIC':
        try:
            _require_user(user_code, token, user_role)
        except HTTPException:
            raise HTTPException(401, "Chia sẻ này chỉ dành cho nhân viên nội bộ. Vui lòng đăng nhập.")

    cfg = fetchone("SELECT * FROM storage_config WHERE id=:id", {"id": share['config_id']})
    if not cfg:
        raise HTTPException(404, "Storage config không tồn tại")

    entries = []
    current = ''
    try:
        if cfg['type'] == 'gdrive':
            root_id = share.get('file_id') or share.get('file_path') or cfg.get('remote_path')
            current = path or root_id
            if not _gdrive_folder_within(cfg, root_id, current):
                raise HTTPException(403, "Thư mục nằm ngoài phạm vi chia sẻ")
            entries = _browse_gdrive(cfg, current)
            for e in entries:
                e['path'] = e['id']  # navigation uses the Drive id
        else:
            root = _norm_path(share.get('file_path', ''))
            current = _norm_path(path) if path else root
            if not _path_within(root, current):
                raise HTTPException(403, "Thư mục nằm ngoài phạm vi chia sẻ")
            if cfg['type'] == 'ftp':
                entries = _browse_ftp(cfg, current)
            else:
                entries = _browse_smb(cfg, current)
            for e in entries:
                e['path'] = _norm_path(os.path.join(current, e['name']))
    except HTTPException:
        raise
    except Exception as ex:
        raise HTTPException(502, f"Storage error: {str(ex)}")

    return {
        "data": entries,
        "path": current,
        "root_path": share.get('file_path', ''),
        "config": {"id": cfg['id'], "name": cfg['name'], "type": cfg['type']},
    }


def _collect_folder_files(cfg: dict, current: str, is_gdrive: bool):
    """Recursively collect files inside a folder as zip-safe entries.

    Returns (files, total_bytes) where each file is:
      {path, file_id, rel, size}
    Respects _ARCHIVE_* limits: stops walking as soon as a limit is hit.
    """
    files = []
    total = 0

    def walk(path, rel, depth):
        nonlocal total
        if depth > _ARCHIVE_MAX_DEPTH or len(files) >= _ARCHIVE_MAX_FILES or total >= _ARCHIVE_MAX_BYTES:
            return
        try:
            if is_gdrive:
                entries = _browse_gdrive(cfg, path)
            elif cfg['type'] == 'ftp':
                entries = _browse_ftp(cfg, path)
            else:
                entries = _browse_smb(cfg, path)
        except Exception:
            return
        for e in entries:
            if len(files) >= _ARCHIVE_MAX_FILES or total >= _ARCHIVE_MAX_BYTES:
                return
            if _is_hidden_system_name(e.get('name', '')):
                continue
            child_rel = e['name'] if not rel else f"{rel}/{e['name']}"
            if e['is_dir']:
                child_path = e['id'] if is_gdrive else _norm_path(os.path.join(path, e['name']))
                walk(child_path, child_rel, depth + 1)
            else:
                sz = 0
                try:
                    sz = int(e.get('size') or 0)
                except (TypeError, ValueError):
                    sz = 0
                total += sz
                child_path = e['id'] if is_gdrive else _norm_path(os.path.join(path, e['name']))
                files.append({
                    "path": child_path,
                    "file_id": (e.get('id', '') if is_gdrive else ''),
                    "rel": child_rel,
                    "size": sz,
                })

    walk(current, '', 0)
    return files, total


@router.get("/shares/{share_token}/archive")
def share_archive(
    share_token: str,
    path: str = Query(''),
    user_code: str = Query(''),
    token: str = Query(''),
    user_role: str = Query('user')
):
    """Download the current shared folder as a .zip (only when small enough).

    Returns 413 (with a friendly message) when the folder exceeds the limits,
    otherwise streams a ZIP generated on the fly into a spooled temp file.
    """
    share = _get_share_by_token(share_token)
    if share.get('item_type', 'file') != 'folder':
        raise HTTPException(400, "Link chia sẻ này không phải là thư mục")
    if _is_expired(share.get('expires_at', '')):
        raise HTTPException(403, "Link chia sẻ đã hết hạn")
    if 'download' not in _parse_permissions(share):
        raise HTTPException(403, "Link chia sẻ này không cho phép tải xuống")

    # Same authorization model as /download: PUBLIC open, ALL/DEPT via
    # session or signed token.
    if share['share_type'] != 'PUBLIC':
        authorized = False
        if token:
            payload = _verify_doc_token(token)
            if payload and payload.get('share_token') == share_token:
                exp = payload.get('exp')
                authorized = (exp is None) or (int(exp) >= int(_time_now()))
        if not authorized:
            user = _require_user(user_code, token, user_role)
            authorized = True
            if share['share_type'] == 'DEPT':
                d = fetchone("SELECT name FROM departments WHERE id=:id", {"id": share.get('department_id')})
                dept_name = d['name'] if d else ''
                if not dept_name or dept_name != user['department']:
                    authorized = False
        if not authorized:
            raise HTTPException(403, "Bạn không được phép truy cập link chia sẻ này")

    cfg = fetchone("SELECT * FROM storage_config WHERE id=:id", {"id": share['config_id']})
    if not cfg:
        raise HTTPException(404, "Storage config không tồn tại")

    is_gdrive = cfg['type'] == 'gdrive'
    if is_gdrive:
        root_id = share.get('file_id') or share.get('file_path') or cfg.get('remote_path')
        current = path or root_id
        if not _gdrive_folder_within(cfg, root_id, current):
            raise HTTPException(403, "Thư mục nằm ngoài phạm vi chia sẻ")
    else:
        root = _norm_path(share.get('file_path', ''))
        current = _norm_path(path) if path else root
        if not _path_within(root, current):
            raise HTTPException(403, "Thư mục nằm ngoài phạm vi chia sẻ")

    files, total_bytes = _collect_folder_files(cfg, current, is_gdrive)

    if len(files) > _ARCHIVE_MAX_FILES or total_bytes > _ARCHIVE_MAX_BYTES:
        raise HTTPException(
            413,
            f"Thư mục quá lớn để nén (.zip): {len(files)} file, {_fmt_bytes(total_bytes)}. "
            f"Giới hạn {_ARCHIVE_MAX_FILES} file / {_fmt_bytes(_ARCHIVE_MAX_BYTES)}. "
            "Vui lòng tải từng file bên trong thư mục.",
        )

    folder_name = (share.get('file_name') or 'folder').strip()
    zip_name = f"{folder_name}.zip"

    spool = tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024)
    try:
        with zipfile.ZipFile(spool, 'w', zipfile.ZIP_DEFLATED) as zf:
            for f in files:
                data = _get_file_bytes(cfg, f['path'], f['file_id'])
                zf.writestr(f['rel'], data)
        spool.seek(0, 2)  # SEEK_END
        zip_size = spool.tell()
        spool.seek(0)
    except HTTPException:
        spool.close()
        raise
    except Exception as exc:
        spool.close()
        raise HTTPException(500, f"Lỗi khi tạo file .zip: {exc}")

    safe_name = zip_name.encode('ascii', 'ignore').decode('ascii') or 'folder.zip'

    def iter_spool():
        # The spool must stay open until Starlette finishes streaming the
        # body (which happens AFTER this endpoint returns). Closing it here
        # (in the generator's finally) instead of in the endpoint guarantees
        # we never read from a closed file mid-stream.
        try:
            while True:
                chunk = spool.read(64 * 1024)
                if not chunk:
                    break
                yield chunk
        finally:
            spool.close()

    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        iter_spool(),
        media_type='application/zip',
        headers={
            "Content-Disposition": f"attachment; filename=\"{safe_name}\"; filename*=UTF-8''{quote(zip_name)}",
            "Content-Length": str(zip_size),
            "X-Content-Type-Options": "nosniff",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.get("/shares/{share_token}/download")
def share_download(
    share_token: str,
    token: str = Query(''),
    user_code: str = Query(''),
    user_role: str = Query('user'),
    file_path: str = Query(''),
    file_id: str = Query(''),
    file_name: str = Query(''),
    disposition: str = Query('inline'),
):
    share = _get_share_by_token(share_token)
    if _is_expired(share.get('expires_at', '')):
        raise HTTPException(403, "Link chia sẻ đã hết hạn")
    # Preview/serving (inline) only needs the baseline 'view' permission;
    # saving a copy (attachment) requires the 'download' permission.
    if disposition != 'inline' and 'download' not in _parse_permissions(share):
        raise HTTPException(403, "Link chia sẻ này không cho phép tải xuống")

    # PUBLIC -> anyone. ALL/DEPT -> valid session OR valid signed download token
    # (the signed token lets OnlyOffice Document Server fetch server-to-server).
    if share['share_type'] != 'PUBLIC':
        authorized = False
        if token:
            payload = _verify_doc_token(token)
            if payload and payload.get('share_token') == share_token:
                exp = payload.get('exp')
                authorized = (exp is None) or (int(exp) >= int(_time_now()))
                # For folder shares the signed token pins the exact file.
                if authorized and share.get('item_type', 'file') == 'folder':
                    if payload.get('file_path'):
                        file_path = file_path or payload['file_path']
                        file_id = file_id or payload.get('file_id', '')
                        file_name = file_name or payload.get('file_name', '')
        if not authorized:
            user = _require_user(user_code, token, user_role)
            authorized = True
            if share['share_type'] == 'DEPT':
                d = fetchone("SELECT name FROM departments WHERE id=:id", {"id": share.get('department_id')})
                dept_name = d['name'] if d else ''
                if not dept_name or dept_name != user['department']:
                    authorized = False
        if not authorized:
            raise HTTPException(403, "Bạn không được phép truy cập link chia sẻ này")

    cfg = fetchone("SELECT * FROM storage_config WHERE id=:id", {"id": share['config_id']})
    if not cfg:
        raise HTTPException(404, "Storage config không tồn tại")

    if share.get('item_type', 'file') == 'folder':
        abs_path, resolved_id, resolved_name = _resolve_folder_target(share, cfg, file_path, file_id)
        filename = file_name or resolved_name
    else:
        abs_path = share['file_path']
        resolved_id = share.get('file_id', '')
        filename = share.get('file_name') or os.path.basename(share['file_path'])

    return _build_public_stream(cfg, abs_path, resolved_id, filename, disposition)


@router.get("/shares/{share_token}/onlyoffice/config")
def share_onlyoffice_config(
    request: Request,
    share_token: str,
    user_code: str = Query(''),
    token: str = Query(''),
    user_role: str = Query('user'),
    file_path: str = Query(''),
    file_id: str = Query(''),
    file_name: str = Query(''),
):
    if not _ONLYOFFICE_ENABLED:
        raise HTTPException(503, "OnlyOffice Document Server không được bật")

    share = _get_share_by_token(share_token)
    if _is_expired(share.get('expires_at', '')):
        raise HTTPException(403, "Link chia sẻ đã hết hạn")

    is_public = share['share_type'] == 'PUBLIC'
    if not is_public:
        _require_user(user_code, token, user_role)

    perms = _parse_permissions(share)
    # PUBLIC shares are always read-only; 'edit' is only honoured for
    # internal ALL/DEPT shares that explicitly grant it.
    can_edit = (not is_public) and 'edit' in perms
    can_download = 'download' in perms

    cfg = fetchone("SELECT * FROM storage_config WHERE id=:id", {"id": share['config_id']})
    if not cfg:
        raise HTTPException(404, "Storage config không tồn tại")

    # Folder share: the target file is given by file_path/file_id and must be
    # verified to live inside the shared folder (inherited permission).
    if share.get('item_type', 'file') == 'folder':
        abs_path, resolved_id, resolved_name = _resolve_folder_target(share, cfg, file_path, file_id)
        filename = file_name or resolved_name
        download_file_path = abs_path
        download_file_id = resolved_id
    else:
        abs_path = share['file_path']
        resolved_id = share.get('file_id', '')
        filename = file_name or share.get('file_name') or os.path.basename(share['file_path'])
        download_file_path = share['file_path']
        download_file_id = share.get('file_id', '')

    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if ext not in _OO_MIME:
        raise HTTPException(400, f"Định dạng không hỗ trợ xem online: {ext}")

    backend_public_url = os.environ.get('BACKEND_PUBLIC_URL', '').strip()
    if backend_public_url:
        base_url = backend_public_url.rstrip('/')
    else:
        forwarded_proto = request.headers.get("x-forwarded-proto", "http")
        forwarded_host = request.headers.get("x-forwarded-host") or request.headers.get("host") or "localhost:8000"
        base_url = f"{forwarded_proto}://{forwarded_host}".rstrip('/')

    # For ALL/DEPT (or PUBLIC, for consistency) embed a short-lived signed
    # download token so OnlyOffice Document Server can fetch the file
    # server-to-server without the user's session cookie. For folder shares
    # the token also pins the exact file path.
    download_token = _sign_doc_token({
        "share_token": share_token,
        "file_path": download_file_path,
        "file_id": download_file_id,
        "file_name": filename,
        "exp": int(_time_now()) + _TEMP_TOKEN_EXPIRE,
    })

    document_url = f"{base_url}/api/shares/{share_token}/download?token={download_token}"
    callback_url = f"{base_url}/api/shares/{share_token}/callback"

    doc_service = _ONLYOFFICE_PUBLIC_URL.rstrip('/')
    document_type = _oo_document_type(ext)
    doc_key = _make_doc_key(cfg['id'], download_file_path, download_file_id)

    editor_config = {
        "document": {
            "fileType": ext,
            "key": doc_key,
            "title": filename,
            "url": document_url,
            "permissions": {
                "edit": can_edit,
                "download": can_download,
                "print": True,
                "review": can_edit,
                "comment": can_edit,
                "copy": can_download,
            },
        },
        "editorConfig": {
            "callbackUrl": callback_url,
            "lang": "vi",
            "mode": "edit" if can_edit else "view",
            "user": {
                "id": user_code or "guest",
                "name": user_code or "Guest",
            },
            "customization": {
                "autosave": can_edit,
                "forcesave": can_edit,
                "chat": False,
                "compactHeader": False,
                "compactToolbar": False,
                "help": False,
                "plugins": False,
                "statusBar": True,
                "toolbarDocked": "top",
            },
        },
        "documentType": document_type,
        "height": "100%",
        "width": "100%",
        "type": "desktop",
    }

    editor_config["token"] = _sign_doc_token(editor_config)
    editor_config["_docsApiUrl"] = f"{doc_service}/web-apps/apps/api/documents/api.js"
    return editor_config


@router.post("/shares/{share_token}/callback")
def share_callback(share_token: str, body: dict = None):
    """OnlyOffice save callback for shared documents.

    PUBLIC shares are always view-only -> never write back.
    Internal ALL/DEPT shares that grant the 'edit' permission save the
    edited file back to storage (same flow as the internal module).
    """
    import logging
    share = _get_share_by_token(share_token)
    body = body or {}
    status = body.get('status', 0)
    key = body.get('key', '')
    logging.info(f"[SHARE] OnlyOffice callback status={status}, key={key[:40] if key else ''}...")

    # status 2 = ready for save, 6 = force-save
    if status in (2, 6):
        perms = _parse_permissions(share)
        can_edit = share.get('share_type') != 'PUBLIC' and 'edit' in perms
        if can_edit:
            url = body.get('url', '')
            if not url:
                raise HTTPException(400, "No download URL provided for saving")
            payload = _resolve_doc_key(key) if key else None
            if not payload:
                raise HTTPException(400, "Invalid document key")
            config_id = payload.get("config_id")
            file_path = payload.get("file_path")
            if not config_id or not file_path:
                raise HTTPException(400, "Invalid key payload")
            cfg = fetchone("SELECT * FROM storage_config WHERE id=:id", {"id": config_id})
            if not cfg:
                raise HTTPException(404, "Storage config not found")
            # Re-validate the target lives inside the shared folder.
            if share.get('item_type', 'file') == 'folder':
                _resolve_folder_target(share, cfg, file_path, payload.get("file_id", ''))
            import requests
            resp = requests.get(url, timeout=60)
            if resp.status_code != 200:
                raise HTTPException(502, f"Failed to download saved file from ONLYOFFICE: HTTP {resp.status_code}")
            _put_file_bytes(cfg, file_path, resp.content, payload.get("file_id", ""))
            logging.info(f"[SHARE] File saved successfully: {file_path}")
        else:
            logging.info("[SHARE] Save callback ignored (view-only share)")
    return {"error": 0}


def _time_now() -> int:
    import time
    return int(time.time())
