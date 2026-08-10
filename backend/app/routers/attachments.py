import os
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Header, UploadFile, File
from fastapi.responses import FileResponse
from app.core.db import fetchall, fetchone, execute, insert
from app.core.auth import verify_session
from app.core import events
from app.services.upload_service import save_upload, delete_stored_file
from app.services.upload_service import UPLOAD_BASE

router = APIRouter(prefix="/api", tags=["attachments"])


class LinkCreate(BaseModel):
    url: str
    title: Optional[str] = ""


def _normalize_url(raw: str) -> str:
    raw = (raw or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Đường dẫn URL không được để trống")
    if not raw.lower().startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="URL phải bắt đầu bằng http:// hoặc https://")
    return raw


@router.get("/todos/{todo_id}/attachments")
def get_attachments(
    todo_id: int,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token")
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)

    todo = fetchone("SELECT id FROM todos WHERE id = :id", {"id": todo_id})
    if not todo:
        raise HTTPException(status_code=404, detail="Không tìm thấy công việc")

    rows = fetchall(
        """
        SELECT a.id, a.todo_id, a.uploader_code, a.file_name, a.file_type,
               a.file_size, a.file_url, a.created_at,
               COALESCE(e.full_name, a.uploader_code) AS uploader_name
        FROM attachments a
        LEFT JOIN employees e ON e.employee_code = a.uploader_code
        WHERE a.todo_id = :todo_id
        ORDER BY a.created_at DESC
        """,
        {"todo_id": todo_id}
    )

    return {"status": "success", "data": rows}


@router.post("/todos/{todo_id}/attachments", status_code=201)
async def create_attachment(
    todo_id: int,
    file: UploadFile = File(...),
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token")
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)

    todo = fetchone("SELECT id FROM todos WHERE id = :id", {"id": todo_id})
    if not todo:
        raise HTTPException(status_code=404, detail="Không tìm thấy công việc")

    upload_result = await save_upload(file)

    attachment_id = insert(
        """
        INSERT INTO attachments (todo_id, uploader_code, file_name, file_type, file_size, file_url, created_at)
        VALUES (:todo_id, :uploader_code, :file_name, :file_type, :file_size, :file_url, CURRENT_TIMESTAMP)
        """,
        {
            "todo_id": todo_id,
            "uploader_code": user["user_code"],
            "file_name": upload_result["file_name"],
            "file_type": upload_result["file_type"],
            "file_size": upload_result["file_size"],
            "file_url": upload_result["file_url"],
        }
    )

    events.publish_sync("attachment_added", {
        "todo_id": todo_id,
        "attachment_id": attachment_id,
        "file_name": upload_result["file_name"]
    })

    attachment = fetchone(
        "SELECT * FROM attachments WHERE id = :id",
        {"id": attachment_id}
    )

    return {
        "status": "success",
        "data": attachment,
        "message": "File đã được tải lên thành công"
    }


@router.post("/todos/{todo_id}/links", status_code=201)
def create_link_attachment(
    todo_id: int,
    data: LinkCreate,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token")
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)

    todo = fetchone("SELECT id FROM todos WHERE id = :id", {"id": todo_id})
    if not todo:
        raise HTTPException(status_code=404, detail="Không tìm thấy công việc")

    url = _normalize_url(data.url)
    title = (data.title or "").strip() or url

    attachment_id = insert(
        """
        INSERT INTO attachments (todo_id, uploader_code, file_name, file_type, file_size, file_url, created_at)
        VALUES (:todo_id, :uploader_code, :file_name, 'url', 0, :file_url, CURRENT_TIMESTAMP)
        """,
        {
            "todo_id": todo_id,
            "uploader_code": user["user_code"],
            "file_name": title,
            "file_url": url,
        }
    )

    events.publish_sync("attachment_added", {
        "todo_id": todo_id,
        "attachment_id": attachment_id,
        "file_name": title
    })

    attachment = fetchone(
        """
        SELECT a.id, a.todo_id, a.uploader_code, a.file_name, a.file_type,
               a.file_size, a.file_url, a.created_at,
               COALESCE(e.full_name, a.uploader_code) AS uploader_name
        FROM attachments a
        LEFT JOIN employees e ON e.employee_code = a.uploader_code
        WHERE a.id = :id
        """,
        {"id": attachment_id}
    )

    return {
        "status": "success",
        "data": attachment,
        "message": "Liên kết đã được thêm"
    }


@router.delete("/attachments/{attachment_id}")
def delete_attachment(
    attachment_id: int,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token")
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)

    attachment = fetchone(
        "SELECT * FROM attachments WHERE id = :id",
        {"id": attachment_id}
    )
    if not attachment:
        raise HTTPException(status_code=404, detail="Không tìm thấy file đính kèm")

    if user["user_role"] != "admin" and attachment["uploader_code"] != user["user_code"]:
        raise HTTPException(status_code=403, detail="Bạn không có quyền xóa file này")

    todo_id = attachment["todo_id"]

    if attachment["file_type"] != "url":
        stored_name = os.path.basename(attachment["file_url"])
        delete_stored_file(stored_name)

    execute(
        "DELETE FROM attachments WHERE id = :id",
        {"id": attachment_id}
    )

    events.publish_sync("attachment_deleted", {
        "todo_id": todo_id,
        "attachment_id": attachment_id
    })

    return {"status": "success", "message": "Đã xóa file đính kèm"}


@router.get("/uploads/todos/{filename}")
def serve_attachment_file(filename: str):
    file_path = os.path.join(UPLOAD_BASE, filename)

    # Security: prevent path traversal
    real_path = os.path.realpath(file_path)
    real_base = os.path.realpath(UPLOAD_BASE)
    if not real_path.startswith(real_base):
        raise HTTPException(status_code=400, detail="Đường dẫn file không hợp lệ")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File không tồn tại")

    return FileResponse(file_path, filename=filename)
