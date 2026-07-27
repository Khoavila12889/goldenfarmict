import ftplib
import os
import json
from datetime import datetime
from urllib.parse import unquote
from fastapi import APIRouter, Query, HTTPException, Body
from pydantic import BaseModel
from ..core.db import fetchall, fetchone, execute, insert
from ..core.auth import verify_token


def _require_auth(admin_code: str, token: str, role: str):
    if role not in ("admin", "head"):
        raise HTTPException(403, "Admin/Head access required")
    if not verify_token(admin_code, token, role):
        raise HTTPException(401, "Invalid token")
    return True

try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    _GOOGLE_AVAILABLE = True
except ImportError:
    _GOOGLE_AVAILABLE = False

router = APIRouter(prefix="/api/documents", tags=["documents"])

# ─── Storage Config CRUD (admin) ────────────────────────────────

@router.get("/config")
def list_configs(user_code: str = Query(''), user_role: str = Query('')):
    if user_role in ('admin', 'head'):
        rows = fetchall("SELECT * FROM storage_config ORDER BY name")
    else:
        rows = fetchall("""
            SELECT DISTINCT sc.* FROM storage_config sc
            JOIN storage_permissions sp ON sp.storage_id = sc.id
            WHERE sc.is_active=1
              AND (sp.role=:role OR sp.employee_code=:code
                   OR sp.department IN (SELECT COALESCE(department,'') FROM employees WHERE employee_code=:code)
                   OR (sp.department='' AND sp.role='' AND sp.employee_code=''))
            ORDER BY sc.name
        """, {"role": user_role, "code": user_code})
    for r in rows:
        if r.get('password'):
            r['password'] = '********'
    return {"data": rows}

@router.get("/config/{config_id}")
def get_config(config_id: int):
    row = fetchone("SELECT * FROM storage_config WHERE id=:id", {"id": config_id})
    if not row:
        raise HTTPException(404, "Config not found")
    if row.get('password'):
        row['password'] = '********'
    return {"data": row}

@router.post("/config")
def create_config(
    body: dict,
    admin_code: str = Query(''),
    token: str = Query(''),
    role: str = Query('')
):
    _require_auth(admin_code, token, role)
    new_id = insert("""
        INSERT INTO storage_config (name, type, host, port, username, password, remote_path, domain)
        VALUES (:name, :type, :host, :port, :username, :password, :remote_path, :domain)
        RETURNING id
    """, {
        "name": body.get('name', ''),
        "type": body.get('type', 'smb'),
        "host": body.get('host', ''),
        "port": 0 if body.get('type') == 'gdrive' else (445 if body.get('type') == 'smb' else 21),
        "username": body.get('username', ''),
        "password": body.get('password', ''),
        "remote_path": body.get('remote_path', '/'),
        "domain": body.get('domain', ''),
    })
    return {"success": True, "id": new_id}

@router.put("/config/{config_id}")
def update_config(
    config_id: int,
    body: dict,
    admin_code: str = Query(''),
    token: str = Query(''),
    role: str = Query('')
):
    _require_auth(admin_code, token, role)
    existing = fetchone("SELECT * FROM storage_config WHERE id=:id", {"id": config_id})
    if not existing:
        raise HTTPException(404, "Config not found")
    fields = ['name', 'type', 'host', 'port', 'username', 'remote_path', 'domain']
    for f in fields:
        if f in body:
            existing[f] = body[f]
    if 'password' in body and body['password'] and body['password'] != '********':
        existing['password'] = body['password']
    execute("""
        UPDATE storage_config SET name=:name, type=:type, host=:host, port=:port, username=:username, password=:password, remote_path=:remote_path, domain=:domain, updated_at=CURRENT_TIMESTAMP
        WHERE id=:id
    """, {
        "name": existing['name'], "type": existing['type'], "host": existing['host'],
        "port": existing['port'], "username": existing['username'], "password": existing['password'],
        "remote_path": existing['remote_path'], "domain": existing['domain'], "id": config_id
    })
    return {"success": True}

