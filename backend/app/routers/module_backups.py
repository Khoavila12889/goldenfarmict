from typing import List, Optional
from fastapi import APIRouter, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.core.auth import verify_session
from app.services.module_backup_service import BACKUP_BASE, create_backup, delete_backup, list_backups, preview_module, restore_backup, upload_backup

router = APIRouter(prefix="/api/admin/module-backups", tags=["module-backups"])

class ScanRequest(BaseModel):
    module: str
    start_date: str
    end_date: str

class CreateRequest(ScanRequest):
    record_ids: List[int] = []
    cleanup: bool = False

class RestoreRequest(BaseModel):
    filename: str

def admin(code: Optional[str], role: Optional[str], dept: Optional[str], token: Optional[str]):
    user = verify_session(code, role, dept, token)
    if user.get("user_role") != "admin": raise HTTPException(403, "Chỉ admin được quản lý backup module")

def auth_headers(x_user_code=Header(None, alias="X-User-Code"), x_user_role=Header(None, alias="X-User-Role"), x_user_dept=Header(None, alias="X-User-Dept"), x_user_token=Header(None, alias="X-User-Token")):
    admin(x_user_code, x_user_role, x_user_dept, x_user_token)

@router.post("/scan")
def scan(data: ScanRequest, _=None, x_user_code=Header(None, alias="X-User-Code"), x_user_role=Header(None, alias="X-User-Role"), x_user_dept=Header(None, alias="X-User-Dept"), x_user_token=Header(None, alias="X-User-Token")):
    admin(x_user_code,x_user_role,x_user_dept,x_user_token)
    try: return {"status":"success","data":preview_module(data.module,data.start_date,data.end_date)}
    except ValueError as exc: raise HTTPException(400,str(exc))

@router.post("", status_code=201)
def create(data: CreateRequest, x_user_code=Header(None, alias="X-User-Code"), x_user_role=Header(None, alias="X-User-Role"), x_user_dept=Header(None, alias="X-User-Dept"), x_user_token=Header(None, alias="X-User-Token")):
    admin(x_user_code,x_user_role,x_user_dept,x_user_token)
    try: return {"status":"success","data":create_backup(data.module,data.start_date,data.end_date,data.record_ids,data.cleanup)}
    except ValueError as exc: raise HTTPException(400,str(exc))

@router.get("")
def listing(x_user_code=Header(None, alias="X-User-Code"), x_user_role=Header(None, alias="X-User-Role"), x_user_dept=Header(None, alias="X-User-Dept"), x_user_token=Header(None, alias="X-User-Token")):
    admin(x_user_code,x_user_role,x_user_dept,x_user_token); return {"status":"success","data":list_backups()}

@router.post("/upload", status_code=201)
def upload(file: UploadFile=File(...), x_user_code=Header(None, alias="X-User-Code"), x_user_role=Header(None, alias="X-User-Role"), x_user_dept=Header(None, alias="X-User-Dept"), x_user_token=Header(None, alias="X-User-Token")):
    admin(x_user_code,x_user_role,x_user_dept,x_user_token)
    if not (file.filename or "").lower().endswith(".zip"):
        raise HTTPException(400,"Chỉ chấp nhận file .zip")
    try: return {"status":"success","data":upload_backup(file.file)}
    except ValueError as exc: raise HTTPException(400,str(exc))

@router.post("/restore")
def restore(data: RestoreRequest, x_user_code=Header(None, alias="X-User-Code"), x_user_role=Header(None, alias="X-User-Role"), x_user_dept=Header(None, alias="X-User-Dept"), x_user_token=Header(None, alias="X-User-Token")):
    admin(x_user_code,x_user_role,x_user_dept,x_user_token)
    try: return {"status":"success","data":restore_backup(data.filename)}
    except (ValueError,FileNotFoundError) as exc: raise HTTPException(400,str(exc))

@router.get("/{filename}/download")
def download(filename: str, x_user_code=Header(None, alias="X-User-Code"), x_user_role=Header(None, alias="X-User-Role"), x_user_dept=Header(None, alias="X-User-Dept"), x_user_token=Header(None, alias="X-User-Token")):
    admin(x_user_code,x_user_role,x_user_dept,x_user_token); path=BACKUP_BASE/filename
    if path.name!=filename or not path.is_file(): raise HTTPException(404,"Không tìm thấy backup")
    return FileResponse(path,filename=filename,media_type="application/zip")

@router.delete("/{filename}")
def remove(filename: str, x_user_code=Header(None, alias="X-User-Code"), x_user_role=Header(None, alias="X-User-Role"), x_user_dept=Header(None, alias="X-User-Dept"), x_user_token=Header(None, alias="X-User-Token")):
    admin(x_user_code,x_user_role,x_user_dept,x_user_token)
    try: delete_backup(filename); return {"status":"success"}
    except FileNotFoundError as exc: raise HTTPException(404,str(exc))
