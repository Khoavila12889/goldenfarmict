from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Header
from app.core.db import fetchall, fetchone, execute, insert
from app.core.auth import verify_session
from app.core import events
from app.services.mention_parser import parse_mentions, create_mention_notifications


class CommentCreate(BaseModel):
    content: str


class CommentOut(BaseModel):
    id: int
    todo_id: int
    user_code: str
    full_name: str
    content: str
    created_at: str
    updated_at: str


router = APIRouter(prefix="/api/todos", tags=["comments"])


@router.get("/{todo_id}/comments")
def get_comments(
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
        SELECT c.id, c.todo_id, c.user_code, c.content, c.created_at, c.updated_at,
               COALESCE(e.full_name, c.user_code) AS full_name
        FROM comments c
        LEFT JOIN employees e ON e.employee_code = c.user_code
        WHERE c.todo_id = :todo_id
        ORDER BY c.created_at ASC
        """,
        {"todo_id": todo_id}
    )

    return {"status": "success", "data": rows}


@router.post("/{todo_id}/comments", status_code=201)
def create_comment(
    todo_id: int,
    data: CommentCreate,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token")
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)

    todo = fetchone("SELECT id FROM todos WHERE id = :id", {"id": todo_id})
    if not todo:
        raise HTTPException(status_code=404, detail="Không tìm thấy công việc")

    if not data.content.strip():
        raise HTTPException(status_code=400, detail="Nội dung bình luận không được để trống")

    comment_id = insert(
        """
        INSERT INTO comments (todo_id, user_code, content, created_at, updated_at)
        VALUES (:todo_id, :user_code, :content, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """,
        {
            "todo_id": todo_id,
            "user_code": user["user_code"],
            "content": data.content.strip()
        }
    )

    mentioned = parse_mentions(data.content)
    if mentioned:
        create_mention_notifications(
            todo_id=todo_id,
            mentioned_codes=mentioned,
            triggered_by_code=user["user_code"],
            triggered_by_name=user["full_name"]
        )

    events.publish_sync("comment_added", {
        "todo_id": todo_id,
        "comment_id": comment_id,
        "user_code": user["user_code"]
    })

    comment = fetchone(
        """
        SELECT c.id, c.todo_id, c.user_code, c.content, c.created_at, c.updated_at,
               COALESCE(e.full_name, c.user_code) AS full_name
        FROM comments c
        LEFT JOIN employees e ON e.employee_code = c.user_code
        WHERE c.id = :cid
        """,
        {"cid": comment_id}
    )

    return {"status": "success", "data": comment, "message": "Bình luận đã được thêm"}