@router.delete("/config/{config_id}")
def delete_config(
    config_id: int,
    admin_code: str = Query(''),
    token: str = Query(''),
    role: str = Query('')
):
    _require_auth(admin_code, token, role)
    execute("DELETE FROM storage_permissions WHERE storage_id=:id", {"id": config_id})
    execute("DELETE FROM storage_config WHERE id=:id", {"id": config_id})
    return {"success": True}

# ─── Test Connection ────────────────────────────────────────────

def _test_connection_raw(cfg):
    try:
        if cfg['type'] == 'ftp':
            ftp = ftplib.FTP()
            ftp.connect(cfg['host'], cfg['port'] or 21, timeout=10)
            ftp.login(cfg['username'] or 'anonymous', cfg['password'] or '')
            ftp.voidcmd("NOOP")
            ftp.quit()
            return {"success": True, "message": "FTP connected successfully"}
        elif cfg['type'] == 'smb':
            try:
                from smb.SMBConnection import SMBConnection
                conn_smb = SMBConnection(cfg['username'], cfg['password'], 'goldenfarm', cfg['host'], domain=cfg.get('domain', ''))
                connected = conn_smb.connect(cfg['host'], cfg['port'] or 445)
                if connected:
                    conn_smb.close()
                    return {"success": True, "message": "SMB connected successfully"}
                else:
                    return {"success": False, "message": "SMB connection failed"}
            except ImportError:
                return {"success": False, "message": "SMB library not installed (pip install pysmb)"}
        elif cfg['type'] == 'gdrive':
            return _test_gdrive(cfg)
        else:
            return {"success": False, "message": f"Unsupported type: {cfg['type']}"}
    except Exception as ex:
        return {"success": False, "message": str(ex)}

def _test_gdrive(cfg):
    if not _GOOGLE_AVAILABLE:
        return {"success": False, "message": "Google libraries not installed (pip install google-api-python-client google-auth)"}
    try:
        creds_dict = json.loads(cfg['password'])
        creds = service_account.Credentials.from_service_account_info(creds_dict)
        service = build('drive', 'v3', credentials=creds)
        folder_id = cfg['remote_path'] if cfg['remote_path'] else 'root'
        service.files().get(fileId=folder_id, fields="id, name").execute()
        return {"success": True, "message": "Google Drive connected successfully"}
    except json.JSONDecodeError:
        return {"success": False, "message": "Service Account JSON không hợp lệ"}
    except Exception as e:
        return {"success": False, "message": f"Google Drive error: {str(e)}"}

@router.post("/test-connection")
def test_connection_direct(body: dict):
    return _test_connection_raw(body)

@router.post("/config/{config_id}/test")
def test_connection(config_id: int):
    cfg = fetchone("SELECT * FROM storage_config WHERE id=:id", {"id": config_id})
    if not cfg:
        raise HTTPException(404, "Config not found")
    return _test_connection_raw(cfg)

# ─── Browse Files/Folders ───────────────────────────────────────

@router.get("/browse/{config_id}")
def browse(config_id: int, path: str = Query('/'), user_code: str = Query(''), user_role: str = Query('user')):
    cfg = fetchone("SELECT * FROM storage_config WHERE id=:id AND is_active=1", {"id": config_id})
    if not cfg:
        raise HTTPException(404, "Storage not found or inactive")

    allowed = _check_folder_permission(config_id, path, user_code, user_role)
    if not allowed:
        if path in ('/', ''):
            any_perm = fetchone("""
                SELECT 1 AS ok FROM storage_permissions sp
                WHERE sp.storage_id=:sid
                  AND (sp.role=:role OR sp.employee_code=:code
                       OR sp.department IN (SELECT COALESCE(department,'') FROM employees WHERE employee_code=:code)
                       OR (sp.department='' AND sp.role='' AND sp.employee_code=''))
                LIMIT 1
            """, {"sid": config_id, "role": user_role, "code": user_code})
            if not any_perm:
                raise HTTPException(403, "No permission to access this folder")
        else:
            raise HTTPException(403, "No permission to access this folder")

    entries = []
    try:
        if cfg['type'] == 'ftp':
            entries = _browse_ftp(cfg, path)
        elif cfg['type'] == 'smb':
            entries = _browse_smb(cfg, path)
        elif cfg['type'] == 'gdrive':
            entries = _browse_gdrive(cfg, path)
    except Exception as ex:
        raise HTTPException(502, f"Storage error: {str(ex)}")

    filtered = []
    for e in entries:
        if e['is_dir']:
            sub_path = os.path.join(path, e['name']).replace('\\', '/')
            if _check_folder_permission(config_id, sub_path, user_code, user_role):
                filtered.append(e)
        else:
            filtered.append(e)

    return {"data": filtered, "path": path, "config": {"id": cfg['id'], "name": cfg['name'], "type": cfg['type']}}

