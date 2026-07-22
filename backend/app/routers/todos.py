from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Query, Header
from app.core.database import get_conn
from app.core import events

class SubTaskItem(BaseModel):
    id: Optional[int] = None
    title: str
    is_completed: Optional[int] = 0

class TodoCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    scope: Optional[str] = "personal" # personal, department
    department: Optional[str] = ""
    assignee_code: Optional[str] = ""
    assignee_name: Optional[str] = ""
    priority: Optional[str] = "medium" # low, medium, high, urgent
    due_date: Optional[str] = ""
    tags: Optional[str] = ""
    subtasks: Optional[List[SubTaskItem]] = []

class TodoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    scope: Optional[str] = None
    department: Optional[str] = None
    assignee_code: Optional[str] = None
    assignee_name: Optional[str] = None
    status: Optional[str] = None # todo, in_progress, review, completed, cancelled
    priority: Optional[str] = None
    due_date: Optional[str] = None
    tags: Optional[str] = None
    subtasks: Optional[List[SubTaskItem]] = None

class TodoStatusUpdate(BaseModel):
    status: str


router = APIRouter(prefix="/api/todos", tags=["todos"])

def verify_session(x_user_code: Optional[str], x_user_role: Optional[str], x_user_dept: Optional[str]):
    return {
        "user_code": x_user_code or "",
        "user_role": x_user_role or "user",
        "department": x_user_dept or ""
    }

@router.get("")
def get_todos(
    scope: str = Query("all", description="all, personal, department"),
    status: str = Query("all", description="all, todo, in_progress, review, completed, cancelled"),
    priority: str = Query("all", description="all, low, medium, high, urgent"),
    search: str = Query("", description="Keywords"),
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept")
):
    conn = get_conn()
    user = verify_session(x_user_code, x_user_role, x_user_dept)
    u_code = user["user_code"]
    u_role = user["user_role"]
    u_dept = user["department"]

    query = "SELECT * FROM todos WHERE 1=1"
    params = []

    # Filtering by scope & user permission
    if u_role == 'admin':
        if scope == 'personal':
            query += " AND (scope = 'personal' AND (creator_code = ? OR assignee_code = ?))"
            params.extend([u_code, u_code])
        elif scope == 'department':
            query += " AND scope = 'department'"
    else:
        # User or Head
        if scope == 'personal':
            query += " AND scope = 'personal' AND (creator_code = ? OR assignee_code = ?)"
            params.extend([u_code, u_code])
        elif scope == 'department':
            query += " AND scope = 'department' AND department = ?"
            params.append(u_dept)
        else: # 'all'
            query += " AND ((scope = 'personal' AND (creator_code = ? OR assignee_code = ?)) OR (scope = 'department' AND department = ?))"
            params.extend([u_code, u_code, u_dept])

    if status != "all":
        query += " AND status = ?"
        params.append(status)

    if priority != "all":
        query += " AND priority = ?"
        params.append(priority)

    if search:
        query += " AND (title LIKE ? OR description LIKE ? OR tags LIKE ? OR assignee_name LIKE ? OR creator_name LIKE ?)"
        term = f"%{search}%"
        params.extend([term, term, term, term, term])

    query += " ORDER BY CASE WHEN status = 'completed' THEN 1 ELSE 0 END, updated_at DESC"
    
    rows = conn.execute(query, params).fetchall()
    result = []
    
    for row in rows:
        todo = dict(row)
        # Fetch subtasks
        subtasks = conn.execute(
            "SELECT * FROM todo_subtasks WHERE todo_id = ? ORDER BY sort_order ASC, id ASC",
            (todo['id'],)
        ).fetchall()
        todo['subtasks'] = [dict(s) for s in subtasks]
        
        # Calculate completion percentage
        total_sub = len(todo['subtasks'])
        done_sub = sum(1 for s in todo['subtasks'] if s['is_completed'])
        todo['subtask_count'] = total_sub
        todo['subtask_done'] = done_sub
        todo['progress_pct'] = round((done_sub / total_sub * 100)) if total_sub > 0 else (100 if todo['status'] == 'completed' else 0)
        
        result.append(todo)

    conn.close()
    return {"status": "success", "data": result}

@router.get("/stats")
def get_todo_stats(
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept")
):
    conn = get_conn()
    user = verify_session(x_user_code, x_user_role, x_user_dept)
    u_code = user["user_code"]
    u_role = user["user_role"]
    u_dept = user["department"]

    base_where = ""
    params = []
    if u_role != 'admin':
        base_where = " WHERE ((scope = 'personal' AND (creator_code = ? OR assignee_code = ?)) OR (scope = 'department' AND department = ?))"
        params = [u_code, u_code, u_dept]

    total = conn.execute(f"SELECT COUNT(*) FROM todos{base_where}", params).fetchone()[0]
    
    status_where = (base_where + " AND " if base_where else " WHERE ")
    
    pending = conn.execute(f"SELECT COUNT(*) FROM todos{status_where}status = 'todo'", params).fetchone()[0]
    in_progress = conn.execute(f"SELECT COUNT(*) FROM todos{status_where}status = 'in_progress'", params).fetchone()[0]
    review = conn.execute(f"SELECT COUNT(*) FROM todos{status_where}status = 'review'", params).fetchone()[0]
    completed = conn.execute(f"SELECT COUNT(*) FROM todos{status_where}status = 'completed'", params).fetchone()[0]
    
    # Overdue count
    import datetime
    today_str = datetime.date.today().isoformat()
    overdue_where = status_where + "due_date != '' AND due_date < ? AND status NOT IN ('completed', 'cancelled')"
    overdue_params = params + [today_str]
    overdue = conn.execute(f"SELECT COUNT(*) FROM todos{overdue_where}", overdue_params).fetchone()[0]

    conn.close()
    return {
        "status": "success",
        "data": {
            "total": total,
            "todo": pending,
            "in_progress": in_progress,
            "review": review,
            "completed": completed,
            "overdue": overdue
        }
    }

