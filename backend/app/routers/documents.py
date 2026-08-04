import ftplib
import os
import json
from datetime import datetime
from urllib.parse import unquote
from fastapi import APIRouter, Query, HTTPException, Body, Request
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

# Email Workspace được Service Account impersonate để dùng quota thật (2TB)
# thay vì quota 0 của bản thân Service Account.
_GDRIVE_IMPERSONATE_EMAIL = os.environ.get('GDRIVE_IMPERSONATE_EMAIL', 'admin@goldenfarm.vn').strip()


def _build_gdrive_creds(cfg, scopes=None):
    """Tạo credentials cho Google Drive, impersonate user Workspace thật
    (Domain-Wide Delegation) để dùng quota lưu trữ 2TB thay vì quota 0
    của Service Account.
    """
    scopes = scopes or ['https://www.googleapis.com/auth/drive']
    creds_dict = json.loads(cfg['password'])
    creds = service_account.Credentials.from_service_account_info(creds_dict, scopes=scopes)
    
    if _GDRIVE_IMPERSONATE_EMAIL:
        creds = creds.with_subject(_GDRIVE_IMPERSONATE_EMAIL)
    
    return creds

router = APIRouter(prefix="/api/documents", tags=["documents"])

# ─── Storage Config CRUD (admin) ────────────────────────────────

@router.get("/config")
def list_configs(user_code: str = Query(''), user_role: str = Query('')):
    if user_role in ('admin', 'head'):
        rows = fetchall("SELECT * FROM storage_config ORDER BY name")
    else:
        emp = fetchone("SELECT department FROM employees WHERE employee_code=:code", {"code": user_code})
        user_dept = (emp['department'] or '') if emp else ''
        rows = fetchall("""
            SELECT DISTINCT sc.* FROM storage_config sc
            JOIN storage_permissions sp ON sp.storage_id = sc.id
            WHERE sc.is_active = TRUE
              AND (
                sp.target_type = 'EVERYONE'
                OR (sp.target_type = 'DEPARTMENT' AND sp.department != '' AND sp.department = :dept)
                OR sp.employee_code = :code
                OR sp.role = :role
                OR (sp.department = '' AND sp.role = '' AND sp.employee_code = '')
              )
            ORDER BY sc.name
        """, {"role": user_role, "code": user_code, "dept": user_dept})
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
        INSERT INTO storage_config (name, type, host, port, username, password, remote_path, domain, is_active)
        VALUES (:name, :type, :host, :port, :username, :password, :remote_path, :domain, TRUE)
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
        creds = _build_gdrive_creds(cfg)
        service = build('drive', 'v3', credentials=creds)
        folder_id = cfg['remote_path'] if cfg['remote_path'] else 'root'
        service.files().get(fileId=folder_id, fields="id, name").execute()
        return {"success": True, "message": "Google Drive connected successfully (using quota delegation)"}
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
    active_sql = "" if user_role in ('admin', 'head') else "AND is_active = TRUE"
    cfg = fetchone(f"SELECT * FROM storage_config WHERE id=:id {active_sql}", {"id": config_id})
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

    # Check upload permission for current folder
    can_upload = _check_can_upload(config_id, path, user_code, user_role)

    return {
        "data": filtered, 
        "path": path, 
        "config": {"id": cfg['id'], "name": cfg['name'], "type": cfg['type']},
        "can_upload": can_upload
    }