def _browse_ftp(cfg, path):
    ftp = ftplib.FTP()
    ftp.connect(cfg['host'], cfg['port'] or 21, timeout=15)
    ftp.login(cfg['username'] or 'anonymous', cfg['password'] or '')
    base = cfg['remote_path'] or '/'
    full_path = os.path.join(base, path.lstrip('/')).replace('\\', '/')
    try:
        ftp.cwd(full_path)
    except Exception:
        ftp.quit()
        raise HTTPException(404, "Path not found on FTP server")
    items = []
    try:
        ftp.retrlines('LIST', items.append)
    except Exception:
        pass
    ftp.quit()
    return _parse_ftp_list(items)

def _parse_ftp_list(lines):
    entries = []
    for line in lines:
        parts = line.split()
        if len(parts) < 9:
            continue
        name = ' '.join(parts[8:])
        if name in ('.', '..'):
            continue
        perms = parts[0]
        is_dir = perms.startswith('d')
        raw_size = parts[4] if len(parts) > 4 else '0'
        try:
            size = int(raw_size)
        except ValueError:
            size = 0
        date_parts = parts[5:8] if len(parts) > 7 else []
        modified = ''
        if len(date_parts) == 3:
            try:
                modified = datetime.strptime(' '.join(date_parts), '%b %d %H:%M').replace(year=datetime.now().year).isoformat()
            except ValueError:
                try:
                    modified = datetime.strptime(' '.join(date_parts), '%b %d %Y').isoformat()
                except ValueError:
                    modified = ''
        entries.append({"name": name, "is_dir": is_dir, "size": size, "modified": modified})
    return entries

def _browse_smb(cfg, path):
    try:
        from smb.SMBConnection import SMBConnection
    except ImportError:
        raise HTTPException(502, "SMB library not installed (pip install pysmb)")
    conn_smb = SMBConnection(cfg['username'], cfg['password'], 'goldenfarm', cfg['host'], domain=cfg.get('domain', ''))
    connected = conn_smb.connect(cfg['host'], cfg['port'] or 445)
    if not connected:
        raise HTTPException(502, "Cannot connect to SMB server")
    share = cfg.get('remote_path', '').strip('/')
    if not share:
        conn_smb.close()
        raise HTTPException(400, "Remote Path / Share name is required for SMB")
    smb_path = path.lstrip('/').replace('/', '\\')
    try:
        shares = conn_smb.listPath(share, smb_path if smb_path else '\\')
    except Exception as e:
        conn_smb.close()
        raise HTTPException(502, f"SMB list error: {str(e)}")
    entries = []
    for f in shares:
        if f.filename in ('.', '..'):
            continue
        modified = ''
        try:
            if hasattr(f, 'last_write_time') and f.last_write_time:
                modified = datetime.fromtimestamp(f.last_write_time).isoformat()
        except Exception:
            pass
        entries.append({"name": f.filename, "is_dir": f.isDirectory, "size": f.file_size, "modified": modified})
    conn_smb.close()
    return entries

