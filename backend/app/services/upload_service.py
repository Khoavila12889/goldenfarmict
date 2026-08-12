import os
import uuid
from fastapi import HTTPException, UploadFile

ALLOWED_EXTENSIONS = {'.pdf', '.doc', '.docx', '.xlsx', '.jpg', '.jpeg', '.png', '.webp'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))

UPLOAD_BASE = os.path.join(_BACKEND_ROOT, 'uploads', 'todos')
CHAT_UPLOAD_BASE = os.path.join(_BACKEND_ROOT, 'uploads', 'chat')
FORUM_UPLOAD_BASE = os.path.join(_BACKEND_ROOT, 'uploads', 'forum')


def _ensure_dir(base_dir: str):
    os.makedirs(base_dir, exist_ok=True)


def _validate(file: UploadFile):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Tên file không hợp lệ")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Định dạng '{ext}' không được hỗ trợ. "
                   f"Chỉ chấp nhận: {', '.join(ALLOWED_EXTENSIONS)}"
        )


async def _store(file: UploadFile, base_dir: str, url_prefix: str) -> dict:
    _ensure_dir(base_dir)
    _validate(file)

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="Dung lượng file vượt quá giới hạn 10MB"
        )

    ext = os.path.splitext(file.filename)[1].lower()
    stored_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(base_dir, stored_name)

    with open(file_path, "wb") as f:
        f.write(content)

    return {
        "file_name": file.filename,
        "stored_name": stored_name,
        "file_type": ext.lstrip('.'),
        "file_size": len(content),
        "file_url": f"{url_prefix}/{stored_name}",
    }


async def save_upload(file: UploadFile) -> dict:
    return await _store(file, UPLOAD_BASE, "/api/uploads/todos")


async def save_chat_upload(file: UploadFile) -> dict:
    return await _store(file, CHAT_UPLOAD_BASE, "/api/chat/uploads")


async def save_forum_upload(file: UploadFile) -> dict:
    return await _store(file, FORUM_UPLOAD_BASE, "/api/forum/uploads")


def delete_stored_file(stored_name: str) -> bool:
    file_path = os.path.join(UPLOAD_BASE, stored_name)
    if os.path.exists(file_path):
        os.remove(file_path)
        return True
    return False


def delete_chat_stored_file(stored_name: str) -> bool:
    file_path = os.path.join(CHAT_UPLOAD_BASE, stored_name)
    if os.path.exists(file_path):
        os.remove(file_path)
        return True
    return False