def _is_hidden_system_name(name: str) -> bool:
    """True for NAS/system entries that must be hidden from listings.

    Covers Synology/SMB artifacts and dotfiles:
      - leading '.'   (e.g. .docker, .DS_Store)
      - leading '_'   (e.g. _DAV, _dev)
      - leading '#'   (e.g. #recycle, #snapshot)
      - contains '@eaDir'  (Synology thumbnail/metadata folders)
    """
    name = (name or '')
    return (
        name.startswith('.')
        or name.startswith('_')
        or name.startswith('#')
        or '@eaDir' in name
    )


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
        if name in ('.', '..') or _is_hidden_system_name(name):
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
        if f.filename in ('.', '..') or _is_hidden_system_name(f.filename):
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
        creds = _build_gdrive_creds(cfg)
        service = build('drive', 'v3', credentials=creds)
    except json.JSONDecodeError:
        raise HTTPException(502, "Service Account JSON không hợp lệ")
    except Exception as e:
        raise HTTPException(502, f"Google Drive auth error: {str(e)}")

    current_id = folder_id if folder_id and folder_id not in ('/', '') else (cfg['remote_path'] or 'root')

    try:
        results = service.files().list(
            q=f"'{current_id}' in parents and trashed=false",
            fields="files(id, name, mimeType, size, modifiedTime, thumbnailLink)",
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
            "thumbnail_link": (f.get('thumbnailLink', '') or '') if not is_dir else '',
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
        for k in ('can_read','can_write','can_edit','can_delete','allow_download','can_reshare','can_upload'):
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
    perm = body.get('permission', 'read')
    role_val = body.get('role', '')
    ec = body.get('employee_code', '')
    dept = body.get('department', '')
    # Determine target_type from the inputs
    if not role_val and not ec and not dept:
        tt = 'EVERYONE'
    elif dept and not role_val and not ec:
        tt = 'DEPARTMENT'
    else:
        tt = ''  # individual/role override
    can_read = 1 if perm in ('read', 'write') else 0
    can_write = 1 if perm == 'write' else 0
    can_edit = 1 if perm == 'write' else 0
    can_delete = 1 if perm == 'write' else 0
    can_upload = 1 if body.get('can_upload', perm == 'write') else 0
    new_id = insert("""
        INSERT INTO storage_permissions
            (storage_id, folder_path, role, employee_code, department, permission,
             target_type, can_read, can_write, can_edit, can_delete, allow_download, can_reshare, can_upload)
        VALUES (:sid, :fp, :role, :ec, :dept, :perm,
                :tt, :cr, :cw, :ce, :cd, 1, 0, :cu) RETURNING id
    """, {
        "sid": body.get('storage_id'),
        "fp": body.get('folder_path', '/'),
        "role": role_val,
        "ec": ec,
        "dept": dept,
        "perm": perm,
        "tt": tt,
        "cr": can_read,
        "cw": can_write,
        "ce": can_edit,
        "cd": can_delete,
        "cu": can_upload,
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
        'can_read': bool(body.get('can_read', True)),
        'can_write': bool(body.get('can_write', False)),
        'can_edit': bool(body.get('can_edit', False)),
        'can_delete': bool(body.get('can_delete', False)),
        'allow_download': bool(body.get('allow_download', True)),
        'can_reshare': bool(body.get('can_reshare', False)),
        'expires_at': body.get('expires_at', '') or None,
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
    if 'expires_at' in updates and not updates['expires_at']:
        updates['expires_at'] = None
    set_clause = ", ".join(f"{k}=:{k}" for k in updates)
    params = {k: v for k, v in updates.items()}
    params['perm_id'] = perm_id
    execute(f"UPDATE storage_permissions SET {set_clause}, updated_at=CURRENT_TIMESTAMP::text WHERE id=:perm_id", params)
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
          AND (:fp = folder_path OR LOWER(:fp2) LIKE LOWER(folder_path || '/%') OR folder_path = '/')
          AND (expires_at IS NULL OR expires_at > :now)
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


def _check_share_access(config_id, file_path, user_code, user_role):
    """Check whether the current user is allowed to access a file via a share.

    ALL  -> any authenticated user.
    DEPT -> authenticated user whose department matches the share's department.
    PUBLIC -> handled separately via token, not here.

    Folder shares (item_type='folder') grant access to every file nested inside
    the shared folder (inherited permission).

    Returns the matching share row or None.
    """
    if not user_code:
        return None
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    shares = fetchall("""
        SELECT * FROM document_shares
        WHERE config_id=:sid AND share_type IN ('ALL','DEPT')
          AND (expires_at IS NULL OR expires_at = '' OR expires_at > :now)
        ORDER BY expires_at DESC
    """, {"sid": config_id, "now": now_str})
    if not shares:
        return None

    target = _norm_path(file_path)
    for s in shares:
        if s.get('item_type', 'file') == 'folder':
            root = _norm_path(s.get('file_path', ''))
            if not _path_within(root, target):
                continue
        elif s.get('file_path') != file_path:
            continue

        if s['share_type'] == 'ALL':
            return s
        if s['share_type'] == 'DEPT':
            emp = fetchone("SELECT department FROM employees WHERE employee_code=:code", {"code": user_code})
            user_dept = (emp['department'] or '') if emp else ''
            dept = fetchone("SELECT name FROM departments WHERE id=:id", {"id": s['department_id']})
            if dept and dept['name'] == user_dept:
                return s
    return None


def _norm_path(p: str) -> str:
    """Normalize a storage path to '/'-separated absolute form."""
    p = (p or '').strip().replace('\\', '/')
    if not p:
        return '/'
    if not p.startswith('/'):
        p = '/' + p
    return os.path.normpath(p)


def _path_within(root: str, target: str) -> bool:
    """True when `target` equals `root` or lives strictly inside `root`.

    A path can never 'escape' above the root because traversal is resolved
    with normpath before the prefix comparison.
    """
    root = _norm_path(root)
    target = _norm_path(target)
    if root == '/':
        return True
    return target == root or target.startswith(root.rstrip('/') + '/')


def _gdrive_service(cfg):
    """Build a Google Drive service object from a storage config."""
    if not _GOOGLE_AVAILABLE:
        raise HTTPException(502, "Google libraries not installed (pip install google-api-python-client google-auth)")
    try:
        creds = _build_gdrive_creds(cfg)
        return build('drive', 'v3', credentials=creds)
    except json.JSONDecodeError:
        raise HTTPException(502, "Service Account JSON không hợp lệ")
    except Exception as e:
        raise HTTPException(502, f"Google Drive auth error: {str(e)}")


def _gdrive_folder_within(cfg, root_folder_id: str, folder_id: str) -> bool:
    """True when `folder_id` is `root_folder_id` or a descendant of it.

    Walks the `parents` chain up to the drive root, so a guest can never
    browse an arbitrary folder id that lives outside the shared folder.
    """
    if not folder_id:
        return False
    root = (root_folder_id or '').strip() or (cfg.get('remote_path') or 'root')
    svc = _gdrive_service(cfg)
    current = folder_id
    seen = set()
    for _ in range(200):
        if current == root:
            return True
        if current in seen:
            return False
        seen.add(current)
        try:
            meta = svc.files().get(fileId=current, fields="parents").execute()
        except Exception:
            return False
        parents = meta.get('parents') or []
        if not parents:
            return False
        current = parents[0]
    return False


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
          AND (:fp = folder_path OR LOWER(:fp2) LIKE LOWER(folder_path || '/%') OR folder_path = '/')
          AND (expires_at IS NULL OR expires_at > :now)
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
    file_id: str = Query(''),
    user_code: str = Query(''),
    user_role: str = Query('user')
):
    import logging
    logging.info(f"[DOWNLOAD] config_id={config_id}, file_path={file_path}")

    active_sql = "" if user_role in ('admin', 'head') else "AND is_active = TRUE"
    cfg = fetchone(f"SELECT * FROM storage_config WHERE id=:id {active_sql}", {"id": config_id})
    if not cfg:
        raise HTTPException(404, "Storage not found or inactive")

    folder_path = os.path.dirname(file_path).replace('\\', '/')

    allowed = _check_folder_permission(config_id, folder_path, user_code, user_role)
    share_grant = _check_share_access(config_id, file_path, user_code, user_role)
    allowed = allowed or (share_grant is not None)
    if not allowed:
        raise HTTPException(403, "No permission to access this file")
    download_allowed = _check_download_allowed(config_id, folder_path, user_code, user_role)
    if not download_allowed and share_grant is None:
        raise HTTPException(403, "Download not allowed for this file")

    logging.info(f"[DOWNLOAD] Permission OK, type={cfg['type']}, host={cfg['host']}")

    try:
        if cfg['type'] == 'ftp':
            return _download_ftp(cfg, file_path)
        elif cfg['type'] == 'smb':
            return _download_smb(cfg, file_path)
        elif cfg['type'] == 'gdrive':
            return _download_gdrive(cfg, file_path, file_id)
        else:
            raise HTTPException(400, f"Unsupported storage type: {cfg['type']}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Download error: {str(e)}")


# ─── Thumbnail (on-the-fly resize cho card ảnh) ────────────────

_IMAGE_EXTS = ('jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff')
_THUMB_CACHE_MAX_AGE = 3600  # seconds


def _guess_mime(filename: str) -> str:
    import mimetypes
    mime, _ = mimetypes.guess_type(filename)
    return mime or 'application/octet-stream'


@router.get("/thumbnail")
def file_thumbnail(
    config_id: int = Query(...),
    file_path: str = Query(...),
    file_id: str = Query(''),
    user_code: str = Query(''),
    user_role: str = Query('user'),
    size: int = Query(400),
):
    """Trả về ảnh thumbnail (đã resize) cho file ảnh từ SMB/FTP.

    Google Drive dùng thẳng `thumbnailLink` từ API (frontend), nên endpoint này
    chỉ phục vụ SMB/FTP/local. Permission check giống preview: cần quyền đọc
    thư mục chứa file. Nếu Pillow không có hoặc resize lỗi -> trả nguyên file
    (vẫn dùng được như preview).
    """
    cfg = fetchone("SELECT * FROM storage_config WHERE id=:id", {"id": config_id})
    if not cfg:
        raise HTTPException(404, "Storage not found")

    folder_path = os.path.dirname(file_path).replace('\\', '/')
    if not _check_folder_permission(config_id, folder_path, user_code, user_role):
        raise HTTPException(403, "No permission to access this file")

    ext = file_path.rsplit('.', 1)[-1].lower() if '.' in file_path else ''
    if ext not in _IMAGE_EXTS:
        raise HTTPException(415, "Not an image file")

    try:
        data = _get_file_bytes(cfg, file_path, file_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Thumbnail read error: {str(e)}")

    mime = _guess_mime(file_path)
    cache_headers = {"Cache-Control": f"public, max-age={_THUMB_CACHE_MAX_AGE}"}

    # SVG (vector) và GIF (animated): gửi nguyên file, không resize.
    if ext in ('svg', 'gif'):
        from fastapi.responses import Response
        return Response(content=data, media_type=mime, headers=cache_headers)

    try:
        from PIL import Image
        import io as _io
        img = Image.open(_io.BytesIO(data))
        img.load()
        img.thumbnail((size, size), Image.Resampling.LANCZOS)

        out = _io.BytesIO()
        if img.mode in ('RGBA', 'LA', 'P'):
            if img.mode == 'P' and 'transparency' not in img.info:
                img = img.convert('RGB')
            else:
                img = img.convert('RGBA')
            out_mime = 'image/png'
            img.save(out, format='PNG', optimize=True)
        else:
            if img.mode != 'RGB':
                img = img.convert('RGB')
            out_mime = 'image/jpeg'
            img.save(out, format='JPEG', quality=82, optimize=True, progressive=True)
        out.seek(0)
        from fastapi.responses import Response
        return Response(content=out.getvalue(), media_type=out_mime, headers=cache_headers)
    except ImportError:
        from fastapi.responses import Response
        return Response(content=data, media_type=mime, headers=cache_headers)
    except Exception:
        from fastapi.responses import Response
        return Response(content=data, media_type=mime, headers=cache_headers)


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

_GDRIVE_EXPORT_MIME = {
    'application/vnd.google-apps.document': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  # docx
    'application/vnd.google-apps.spreadsheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',    # xlsx
    'application/vnd.google-apps.presentation': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',  # pptx
    'application/vnd.google-apps.drawing': 'image/png',
    'application/vnd.google-apps.form': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

def _gdrive_download_stream(service, file_id):
    """Fetch file bytes from Google Drive using the server-side service account.

    Regular files use alt=media; Google-native formats (Docs/Sheets/Slides)
    cannot use alt=media and must be exported to a standard Office MIME type.

    Returns (filename, mime_type, BytesIO).
    """
    meta = service.files().get(fileId=file_id, fields="name, mimeType").execute()
    filename = meta.get('name', 'download')
    mime = meta.get('mimeType', 'application/octet-stream')
    buf = io.BytesIO()

    if mime.startswith('application/vnd.google-apps.'):
        export_mime = _GDRIVE_EXPORT_MIME.get(mime)
        if not export_mime:
            raise HTTPException(400, f"Google native format chưa được hỗ trợ xuất: {mime}")
        buf.write(service.files().export(fileId=file_id, mimeType=export_mime).execute())
        mime = export_mime
    else:
        from googleapiclient.http import MediaIoBaseDownload
        dl = MediaIoBaseDownload(buf, service.files().get_media(fileId=file_id))
        done = False
        while not done:
            _, done = dl.next_chunk()

    buf.seek(0)
    return filename, mime, buf


def _download_gdrive(cfg, file_path, file_id=''):
    if not _GOOGLE_AVAILABLE:
        raise HTTPException(502, "Google libraries not installed")

    file_id = (file_id or '').strip() or file_path.split('/')[0]

    try:
        creds = _build_gdrive_creds(cfg)
        service = build('drive', 'v3', credentials=creds)
    except Exception as e:
        raise HTTPException(502, f"Google Drive auth error: {str(e)}")

    try:
        filename, mime_type, file_data = _gdrive_download_stream(service, file_id)
        return StreamingResponse(
            file_data,
            media_type=mime_type,
            headers={
                "Content-Disposition": f'inline; filename="{filename}"',
                "Cache-Control": "no-cache",
            }
        )
    except HTTPException:
        raise
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


# ═══════════════════════════════════════════════════════════════
# ONLYOFFICE Document Server Integration
# ═══════════════════════════════════════════════════════════════

import hashlib
import hmac
import base64
import time as _time
import threading
import jwt as pyjwt

_ONLYOFFICE_URL = os.environ.get('ONLYOFFICE_URL', 'http://onlyoffice:80')
_ONLYOFFICE_PUBLIC_URL = os.environ.get('ONLYOFFICE_PUBLIC_URL', 'http://localhost:8080')
_ONLYOFFICE_SECRET = os.environ.get('ONLYOFFICE_SECRET', 'MySuperSecret123456')
_ONLYOFFICE_ENABLED = os.environ.get('ONLYOFFICE_ENABLED', 'true').lower() == 'true'
_TEMP_TOKEN_EXPIRE = 3600  # 1 hour (download token — DS may retry)
_DOC_KEY_EXPIRE = 86400  # 24h (edit session)

# In-memory map for long file paths that cannot fit in a 128-char document key
_oo_doc_keys: dict[str, dict] = {}
_oo_doc_keys_lock = threading.Lock()

_OFFICE_EXTS = {
    'docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt',
    'odt', 'ods', 'odp', 'csv', 'txt', 'rtf', 'pdf',
}

_OO_MIME = {
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'doc': 'application/msword',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'xls': 'application/vnd.ms-excel',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'ppt': 'application/vnd.ms-powerpoint',
    'odt': 'application/vnd.oasis.opendocument.text',
    'ods': 'application/vnd.oasis.opendocument.spreadsheet',
    'odp': 'application/vnd.oasis.opendocument.presentation',
    'pdf': 'application/pdf',
    'csv': 'text/csv',
    'txt': 'text/plain',
    'rtf': 'application/rtf',
}


def _sign_doc_token(payload: dict) -> str:
    token = pyjwt.encode(payload, _ONLYOFFICE_SECRET, algorithm="HS256")
    if isinstance(token, bytes):
        token = token.decode('utf-8')
    return token


def _verify_doc_token(token: str) -> dict | None:
    try:
        return pyjwt.decode(token, _ONLYOFFICE_SECRET, algorithms=["HS256"])
    except Exception:
        return None


def _oo_document_type(ext: str) -> str:
    """Map file extension to OnlyOffice documentType."""
    if ext in ('xlsx', 'xls', 'ods', 'csv'):
        return 'cell'
    if ext in ('pptx', 'ppt', 'odp'):
        return 'slide'
    if ext == 'pdf':
        return 'pdf'
    return 'word'


def _cleanup_oo_keys():
    now = _time.time()
    expired = [k for k, v in _oo_doc_keys.items() if v.get('exp', 0) < now]
    for k in expired:
        del _oo_doc_keys[k]


def _make_doc_key(config_id: int, file_path: str, file_id: str = '') -> str:
    """Build an OnlyOffice document key.

    Constraints (OnlyOffice API):
      - max 128 characters
      - allowed chars: 0-9, a-z, A-Z, -._=

    Prefer a compact signed payload so callback works after backend restart.
    Fall back to a short hash + in-memory map when the path is too long.
    """
    ts = int(_time.time())
    raw = json.dumps({"c": config_id, "p": file_path, "t": ts, "f": file_id}, separators=(',', ':'))
    b64 = base64.urlsafe_b64encode(raw.encode()).decode().rstrip('=')
    sig = hmac.new(
        _ONLYOFFICE_SECRET.encode(), raw.encode(), hashlib.sha256
    ).hexdigest()[:16]
    key = f"{b64}.{sig}"
    if len(key) <= 128:
        return key

    # Path too long for inline key — use hash lookup (survives only while process lives)
    h = hashlib.sha256(f"{config_id}:{file_path}:{ts}:{sig}".encode()).hexdigest()[:40]
    with _oo_doc_keys_lock:
        _cleanup_oo_keys()
        _oo_doc_keys[h] = {
            "config_id": config_id,
            "file_path": file_path,
            "file_id": file_id,
            "exp": ts + _DOC_KEY_EXPIRE,
        }
    return h


def _resolve_doc_key(key: str) -> dict | None:
    """Recover config_id + file_path from an OnlyOffice document key."""
    if not key:
        return None

    with _oo_doc_keys_lock:
        meta = _oo_doc_keys.get(key)
        if meta:
            if meta.get('exp', 0) < _time.time():
                del _oo_doc_keys[key]
                return None
            return {"config_id": meta["config_id"], "file_path": meta["file_path"], "file_id": meta.get("file_id", "")}

    # Compact signed form: base64url(json).sig16
    if '.' not in key:
        return None
    try:
        b64, sig = key.rsplit('.', 1)
        pad = '=' * (-len(b64) % 4)
        raw = base64.urlsafe_b64decode(b64 + pad)
        expected = hmac.new(
            _ONLYOFFICE_SECRET.encode(), raw, hashlib.sha256
        ).hexdigest()[:16]
        if not hmac.compare_digest(sig, expected):
            return None
        data = json.loads(raw)
        return {"config_id": data["c"], "file_path": data["p"], "file_id": data.get("f", "")}
    except Exception:
        return None


def _get_file_bytes(cfg, file_path: str, file_id: str = '') -> bytes:
    """Download file from storage and return raw bytes."""
    import io as _io
    buf = _io.BytesIO()
    try:
        if cfg['type'] == 'ftp':
            ftp = ftplib.FTP()
            ftp.connect(cfg['host'], cfg['port'] or 21, timeout=15)
            ftp.login(cfg['username'] or 'anonymous', cfg['password'] or '')
            base = cfg['remote_path'] or '/'
            full = os.path.join(base, file_path.lstrip('/')).replace('\\', '/')
            ftp.retrbinary(f'RETR {full}', buf.write)
            ftp.quit()
        elif cfg['type'] == 'smb':
            from smb.SMBConnection import SMBConnection
            conn = SMBConnection(cfg['username'], cfg['password'], 'goldenfarm', cfg['host'], domain=cfg.get('domain', ''))
            if conn.connect(cfg['host'], cfg['port'] or 445):
                share = cfg.get('remote_path', '').strip('/')
                smb_p = file_path.lstrip('/').replace('/', '\\')
                conn.retrieveFile(share, smb_p, buf)
                conn.close()
        elif cfg['type'] == 'gdrive':
            file_id = (file_id or '').strip() or file_path.split('/')[0]
            creds = _build_gdrive_creds(cfg)
            svc = build('drive', 'v3', credentials=creds)
            _, _, stream = _gdrive_download_stream(svc, file_id)
            buf.write(stream.read())
    except Exception as e:
        raise HTTPException(502, f"Failed to read file: {str(e)}")
    buf.seek(0)
    return buf.read()


def _put_file_bytes(cfg, file_path: str, data: bytes, file_id: str = ''):
    """Write raw bytes back to storage, overwriting the original file."""
    import io as _io
    try:
        if cfg['type'] == 'ftp':
            ftp = ftplib.FTP()
            ftp.connect(cfg['host'], cfg['port'] or 21, timeout=15)
            ftp.login(cfg['username'] or 'anonymous', cfg['password'] or '')
            base = cfg['remote_path'] or '/'
            full = os.path.join(base, file_path.lstrip('/')).replace('\\', '/')
            ftp.storbinary(f'STOR {full}', _io.BytesIO(data))
            ftp.quit()
        elif cfg['type'] == 'smb':
            from smb.SMBConnection import SMBConnection
            conn = SMBConnection(cfg['username'], cfg['password'], 'goldenfarm', cfg['host'], domain=cfg.get('domain', ''))
            if conn.connect(cfg['host'], cfg['port'] or 445):
                share = cfg.get('remote_path', '').strip('/')
                smb_p = file_path.lstrip('/').replace('/', '\\')
                conn.storeFile(share, smb_p, _io.BytesIO(data))
                conn.close()
        elif cfg['type'] == 'gdrive':
            file_id = (file_id or '').strip() or file_path.split('/')[0]
            creds = _build_gdrive_creds(cfg)
            svc = build('drive', 'v3', credentials=creds)
            from googleapiclient.http import MediaIoBaseUpload
            media = MediaIoBaseUpload(_io.BytesIO(data), mimetype='application/octet-stream', resumable=True)
            svc.files().update(fileId=file_id, media_body=media).execute()
    except Exception as e:
        raise HTTPException(502, f"Failed to write file: {str(e)}")


@router.get("/onlyoffice/config")
def onlyoffice_config(
    request: Request,
    config_id: int = Query(...),
    file_path: str = Query(...),
    file_id: str = Query(''),
    user_code: str = Query(''),
    user_role: str = Query('user')
):
    # Check if OnlyOffice is enabled
    if not _ONLYOFFICE_ENABLED:
        raise HTTPException(503, "OnlyOffice Document Server không được bật. Vui lòng cấu hình ONLYOFFICE_ENABLED=true trong .env")
    
    cfg = fetchone(f"SELECT * FROM storage_config WHERE id=:id", {"id": config_id})
    if not cfg:
        raise HTTPException(404, "Storage not found")

    folder_path = os.path.dirname(file_path).replace('\\', '/')
    allowed = _check_folder_permission(config_id, folder_path, user_code, user_role)
    share_grant = _check_share_access(config_id, file_path, user_code, user_role)
    allowed = allowed or (share_grant is not None)
    if not allowed:
        raise HTTPException(403, "No permission to access this file")

    filename = os.path.basename(file_path)
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''

    if ext not in _OFFICE_EXTS:
        raise HTTPException(400, f"Unsupported file type: .{ext}")

    can_edit = allowed and _check_can_edit(config_id, folder_path, user_code, user_role)
    # Legacy binary formats + PDF: view-only (DS converts .doc/.xls/.ppt; PDF is not a full editor)
    if ext in ('pdf', 'doc', 'xls', 'ppt'):
        can_edit = False

    download_token = _sign_doc_token({
        "config_id": config_id,
        "file_path": file_path,
        "file_id": file_id,
        "exp": int(_time.time()) + _TEMP_TOKEN_EXPIRE,
    })

    user_name = user_code
    user_rows = fetchall("SELECT full_name FROM employees WHERE employee_code=:code", {"code": user_code})
    if user_rows and user_rows[0].get('full_name'):
        user_name = user_rows[0]['full_name']

    # URL that OnlyOffice Document Server uses to fetch the file + send callbacks.
    # Must be reachable FROM the OnlyOffice container/server (not from the browser).
    backend_public_url = os.environ.get('BACKEND_PUBLIC_URL', '').strip()
    if backend_public_url:
        base_url = backend_public_url.rstrip('/')
    else:
        forwarded_proto = request.headers.get("x-forwarded-proto", "http")
        forwarded_host = request.headers.get("x-forwarded-host") or request.headers.get("host") or "localhost:8000"
        base_url = f"{forwarded_proto}://{forwarded_host}".rstrip('/')
    
    # Public URL the BROWSER uses to load DocsAPI JS
    doc_service = _ONLYOFFICE_PUBLIC_URL.rstrip('/')
    document_type = _oo_document_type(ext)
    doc_key = _make_doc_key(config_id, file_path, file_id)

    # Build config WITHOUT token / custom fields first — JWT must sign only the public payload
    editor_config = {
        "document": {
            "fileType": ext,
            "key": doc_key,
            "title": filename,
            "url": f"{base_url}/api/documents/onlyoffice/download?token={download_token}",
            "permissions": {
                "edit": can_edit,
                "download": True,
                "print": True,
                "review": can_edit,
                "comment": True,
                "copy": True,
            },
        },
        "editorConfig": {
            "callbackUrl": f"{base_url}/api/documents/onlyoffice/callback",
            "lang": "vi",
            "mode": "edit" if can_edit else "view",
            "user": {
                "id": user_code or "anonymous",
                "name": user_name or "User",
            },
            "customization": {
                "autosave": can_edit,
                "forcesave": can_edit,
                "chat": False,
                "compactHeader": False,
                "compactToolbar": False,
                "help": False,
                "plugins": False,
                "goback": {
                    "url": "/documents",
                    "text": "Quay lại Tài liệu",
                },
                "review": {"reviewDisplay": "original", "showReviewChanges": can_edit},
                "statusBar": True,
                "toolbarDocked": "top",
            },
        },
        "documentType": document_type,
        "height": "100%",
        "width": "100%",
        "type": "desktop",
    }

    # Sign the clean config, then attach token + internal helper field for the React client
    editor_config["token"] = _sign_doc_token(editor_config)
    editor_config["_docsApiUrl"] = f"{doc_service}/web-apps/apps/api/documents/api.js"

    return editor_config


def _check_can_edit(storage_id, folder_path, user_code, user_role):
    """Check if user has can_edit permission on the folder."""
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
        SELECT can_edit FROM storage_permissions
        WHERE storage_id=:sid
          AND (
            target_type='EVERYONE'
            OR (target_type='DEPARTMENT' AND department != '' AND department=:dept)
            OR (role=:role)
            OR (employee_code=:code)
            OR (department='' AND role='' AND employee_code='')
          )
          AND (:fp = folder_path OR LOWER(:fp2) LIKE LOWER(folder_path || '/%') OR folder_path = '/')
          AND (expires_at IS NULL OR expires_at > :now)
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
    return bool(row['can_edit'])


@router.get("/onlyoffice/download")
def onlyoffice_download(token: str = Query(...)):
    payload = _verify_doc_token(token)
    if not payload:
        raise HTTPException(401, "Invalid or expired download token")

    # Reject expired download tokens (exp is unix seconds)
    exp = payload.get("exp")
    if exp is not None and int(exp) < int(_time.time()):
        raise HTTPException(401, "Download token expired")

    config_id = payload.get("config_id")
    file_path = payload.get("file_path")
    file_id = payload.get("file_id", "")
    if not config_id or not file_path:
        raise HTTPException(400, "Invalid token payload")

    cfg = fetchone("SELECT * FROM storage_config WHERE id=:id", {"id": config_id})
    if not cfg:
        raise HTTPException(404, "Storage not found")

    filename = os.path.basename(file_path)
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    mime_type = _OO_MIME.get(ext)
    if not mime_type:
        import mimetypes
        mime_type, _ = mimetypes.guess_type(filename)
    if not mime_type:
        mime_type = 'application/octet-stream'

    data = _get_file_bytes(cfg, file_path, file_id)

    # ASCII-safe Content-Disposition; non-ASCII names use filename*
    safe_name = filename.encode('ascii', 'ignore').decode('ascii') or 'document'
    from urllib.parse import quote
    cd = f"inline; filename=\"{safe_name}\"; filename*=UTF-8''{quote(filename)}"

    return StreamingResponse(
        io.BytesIO(data),
        media_type=mime_type,
        headers={
            "Content-Disposition": cd,
            "Content-Length": str(len(data)),
            "Access-Control-Allow-Origin": "*",
        }
    )


class OnlyOfficeCallback(BaseModel):
    status: int = 0
    key: str = ''
    url: str = ''
    token: str = ''
    users: list[str] = []
    history: dict | None = None
    historyData: dict | None = None


@router.post("/onlyoffice/callback")
def onlyoffice_callback(body: OnlyOfficeCallback):
    import logging
    logging.info(f"[ONLYOFFICE] Callback: status={body.status}, key={body.key[:40] if body.key else ''}...")

    # status 1 = editing, 2 = ready for save, 6 = force-save, 7 = error force-save
    if body.status in (2, 6):
        if not body.url:
            raise HTTPException(400, "No download URL provided for saving")

        payload = _resolve_doc_key(body.key) if body.key else None
        if not payload:
            raise HTTPException(400, "Invalid document key")

        config_id = payload.get("config_id")
        file_path = payload.get("file_path")
        if not config_id or not file_path:
            raise HTTPException(400, "Invalid key payload")

        cfg = fetchone("SELECT * FROM storage_config WHERE id=:id", {"id": config_id})
        if not cfg:
            raise HTTPException(404, "Storage config not found")

        import requests
        resp = requests.get(body.url, timeout=60)
        if resp.status_code != 200:
            raise HTTPException(502, f"Failed to download saved file from ONLYOFFICE: HTTP {resp.status_code}")

        _put_file_bytes(cfg, file_path, resp.content, payload.get("file_id", ""))

        from ..core.events import publish_sync
        publish_sync("document_updated", {
            "config_id": config_id,
            "file_path": file_path,
            "ts": datetime.now().isoformat(),
        })

        logging.info(f"[ONLYOFFICE] File saved successfully: {file_path}")

    return {"error": 0}


# ═══════════════════════════════════════════════════════════════
# FILE UPLOAD WITH PERMISSION CHECK
# ═══════════════════════════════════════════════════════════════

from fastapi import UploadFile, File


def _check_can_upload(storage_id, folder_path, user_code, user_role):
    """Check if user has can_upload permission on the folder.
    
    Security: Default to NO upload permission unless explicitly granted by admin.
    Only admin can grant can_upload permission to other users.
    """
    folder_path = folder_path.replace('\\', '/').rstrip('/') or '/'
    if user_role in ('admin', 'head'):
        return True
    row = fetchone("SELECT COUNT(*) AS cnt FROM storage_permissions WHERE storage_id=:id", {"id": storage_id})
    if row["cnt"] == 0:
        # No permissions defined = NO upload allowed (security by default)
        return False
    user_dept = ''
    emp = fetchone("SELECT department FROM employees WHERE employee_code=:code", {"code": user_code})
    if emp:
        user_dept = emp['department'] or ''
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    row = fetchone("""
        SELECT can_upload FROM storage_permissions
        WHERE storage_id=:sid
          AND (
            target_type='EVERYONE'
            OR (target_type='DEPARTMENT' AND department != '' AND department=:dept)
            OR (role=:role)
            OR (employee_code=:code)
            OR (department='' AND role='' AND employee_code='')
          )
          AND (:fp = folder_path OR LOWER(:fp2) LIKE LOWER(folder_path || '/%') OR folder_path = '/')
          AND (expires_at IS NULL OR expires_at > :now)
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
    return bool(row.get('can_upload', 0))


@router.post("/upload")
async def upload_file(
    config_id: int = Query(...),
    folder_path: str = Query('/'),
    user_code: str = Query(''),
    user_role: str = Query('user'),
    file: UploadFile = File(...)
):
    """Upload a file to the specified folder in storage.

    Permission check: user must have can_upload=True on the target folder.
    """
    import logging
    logging.info(f"[UPLOAD] config_id={config_id}, folder={folder_path}, filename={file.filename}, user={user_code}")

    # Check storage exists
    active_sql = "" if user_role in ('admin', 'head') else "AND is_active = TRUE"
    cfg = fetchone(f"SELECT * FROM storage_config WHERE id=:id {active_sql}", {"id": config_id})
    if not cfg:
        raise HTTPException(404, "Storage not found or inactive")

    # Check upload permission
    if not _check_can_upload(config_id, folder_path, user_code, user_role):
        raise HTTPException(403, "Bạn không có quyền upload vào thư mục này")

    # Validate filename
    filename = file.filename or 'unnamed'
    if '..' in filename or '/' in filename or '\\' in filename:
        raise HTTPException(400, "Tên file không hợp lệ")

    # Read file content
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(400, "File rỗng")

    # Build destination path
    folder_path = folder_path.replace('\\', '/').rstrip('/') or '/'

    try:
        if cfg['type'] == 'ftp':
            _upload_ftp(cfg, folder_path, filename, content)
        elif cfg['type'] == 'smb':
            _upload_smb(cfg, folder_path, filename, content)
        elif cfg['type'] == 'gdrive':
            return await _upload_gdrive(cfg, folder_path, filename, content, file.content_type)
        else:
            raise HTTPException(400, f"Unsupported storage type: {cfg['type']}")
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"[UPLOAD] Error: {e}")
        raise HTTPException(502, f"Upload error: {str(e)}")

    # Publish SSE event
    from ..core.events import publish_sync
    publish_sync("document_updated", {
        "config_id": config_id,
        "folder_path": folder_path,
        "filename": filename,
        "action": "upload",
        "ts": datetime.now().isoformat(),
    })

    return {"success": True, "filename": filename, "size": len(content)}


def _upload_ftp(cfg, folder_path: str, filename: str, content: bytes):
    """Upload file to FTP server."""
    ftp = ftplib.FTP()
    ftp.connect(cfg['host'], cfg['port'] or 21, timeout=30)
    ftp.login(cfg['username'] or 'anonymous', cfg['password'] or '')

    base = cfg['remote_path'] or '/'
    # Build full path
    if folder_path == '/':
        full_path = os.path.join(base, filename).replace('\\', '/')
    else:
        full_path = os.path.join(base, folder_path.lstrip('/'), filename).replace('\\', '/')

    # Ensure directory exists
    dir_path = os.path.dirname(full_path)
    try:
        ftp.cwd(dir_path)
    except ftplib.error_perm:
        # Try to create directory
        _ftp_mkdirs(ftp, dir_path)

    # Upload file
    ftp.storbinary(f'STOR {filename}', io.BytesIO(content))
    ftp.quit()


def _ftp_mkdirs(ftp, path: str):
    """Recursively create directories on FTP server."""
    dirs = path.strip('/').split('/')
    current = ''
    for d in dirs:
        if not d:
            continue
        current = f"{current}/{d}"
        try:
            ftp.cwd(current)
        except ftplib.error_perm:
            try:
                ftp.mkd(current)
            except:
                pass


def _upload_smb(cfg, folder_path: str, filename: str, content: bytes):
    """Upload file to SMB share."""
    try:
        from smb.SMBConnection import SMBConnection
    except ImportError:
        raise HTTPException(502, "SMB library not installed (pip install pysmb)")

    conn = SMBConnection(cfg['username'], cfg['password'], 'goldenfarm', cfg['host'], domain=cfg.get('domain', ''))
    connected = conn.connect(cfg['host'], cfg['port'] or 445)
    if not connected:
        raise HTTPException(502, "Cannot connect to SMB server")

    share = cfg.get('remote_path', '').strip('/')
    if not share:
        conn.close()
        raise HTTPException(400, "Remote Path / Share name is required for SMB")

    # Build SMB path
    if folder_path == '/':
        smb_path = filename
    else:
        smb_path = folder_path.lstrip('/').replace('/', '\\') + '\\' + filename

    # Upload file
    try:
        conn.storeFile(share, smb_path, io.BytesIO(content))
    except Exception as e:
        conn.close()
        raise HTTPException(502, f"SMB upload failed: {str(e)}")

    conn.close()


async def _upload_gdrive(cfg, folder_path: str, filename: str, content: bytes, mime_type: str = None):
    """Upload file to Google Drive (supports Shared Drives) using Domain-Wide Delegation.
    
    Service Account impersonate Workspace user (admin@goldenfarm.vn) để dùng quota 2TB
    thay vì quota 0 của bản thân Service Account.
    """
    if not _GOOGLE_AVAILABLE:
        raise HTTPException(502, "Google libraries not installed")

    try:
        creds = _build_gdrive_creds(cfg)
        service = build('drive', 'v3', credentials=creds)
    except json.JSONDecodeError:
        raise HTTPException(502, "Service Account JSON không hợp lệ")
    except Exception as e:
        raise HTTPException(502, f"Google Drive auth error: {str(e)}")

    # folder_path for GDrive is the Google Folder ID
    # For Shared Drive, use 'drive' parameter in file creation
    parent_id = folder_path.strip('/') if folder_path and folder_path != '/' else cfg['remote_path'] or 'root'

    # Determine MIME type
    if not mime_type:
        import mimetypes
        mime_type, _ = mimetypes.guess_type(filename)
    if not mime_type:
        mime_type = 'application/octet-stream'

    # Upload to Google Drive
    from googleapiclient.http import MediaIoBaseUpload
    media = MediaIoBaseUpload(io.BytesIO(content), mimetype=mime_type, resumable=True)

    file_metadata = {
        'name': filename,
        'parents': [parent_id]
    }

    try:
        # Try to upload - if it's a Shared Drive, we need to specify the drive
        result = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, name, size, parents, driveId',
            supportsAllDrives=True  # Support Shared Drives
        ).execute()
    except Exception as e:
        error_str = str(e)
        # Check for specific error patterns
        if 'storage quota' in error_str.lower() or 'quota' in error_str.lower():
            raise HTTPException(503, "Google Drive Service Account không có đủ dung lượng lưu trữ. Vui lòng sử dụng Shared Drive hoặc OAuth delegation.")
        if 'notFound' in error_str:
            raise HTTPException(404, "Thư mục gốc không tồn tại. Vui lòng kiểm tra Folder ID.")
        raise HTTPException(502, f"Google Drive upload failed: {error_str}")

    return {
        "success": True,
        "filename": filename,
        "size": len(content),
        "file_id": result.get('id'),
        "gdrive_name": result.get('name'),
        "drive_id": result.get('driveId')  # For Shared Drive
    }


# ═══════════════════════════════════════════════════════════════
# CREATE FOLDER WITH PERMISSION CHECK
# ═══════════════════════════════════════════════════════════════

class CreateFolderRequest(BaseModel):
    folder_name: str


@router.post("/create-folder")
async def create_folder(
    config_id: int = Query(...),
    parent_path: str = Query('/'),
    user_code: str = Query(''),
    user_role: str = Query('user'),
    body: CreateFolderRequest = Body(...)
):
    """Create a new folder in storage.

    Permission check: user must have can_upload=True on the parent folder.
    """
    import logging
    logging.info(f"[CREATE_FOLDER] config_id={config_id}, parent={parent_path}, name={body.folder_name}, user={user_code}")

    # Check storage exists
    active_sql = "" if user_role in ('admin', 'head') else "AND is_active = TRUE"
    cfg = fetchone(f"SELECT * FROM storage_config WHERE id=:id {active_sql}", {"id": config_id})
    if not cfg:
        raise HTTPException(404, "Storage not found or inactive")

    # Check upload permission (same as upload)
    if not _check_can_upload(config_id, parent_path, user_code, user_role):
        raise HTTPException(403, "Bạn không có quyền tạo thư mục ở đây")

    # Validate folder name
    folder_name = body.folder_name.strip()
    if not folder_name:
        raise HTTPException(400, "Tên thư mục không được để trống")
    if '..' in folder_name or '/' in folder_name or '\\' in folder_name:
        raise HTTPException(400, "Tên thư mục không hợp lệ")

    try:
        if cfg['type'] == 'ftp':
            _create_folder_ftp(cfg, parent_path, folder_name)
        elif cfg['type'] == 'smb':
            _create_folder_smb(cfg, parent_path, folder_name)
        elif cfg['type'] == 'gdrive':
            return await _create_folder_gdrive(cfg, parent_path, folder_name)
        else:
            raise HTTPException(400, f"Unsupported storage type: {cfg['type']}")
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"[CREATE_FOLDER] Error: {e}")
        raise HTTPException(502, f"Create folder error: {str(e)}")

    return {"success": True, "folder_name": folder_name}


def _create_folder_ftp(cfg, parent_path: str, folder_name: str):
    """Create folder on FTP server."""
    ftp = ftplib.FTP()
    ftp.connect(cfg['host'], cfg['port'] or 21, timeout=30)
    ftp.login(cfg['username'] or 'anonymous', cfg['password'] or '')

    base = cfg['remote_path'] or '/'
    if parent_path == '/':
        full_path = os.path.join(base, folder_name).replace('\\', '/')
    else:
        full_path = os.path.join(base, parent_path.lstrip('/'), folder_name).replace('\\', '/')

    try:
        ftp.mkd(full_path)
    except ftplib.error_perm as e:
        ftp.quit()
        if '550' in str(e) or 'exists' in str(e).lower():
            raise HTTPException(409, f"Thư mục '{folder_name}' đã tồn tại")
        raise HTTPException(502, f"FTP error: {str(e)}")

    ftp.quit()


def _create_folder_smb(cfg, parent_path: str, folder_name: str):
    """Create folder on SMB share."""
    try:
        from smb.SMBConnection import SMBConnection
    except ImportError:
        raise HTTPException(502, "SMB library not installed (pip install pysmb)")

    conn = SMBConnection(cfg['username'], cfg['password'], 'goldenfarm', cfg['host'], domain=cfg.get('domain', ''))
    connected = conn.connect(cfg['host'], cfg['port'] or 445)
    if not connected:
        raise HTTPException(502, "Cannot connect to SMB server")

    share = cfg.get('remote_path', '').strip('/')
    if not share:
        conn.close()
        raise HTTPException(400, "Remote Path / Share name is required for SMB")

    # Build SMB path
    if parent_path == '/':
        smb_path = folder_name
    else:
        smb_path = parent_path.lstrip('/').replace('/', '\\') + '\\' + folder_name

    try:
        conn.createDirectory(share, smb_path)
    except Exception as e:
        conn.close()
        if 'STATUS_OBJECT_NAME_COLLISION' in str(e) or 'exists' in str(e).lower():
            raise HTTPException(409, f"Thư mục '{folder_name}' đã tồn tại")
        raise HTTPException(502, f"SMB error: {str(e)}")

    conn.close()


async def _create_folder_gdrive(cfg, parent_path: str, folder_name: str):
    """Create folder in Google Drive using Domain-Wide Delegation."""
    if not _GOOGLE_AVAILABLE:
        raise HTTPException(502, "Google libraries not installed")

    try:
        creds = _build_gdrive_creds(cfg)
        service = build('drive', 'v3', credentials=creds)
    except Exception as e:
        raise HTTPException(502, f"Google Drive auth error: {str(e)}")

    # parent_path for GDrive is the Google Folder ID
    parent_id = parent_path.strip('/') if parent_path and parent_path != '/' else cfg['remote_path'] or 'root'

    file_metadata = {
        'name': folder_name,
        'mimeType': 'application/vnd.google-apps.folder',
        'parents': [parent_id]
    }

    try:
        result = service.files().create(
            body=file_metadata,
            fields='id, name'
        ).execute()
    except Exception as e:
        if 'alreadyExists' in str(e) or 'duplicate' in str(e).lower():
            raise HTTPException(409, f"Thư mục '{folder_name}' đã tồn tại")
        raise HTTPException(502, f"Google Drive error: {str(e)}")

    return {
        "success": True,
        "folder_name": folder_name,
        "folder_id": result.get('id')
    }


# ═══════════════════════════════════════════════════════════════
# DELETE FILE/FOLDER WITH PERMISSION CHECK
# ═══════════════════════════════════════════════════════════════

@router.delete("/delete")
async def delete_item(
    config_id: int = Query(...),
    item_path: str = Query(...),
    is_dir: bool = Query(False),
    file_id: str = Query(''),
    user_code: str = Query(''),
    user_role: str = Query('user')
):
    """Delete a file or folder from storage.

    Permission check: user must have can_delete=True on the parent folder.
    """
    import logging
    logging.info(f"[DELETE] config_id={config_id}, path={item_path}, is_dir={is_dir}, user={user_code}")

    # Check storage exists
    active_sql = "" if user_role in ('admin', 'head') else "AND is_active = TRUE"
    cfg = fetchone(f"SELECT * FROM storage_config WHERE id=:id {active_sql}", {"id": config_id})
    if not cfg:
        raise HTTPException(404, "Storage not found or inactive")

    # Check delete permission
    parent_path = os.path.dirname(item_path).replace('\\', '/') or '/'
    if not _check_can_delete(config_id, parent_path, user_code, user_role):
        raise HTTPException(403, "Bạn không có quyền xóa item này")

    try:
        if cfg['type'] == 'ftp':
            _delete_ftp(cfg, item_path, is_dir)
        elif cfg['type'] == 'smb':
            _delete_smb(cfg, item_path, is_dir)
        elif cfg['type'] == 'gdrive':
            _delete_gdrive(file_id or item_path)
        else:
            raise HTTPException(400, f"Unsupported storage type: {cfg['type']}")
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"[DELETE] Error: {e}")
        raise HTTPException(502, f"Delete error: {str(e)}")

    # Publish SSE event
    from ..core.events import publish_sync
    publish_sync("document_updated", {
        "config_id": config_id,
        "item_path": item_path,
        "action": "delete",
        "ts": datetime.now().isoformat(),
    })

    return {"success": True}


def _check_can_delete(storage_id, folder_path, user_code, user_role):
    """Check if user has can_delete permission on the folder."""
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
        SELECT can_delete FROM storage_permissions
        WHERE storage_id=:sid
          AND (
            target_type='EVERYONE'
            OR (target_type='DEPARTMENT' AND department != '' AND department=:dept)
            OR (role=:role)
            OR (employee_code=:code)
            OR (department='' AND role='' AND employee_code='')
          )
          AND (:fp = folder_path OR LOWER(:fp2) LIKE LOWER(folder_path || '/%') OR folder_path = '/')
          AND (expires_at IS NULL OR expires_at > :now)
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
    return bool(row.get('can_delete', 0))


def _delete_ftp(cfg, item_path: str, is_dir: bool):
    """Delete file or folder on FTP server."""
    ftp = ftplib.FTP()
    ftp.connect(cfg['host'], cfg['port'] or 21, timeout=30)
    ftp.login(cfg['username'] or 'anonymous', cfg['password'] or '')

    base = cfg['remote_path'] or '/'
    full_path = os.path.join(base, item_path.lstrip('/')).replace('\\', '/')

    try:
        if is_dir:
            ftp.rmd(full_path)
        else:
            ftp.delete(full_path)
    except ftplib.error_perm as e:
        ftp.quit()
        if '550' in str(e):
            raise HTTPException(404, "Item không tồn tại hoặc thư mục không rỗng")
        raise HTTPException(502, f"FTP error: {str(e)}")

    ftp.quit()


def _delete_smb(cfg, item_path: str, is_dir: bool):
    """Delete file or folder on SMB share."""
    try:
        from smb.SMBConnection import SMBConnection
    except ImportError:
        raise HTTPException(502, "SMB library not installed")

    conn = SMBConnection(cfg['username'], cfg['password'], 'goldenfarm', cfg['host'], domain=cfg.get('domain', ''))
    connected = conn.connect(cfg['host'], cfg['port'] or 445)
    if not connected:
        raise HTTPException(502, "Cannot connect to SMB server")

    share = cfg.get('remote_path', '').strip('/')
    if not share:
        conn.close()
        raise HTTPException(400, "Remote Path / Share name is required for SMB")

    smb_path = item_path.lstrip('/').replace('/', '\\')

    try:
        if is_dir:
            conn.deleteDirectory(share, smb_path)
        else:
            conn.deleteFiles(share, smb_path)
    except Exception as e:
        conn.close()
        if 'STATUS_OBJECT_NAME_NOT_FOUND' in str(e):
            raise HTTPException(404, "Item không tồn tại")
        if 'STATUS_DIRECTORY_NOT_EMPTY' in str(e):
            raise HTTPException(400, "Thư mục không rỗng. Vui lòng xóa nội dung bên trong trước.")
        raise HTTPException(502, f"SMB error: {str(e)}")

    conn.close()


def _delete_gdrive(cfg, file_id: str):
    """Delete file or folder in Google Drive using Domain-Wide Delegation."""
    if not _GOOGLE_AVAILABLE:
        raise HTTPException(502, "Google libraries not installed")

    try:
        creds = _build_gdrive_creds(cfg)
        service = build('drive', 'v3', credentials=creds)
        service.files().delete(fileId=file_id).execute()
    except Exception as e:
        if 'notFound' in str(e):
            raise HTTPException(404, "Item không tồn tại")
        raise HTTPException(502, f"Google Drive error: {str(e)}")