def _browse_gdrive(cfg, folder_id):
    if not _GOOGLE_AVAILABLE:
        raise HTTPException(502, "Google libraries not installed (pip install google-api-python-client google-auth)")
    try:
        creds_dict = json.loads(cfg['password'])
        creds = service_account.Credentials.from_service_account_info(creds_dict)
        service = build('drive', 'v3', credentials=creds)
    except json.JSONDecodeError:
        raise HTTPException(502, "Service Account JSON không hợp lệ")
    except Exception as e:
        raise HTTPException(502, f"Google Drive auth error: {str(e)}")

    current_id = folder_id if folder_id and folder_id not in ('/', '') else (cfg['remote_path'] or 'root')

    try:
        results = service.files().list(
            q=f"'{current_id}' in parents and trashed=false",
            fields="files(id, name, mimeType, size, modifiedTime)",
            pageSize=500,
            orderBy="folder,name"
        ).execute()
    except Exception as e:
        raise HTTPException(502, f"Google Drive list error: {str(e)}")

    entries = []
    for f in results.get('files', []):
        is_dir = f['mimeType'] == 'application/vnd.google-apps.folder'
        entries.append({
            "id": f['id'],
            "name": f['name'],
            "is_dir": is_dir,
            "size": int(f.get('size', 0)) if not is_dir else 0,
            "modified": f.get('modifiedTime', ''),
        })
    return entries

# ─── Folder Permissions CRUD ────────────────────────────────────

@router.get("/departments")
def list_departments():
    rows = fetchall("SELECT id, name FROM departments ORDER BY name")
    return {"data": rows}

@router.get("/permissions/{config_id}")
def list_permissions(
    config_id: int,
    admin_code: str = Query(''),
    token: str = Query(''),
    role: str = Query('')
):
    _require_auth(admin_code, token, role)
    rows = fetchall("""
        SELECT sp.*, COALESCE(d.name, sp.department) AS department_name
        FROM storage_permissions sp
        LEFT JOIN departments d ON d.name = sp.department
        WHERE sp.storage_id=:sid ORDER BY sp.folder_path, sp.target_type DESC, sp.department
    """, {"sid": config_id})
    for r in rows:
        for k in ('can_read','can_write','can_edit','can_delete','allow_download','can_reshare'):
            r[k] = bool(r.get(k, 0))
    return {"data": rows}

@router.post("/permissions")
def create_permission(
    body: dict,
    admin_code: str = Query(''),
    token: str = Query(''),
    role: str = Query('')
):
    _require_auth(admin_code, token, role)
    new_id = insert("""
        INSERT INTO storage_permissions (storage_id, folder_path, role, employee_code, department, permission)
        VALUES (:sid, :fp, :role, :ec, :dept, :perm) RETURNING id
    """, {
        "sid": body.get('storage_id'),
        "fp": body.get('folder_path', '/'),
        "role": body.get('role', ''),
        "ec": body.get('employee_code', ''),
        "dept": body.get('department', ''),
        "perm": body.get('permission', 'read'),
    })
    return {"success": True, "id": new_id}