@router.post("")
def create_todo(
    data: TodoCreate,
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept")
):
    conn = get_conn()
    user = verify_session(x_user_code, x_user_role, x_user_dept)
    creator_code = user["user_code"] or "ADMIN"
    
    # Get creator name
    creator_emp = conn.execute("SELECT full_name, department FROM employees WHERE employee_code = ?", (creator_code,)).fetchone()
    creator_name = creator_emp['full_name'] if creator_emp else creator_code
    creator_dept = creator_emp['department'] if creator_emp else user["department"]

    target_dept = data.department if data.department else (creator_dept if data.scope == 'department' else "")
    
    # Insert todo
    cursor = conn.execute("""
        INSERT INTO todos (
            title, description, scope, department, creator_code, creator_name,
            assignee_code, assignee_name, status, priority, due_date, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'todo', ?, ?, ?)
    """, (
        data.title, data.description or "", data.scope or "personal", target_dept,
        creator_code, creator_name, data.assignee_code or "", data.assignee_name or "",
        data.priority or "medium", data.due_date or "", data.tags or ""
    ))
    todo_id = cursor.lastrowid

    # Insert subtasks
    if data.subtasks:
        for idx, sub in enumerate(data.subtasks):
            conn.execute("""
                INSERT INTO todo_subtasks (todo_id, title, is_completed, sort_order)
                VALUES (?, ?, ?, ?)
            """, (todo_id, sub.title, sub.is_completed or 0, idx))

    conn.commit()
    conn.close()

    events.publish("todo_created", {"id": todo_id, "title": data.title, "scope": data.scope, "department": target_dept})
    return {"status": "success", "id": todo_id, "message": "Công việc đã được tạo thành công"}

@router.put("/{todo_id}")
def update_todo(
    todo_id: int,
    data: TodoUpdate,
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role")
):
    conn = get_conn()
    todo = conn.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
    if not todo:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy công việc")

    # Update todo fields
    update_fields = []
    params = []
    
    if data.title is not None:
        update_fields.append("title = ?")
        params.append(data.title)
    if data.description is not None:
        update_fields.append("description = ?")
        params.append(data.description)
    if data.scope is not None:
        update_fields.append("scope = ?")
        params.append(data.scope)
    if data.department is not None:
        update_fields.append("department = ?")
        params.append(data.department)
    if data.assignee_code is not None:
        update_fields.append("assignee_code = ?")
        params.append(data.assignee_code)
    if data.assignee_name is not None:
        update_fields.append("assignee_name = ?")
        params.append(data.assignee_name)
    if data.status is not None:
        update_fields.append("status = ?")
        params.append(data.status)
    if data.priority is not None:
        update_fields.append("priority = ?")
        params.append(data.priority)
    if data.due_date is not None:
        update_fields.append("due_date = ?")
        params.append(data.due_date)
    if data.tags is not None:
        update_fields.append("tags = ?")
        params.append(data.tags)

    if update_fields:
        update_fields.append("updated_at = (datetime('now','localtime'))")
        sql = f"UPDATE todos SET {', '.join(update_fields)} WHERE id = ?"
        params.append(todo_id)
        conn.execute(sql, params)

    # Handle subtasks update if provided
    if data.subtasks is not None:
        conn.execute("DELETE FROM todo_subtasks WHERE todo_id = ?", (todo_id,))
        for idx, sub in enumerate(data.subtasks):
            conn.execute("""
                INSERT INTO todo_subtasks (todo_id, title, is_completed, sort_order)
                VALUES (?, ?, ?, ?)
            """, (todo_id, sub.title, sub.is_completed or 0, idx))

    conn.commit()
    conn.close()

    events.publish("todo_updated", {"id": todo_id, "status": data.status or todo['status']})
    return {"status": "success", "message": "Cập nhật công việc thành công"}

@router.patch("/{todo_id}/status")
def update_todo_status(
    todo_id: int,
    data: TodoStatusUpdate,
):
    conn = get_conn()
    todo = conn.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
    if not todo:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy công việc")

    conn.execute(
        "UPDATE todos SET status = ?, updated_at = (datetime('now','localtime')) WHERE id = ?",
        (data.status, todo_id)
    )
    conn.commit()
    conn.close()

    events.publish("todo_updated", {"id": todo_id, "status": data.status})
    return {"status": "success", "message": "Cập nhật trạng thái thành công"}

@router.delete("/{todo_id}")
def delete_todo(
    todo_id: int,
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role")
):
    conn = get_conn()
    todo = conn.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
    if not todo:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy công việc")

    conn.execute("DELETE FROM todo_subtasks WHERE todo_id = ?", (todo_id,))
    conn.execute("DELETE FROM todos WHERE id = ?", (todo_id,))
    conn.commit()
    conn.close()

    events.publish("todo_deleted", {"id": todo_id})
    return {"status": "success", "message": "Đã xóa công việc"}
