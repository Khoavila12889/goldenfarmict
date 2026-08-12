from typing import Optional
import os
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Header, File, UploadFile
from fastapi.responses import FileResponse
from app.core.db import fetchall, fetchone, execute, insert
from app.core.auth import verify_session
from app.core import events
from app.services.upload_service import save_forum_upload, FORUM_UPLOAD_BASE


class ForumPostCreate(BaseModel):
    title: str
    content: str = ""
    target_type: str = "all"   # all | dept | user
    target_value: str = ""     # dept name (dept) OR comma list of codes (user)
    is_pinned: int = 0
    attachment_url: str = ""
    attachment_name: str = ""
    attachment_type: str = ""
    attachment_size: int = 0


class ForumPostUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    target_type: Optional[str] = None
    target_value: Optional[str] = None
    is_pinned: Optional[int] = None
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    attachment_type: Optional[str] = None
    attachment_size: Optional[int] = None


class ForumReplyCreate(BaseModel):
    content: str


router = APIRouter(prefix="/api/forum", tags=["forum"])


def require_manager(user: dict):
    if user["user_role"] not in ("admin", "head"):
        raise HTTPException(status_code=403, detail="Chỉ admin hoặc trưởng phòng mới được dùng chức năng này")


# ─── POSTS ────────────────────────────────────────────────────────────
@router.get("/posts")
def list_posts(
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token")
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    u_code = user["user_code"]
    u_role = user["user_role"]
    u_dept = user["department"]

    params = {}
    where = "1=1"
    if u_role not in ("admin", "head"):
        where = """(p.target_type = 'all'
                    OR p.author_code = :code
                    OR (p.target_type = 'dept' AND p.target_value = :dept)
                    OR (p.target_type = 'user' AND (',' || p.target_value || ',') LIKE '%,' || :code || ',%'))"""
        params = {"code": u_code, "dept": u_dept}

    sql = f"""
        SELECT p.*,
               (SELECT COUNT(*) FROM forum_replies r WHERE r.post_id = p.id) AS reply_count,
               (SELECT MIN(r.created_at) FROM forum_replies r WHERE r.post_id = p.id) AS last_reply_at
        FROM forum_posts p
        WHERE {where}
        ORDER BY p.is_pinned DESC, p.created_at DESC, p.id DESC
    """
    rows = fetchall(sql, params)
    return {"data": rows}


@router.post("/posts", status_code=201)
def create_post(
    data: ForumPostCreate,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token")
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    require_manager(user)

    title = (data.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Tiêu đề không được để trống")

    target_type = data.target_type if data.target_type in ("all", "dept", "user") else "all"
    target_value = (data.target_value or "").strip()

    post_id = insert("""
        INSERT INTO forum_posts (title, content, author_code, author_name, target_type, target_value, is_pinned,
                                 attachment_url, attachment_name, attachment_type, attachment_size,
                                 created_at, updated_at)
        VALUES (:title, :content, :author, :author_name, :target_type, :target_value, :pinned,
                :attachment_url, :attachment_name, :attachment_type, :attachment_size,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
    """, {
        "title": title,
        "content": (data.content or "").strip(),
        "author": user["user_code"],
        "author_name": user["full_name"],
        "target_type": target_type,
        "target_value": target_value,
        "pinned": 1 if data.is_pinned else 0,
        "attachment_url": (data.attachment_url or "").strip(),
        "attachment_name": (data.attachment_name or "").strip(),
        "attachment_type": (data.attachment_type or "").strip(),
        "attachment_size": int(data.attachment_size or 0),
    })

    events.publish_sync("forum_post_added", {"id": post_id})
    return {"success": True, "id": post_id, "message": "Đã tạo thông báo"}


@router.put("/posts/{post_id}")
def update_post(
    post_id: int,
    data: ForumPostUpdate,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token")
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    require_manager(user)

    post = fetchone("SELECT id FROM forum_posts WHERE id = :id", {"id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Không tìm thấy thông báo")

    updates = {}
    if data.title is not None:
        t = (data.title or "").strip()
        if not t:
            raise HTTPException(status_code=400, detail="Tiêu đề không được để trống")
        updates["title"] = t
    if data.content is not None:
        updates["content"] = (data.content or "").strip()
    if data.target_type is not None:
        updates["target_type"] = data.target_type if data.target_type in ("all", "dept", "user") else "all"
    if data.target_value is not None:
        updates["target_value"] = (data.target_value or "").strip()
    if data.is_pinned is not None:
        updates["is_pinned"] = 1 if data.is_pinned else 0
    if data.attachment_url is not None:
        updates["attachment_url"] = (data.attachment_url or "").strip()
    if data.attachment_name is not None:
        updates["attachment_name"] = (data.attachment_name or "").strip()
    if data.attachment_type is not None:
        updates["attachment_type"] = (data.attachment_type or "").strip()
    if data.attachment_size is not None:
        updates["attachment_size"] = int(data.attachment_size or 0)

    if updates:
        set_clause = ", ".join(f"{k} = :{k}" for k in updates)
        updates["post_id"] = post_id
        execute(
            f"UPDATE forum_posts SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = :post_id",
            updates
        )

    events.publish_sync("forum_post_updated", {"id": post_id})
    return {"success": True, "message": "Đã cập nhật thông báo"}


@router.delete("/posts/{post_id}")
def delete_post(
    post_id: int,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token")
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    require_manager(user)

    post = fetchone("SELECT id FROM forum_posts WHERE id = :id", {"id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Không tìm thấy thông báo")

    execute("DELETE FROM forum_replies WHERE post_id = :id", {"id": post_id})
    execute("DELETE FROM forum_posts WHERE id = :id", {"id": post_id})

    events.publish_sync("forum_post_deleted", {"id": post_id})
    return {"success": True, "message": "Đã xóa thông báo"}


# ─── REPLIES (hỏi – đáp trong forum) ─────────────────────────────────
@router.get("/posts/{post_id}/replies")
def list_replies(
    post_id: int,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token")
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)

    post = fetchone("SELECT id FROM forum_posts WHERE id = :id", {"id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Không tìm thấy thông báo")

    # Kiểm tra quyền xem bài đăng với target riêng
    if user["user_role"] not in ("admin", "head"):
        allowed = fetchone("""
            SELECT p.id FROM forum_posts p
            WHERE p.id = :id AND (
                p.target_type = 'all'
                OR p.author_code = :code
                OR (p.target_type = 'dept' AND p.target_value = :dept)
                OR (p.target_type = 'user' AND (',' || p.target_value || ',') LIKE '%,' || :code || ',%')
            )
        """, {"id": post_id, "code": user["user_code"], "dept": user["department"]})
        if not allowed:
            raise HTTPException(status_code=403, detail="Bạn không có quyền xem thông báo này")

    rows = fetchall("""
        SELECT r.*, u.role AS author_role
        FROM forum_replies r
        LEFT JOIN users u ON u.employee_code = r.user_code
        WHERE r.post_id = :post_id
        ORDER BY r.created_at ASC, r.id ASC
    """, {"post_id": post_id})
    return {"data": rows}


@router.post("/posts/{post_id}/replies", status_code=201)
def create_reply(
    post_id: int,
    data: ForumReplyCreate,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token")
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)

    post = fetchone("SELECT id FROM forum_posts WHERE id = :id", {"id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Không tìm thấy thông báo")

    # Kiểm tra quyền xem bài đăng với target riêng
    if user["user_role"] not in ("admin", "head"):
        allowed = fetchone("""
            SELECT p.id FROM forum_posts p
            WHERE p.id = :id AND (
                p.target_type = 'all'
                OR p.author_code = :code
                OR (p.target_type = 'dept' AND p.target_value = :dept)
                OR (p.target_type = 'user' AND (',' || p.target_value || ',') LIKE '%,' || :code || ',%')
            )
        """, {"id": post_id, "code": user["user_code"], "dept": user["department"]})
        if not allowed:
            raise HTTPException(status_code=403, detail="Bạn không có quyền bình luận thông báo này")

    content = (data.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Nội dung không được để trống")

    reply_id = insert("""
        INSERT INTO forum_replies (post_id, user_code, user_name, content, created_at)
        VALUES (:post_id, :user_code, :user_name, :content, CURRENT_TIMESTAMP)
        RETURNING id
    """, {
        "post_id": post_id,
        "user_code": user["user_code"],
        "user_name": user["full_name"],
        "content": content,
    })

    events.publish_sync("forum_reply_added", {"post_id": post_id, "reply_id": reply_id})
    reply = fetchone("""
        SELECT r.*, u.role AS author_role
        FROM forum_replies r
        LEFT JOIN users u ON u.employee_code = r.user_code
        WHERE r.id = :rid
    """, {"rid": reply_id})
    return {"success": True, "data": reply, "message": "Đã gửi bình luận"}


# ─── UPLOAD FILE đính kèm thông báo (ảnh jpg/png/webp, pdf) ────────
@router.post("/upload", status_code=201)
async def upload_forum_file(
    file: UploadFile = File(...),
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    require_manager(user)

    result = await save_forum_upload(file)
    return {
        "status": "success",
        "data": result,
        "message": "File đã được tải lên",
    }


@router.get("/uploads/{filename}")
def serve_forum_file(filename: str):
    file_path = os.path.join(FORUM_UPLOAD_BASE, filename)

    real_path = os.path.realpath(file_path)
    real_base = os.path.realpath(FORUM_UPLOAD_BASE)
    if not real_path.startswith(real_base):
        raise HTTPException(status_code=400, detail="Đường dẫn file không hợp lệ")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File không tồn tại")

    return FileResponse(file_path, filename=filename)