@router.post("/permissions/share")
def create_share_permission(
    body: dict = Body(...),
    admin_code: str = Query(''),
    token: str = Query(''),
    role: str = Query('')
):
    _require_auth(admin_code, token, role)
    storage_id = body.get('storage_id')
    folder_path = body.get('folder_path', '/')
    target_type = body.get('target_type', 'DEPARTMENT')
    department = body.get('department', '')
    perm_data = {
        'can_read': 1 if body.get('can_read', True) else 0,
        'can_write': 1 if body.get('can_write', False) else 0,
        'can_edit': 1 if body.get('can_edit', False) else 0,
        'can_delete': 1 if body.get('can_delete', False) else 0,
        'allow_download': 1 if body.get('allow_download', True) else 0,
        'can_reshare': 1 if body.get('can_reshare', False) else 0,
        'expires_at': body.get('expires_at', ''),
    }
    if not storage_id:
        raise HTTPException(400, "Missing storage_id")

    if target_type == 'EVERYONE':
        existing = fetchone("""
            SELECT id FROM storage_permissions
            WHERE storage_id=:sid AND folder_path=:fp AND target_type='EVERYONE'
               AND role='' AND employee_code='' AND department=''
        """, {"sid": storage_id, "fp": folder_path})
    else:
        if not department:
            raise HTTPException(400, "Missing department for DEPARTMENT target")
        existing = fetchone("""
            SELECT id FROM storage_permissions
            WHERE storage_id=:sid AND folder_path=:fp AND target_type='DEPARTMENT'
               AND department=:dept AND role='' AND employee_code=''
        """, {"sid": storage_id, "fp": folder_path, "dept": department})

    if existing:
        execute("""
            UPDATE storage_permissions SET
                can_read=:cr, can_write=:cw, can_edit=:ce, can_delete=:cd,
                allow_download=:ad, can_reshare=:cr2, expires_at=:ea,
                updated_at=CURRENT_TIMESTAMP
            WHERE id=:id
        """, {
            "cr": perm_data['can_read'], "cw": perm_data['can_write'], "ce": perm_data['can_edit'],
            "cd": perm_data['can_delete'], "ad": perm_data['allow_download'], "cr2": perm_data['can_reshare'],
            "ea": perm_data['expires_at'], "id": existing['id']
        })
    else:
        execute("""
            INSERT INTO storage_permissions
                (storage_id, folder_path, target_type, department,
                 can_read, can_write, can_edit, can_delete,
                 allow_download, can_reshare, expires_at,
                 role, employee_code, permission)
            VALUES (:sid, :fp, :tt, :dept,
                    :cr, :cw, :ce, :cd,
                    :ad, :cr2, :ea,
                    '', '', 'custom')
        """, {
            "sid": storage_id, "fp": folder_path, "tt": target_type,
            "dept": department if target_type == 'DEPARTMENT' else '',
            "cr": perm_data['can_read'], "cw": perm_data['can_write'], "ce": perm_data['can_edit'],
            "cd": perm_data['can_delete'], "ad": perm_data['allow_download'], "cr2": perm_data['can_reshare'],
            "ea": perm_data['expires_at'],
        })
    target_label = department if target_type == 'DEPARTMENT' else 'Tất cả phòng ban'
    return {"success": True, "message": f"Đã cập nhật quyền cho {target_label}"}

@router.put("/permissions/{perm_id}")
def update_permission(
    perm_id: int,
    body: dict = Body(...),
    admin_code: str = Query(''),
    token: str = Query(''),
    role: str = Query('')
):
    """Update granular permissions for an existing permission entry"""
    _require_auth(admin_code, token, role)
    existing = fetchone("SELECT id FROM storage_permissions WHERE id=:id", {"id": perm_id})
    if not existing:
        raise HTTPException(404, "Permission not found")
    fields = ['can_read','can_write','can_edit','can_delete','allow_download','can_reshare','expires_at','folder_path']
    updates = {k: body[k] for k in fields if k in body}
    if not updates:
        raise HTTPException(400, "No fields to update")
    for k in ('can_read','can_write','can_edit','can_delete','allow_download','can_reshare'):
        if k in updates:
            updates[k] = 1 if updates[k] else 0
    set_clause = ", ".join(f"{k}=:{k}" for k in updates)
    params = {k: v for k, v in updates.items()}
    params['perm_id'] = perm_id
    execute(f"UPDATE storage_permissions SET {set_clause}, updated_at=CURRENT_TIMESTAMP WHERE id=:perm_id", params)
    return {"success": True}

@router.delete("/permissions/{perm_id}")
def delete_permission(
    perm_id: int,
    admin_code: str = Query(''),
    token: str = Query(''),
    role: str = Query('')
):
    _require_auth(admin_code, token, role)
    execute("DELETE FROM storage_permissions WHERE id=:id", {"id": perm_id})
    return {"success": True}

# ─── Permission Check Helper ────────────────────────────────────

def _check_folder_permission(storage_id, folder_path, user_code, user_role):
    folder_path = folder_path.replace('\\', '/').rstrip('/') or '/'
    if user_role in ('admin', 'head'):
        return True
    row = fetchone("SELECT COUNT(*) AS cnt FROM storage_permissions WHERE storage_id=:id", {"id": storage_id})
    if row["cnt"] == 0:
        return True
    user_dept = ''
    emp = fetchone("SELECT department FROM employees WHERE employee_code=:code", {"code": user_code})
    if emp:
        user_dept = emp['department'] or ''
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    row = fetchone("""
        SELECT can_read, allow_download, expires_at FROM storage_permissions
        WHERE storage_id=:sid
          AND (
            target_type='EVERYONE'
            OR (target_type='DEPARTMENT' AND department != '' AND department=:dept)
            OR (role=:role)
            OR (employee_code=:code)
            OR (department='' AND role='' AND employee_code='')
          )
          AND (:fp = folder_path OR :fp2 ILIKE folder_path || '/%' OR folder_path = '/')
          AND (expires_at = '' OR expires_at > :now)
        ORDER BY
          CASE target_type WHEN 'EVERYONE' THEN 0 ELSE 1 END,
          length(folder_path) DESC
        LIMIT 1
    """, {
        "sid": storage_id, "dept": user_dept, "role": user_role, "code": user_code,
        "fp": folder_path, "fp2": folder_path, "now": now_str
    })
    if not row:
        return False
    return bool(row['can_read'])


def _check_download_allowed(storage_id, folder_path, user_code, user_role):
    """Check if user is allowed to download files from this folder"""
    folder_path = folder_path.replace('\\', '/').rstrip('/') or '/'
    if user_role in ('admin', 'head'):
        return True
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    user_dept = ''
    emp = fetchone("SELECT department FROM employees WHERE employee_code=:code", {"code": user_code})
    if emp:
        user_dept = emp['department'] or ''
    row = fetchone("""
        SELECT allow_download FROM storage_permissions
        WHERE storage_id=:sid
          AND (
            target_type='EVERYONE'
            OR (target_type='DEPARTMENT' AND department != '' AND department=:dept)
            OR (role=:role)
            OR (employee_code=:code)
          )
          AND (:fp = folder_path OR :fp2 ILIKE folder_path || '/%' OR folder_path = '/')
          AND (expires_at = '' OR expires_at > :now)
        ORDER BY length(folder_path) DESC
        LIMIT 1
    """, {
        "sid": storage_id, "dept": user_dept, "role": user_role, "code": user_code,
        "fp": folder_path, "fp2": folder_path, "now": now_str
    })
    if not row:
        return True
    return bool(row['allow_download'])


# ─── Download File ──────────────────────────────────────────────

from fastapi.responses import StreamingResponse, FileResponse
import io

@router.get("/download")
async def download_file(
    config_id: int = Query(...),
    file_path: str = Query(...),
    user_code: str = Query(''),
    user_role: str = Query('user')
):
    import logging
    logging.info(f"[DOWNLOAD] config_id={config_id}, file_path={file_path}")

    cfg = fetchone("SELECT * FROM storage_config WHERE id=:id AND is_active=1", {"id": config_id})
    if not cfg:
        raise HTTPException(404, "Storage not found or inactive")

    folder_path = os.path.dirname(file_path).replace('\\', '/')

    allowed = _check_folder_permission(config_id, folder_path, user_code, user_role)
    if not allowed:
        raise HTTPException(403, "No permission to access this file")
    download_allowed = _check_download_allowed(config_id, folder_path, user_code, user_role)
    if not download_allowed:
        raise HTTPException(403, "Download not allowed for this file")

    logging.info(f"[DOWNLOAD] Permission OK, type={cfg['type']}, host={cfg['host']}")

    try:
        if cfg['type'] == 'ftp':
            return _download_ftp(cfg, file_path)
        elif cfg['type'] == 'smb':
            return _download_smb(cfg, file_path)
        elif cfg['type'] == 'gdrive':
            return _download_gdrive(cfg, file_path)
        else:
            raise HTTPException(400, f"Unsupported storage type: {cfg['type']}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Download error: {str(e)}")

def _download_ftp(cfg, file_path):
    import logging

    try:
        ftp = ftplib.FTP()
        ftp.connect(cfg['host'], cfg['port'] or 21, timeout=10)
        ftp.login(cfg['username'] or 'anonymous', cfg['password'] or '')

        base = cfg['remote_path'] or '/'
        full_path = os.path.join(base, file_path.lstrip('/')).replace('\\', '/')
        logging.info(f"[FTP] Reading file: {full_path}")

        filename = os.path.basename(file_path)

        import mimetypes
        mime_type, _ = mimetypes.guess_type(filename)
        if not mime_type:
            mime_type = 'application/octet-stream'

        def file_iterator():
            data = io.BytesIO()
            try:
                ftp.retrbinary(f'RETR {full_path}', data.write)
                data.seek(0)
                while True:
                    chunk = data.read(8192)
                    if not chunk:
                        break
                    yield chunk
            except Exception as e:
                logging.error(f"[FTP] Error: {e}")
                raise
            finally:
                ftp.quit()

        return StreamingResponse(
            file_iterator(),
            media_type=mime_type,
            headers={
                "Content-Disposition": f'inline; filename="{filename}"',
                "Cache-Control": "no-cache"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"FTP error: {str(e)}")

def _download_smb(cfg, file_path):
    try:
        from smb.SMBConnection import SMBConnection
    except ImportError:
        raise HTTPException(502, "SMB library not installed")

    conn_smb = SMBConnection(cfg['username'], cfg['password'], 'goldenfarm', cfg['host'], domain=cfg.get('domain', ''))
    connected = conn_smb.connect(cfg['host'], cfg['port'] or 445)
    if not connected:
        raise HTTPException(502, "Cannot connect to SMB server")

    share = cfg.get('remote_path', '').strip('/')
    if not share:
        conn_smb.close()
        raise HTTPException(400, "Remote Path / Share name is required")

    smb_path = file_path.lstrip('/').replace('/', '\\')

    file_data = io.BytesIO()
    try:
        conn_smb.retrieveFile(share, smb_path, file_data)
    except Exception as e:
        conn_smb.close()
        raise HTTPException(404, f"File not found: {str(e)}")

    conn_smb.close()
    file_data.seek(0)

    filename = os.path.basename(file_path)

    import mimetypes
    mime_type, _ = mimetypes.guess_type(filename)
    if not mime_type:
        mime_type = 'application/octet-stream'

    return StreamingResponse(
        file_data,
        media_type=mime_type,
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "no-cache"
        }
    )

def _download_gdrive(cfg, file_id):
    if not _GOOGLE_AVAILABLE:
        raise HTTPException(502, "Google libraries not installed")

    try:
        creds_dict = json.loads(cfg['password'])
        creds = service_account.Credentials.from_service_account_info(creds_dict)
        service = build('drive', 'v3', credentials=creds)
    except Exception as e:
        raise HTTPException(502, f"Google Drive auth error: {str(e)}")

    try:
        file_metadata = service.files().get(fileId=file_id, fields="name, mimeType").execute()
        filename = file_metadata.get('name', 'download')
        mime_type = file_metadata.get('mimeType', 'application/octet-stream')

        request = service.files().get_media(fileId=file_id)
        file_data = io.BytesIO()

        from googleapiclient.http import MediaIoBaseDownload
        downloader = MediaIoBaseDownload(file_data, request)

        done = False
        while not done:
            status, done = downloader.next_chunk()

        file_data.seek(0)

        return StreamingResponse(
            file_data,
            media_type=mime_type,
            headers={
                "Content-Disposition": f'inline; filename="{filename}"',
                "Cache-Control": "no-cache"
            }
        )
    except Exception as e:
        raise HTTPException(404, f"File not found or cannot be downloaded: {str(e)}")

# ─── Test Endpoint ──────────────────────────────────────────────

@router.get("/test")
def test_download(
    config_id: int = Query(...),
    file_path: str = Query(...)
):
    print(f"[TEST] config_id={config_id}, file_path={file_path}")

    cfg = fetchone("SELECT * FROM storage_config WHERE id=:id", {"id": config_id})
    if not cfg:
        raise HTTPException(404, "Config not found")

    return {
        "success": True,
        "config": cfg,
        "file_path": file_path,
        "message": "Connection OK - check logs for full download flow"
    }
