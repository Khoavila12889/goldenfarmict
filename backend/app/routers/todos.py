from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Query, Header
from app.core.db import fetchall, fetchone, execute, insert
from app.core.auth import verify_token
from app.core import events

class SubTaskItem(BaseModel):
    id: Optional[int] = None
    title: str
    is_completed: Optional[int] = 0

class TodoCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    scope: Optional[str] = "personal"
    department: Optional[str] = ""
    assignee_code: Optional[str] = ""
    assignee_name: Optional[str] = ""
    priority: Optional[str] = "medium"
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
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    tags: Optional[str] = None
    subtasks: Optional[List[SubTaskItem]] = None

class TodoStatusUpdate(BaseModel):
    status: str

router = APIRouter(prefix="/api/todos", tags=["todos"])

def verify_session(x_user_code: Optional[str], x_user_role: Optional[str], x_user_dept: Optional[str], x_user_token: Optional[str] = None):
    code = (x_user_code or "").strip()
    if not code:
        raise HTTPException(status_code=401, detail="Thiếu thông tin người dùng")

    if x_user_token:
        if not verify_token(code, x_user_token, x_user_role or "user"):
            raise HTTPException(status_code=401, detail="Token không hợp lệ")

    user = fetchone(
        "SELECT u.role FROM users u WHERE u.employee_code = :code",
        {"code": code}
    )
    if not user:
        raise HTTPException(status_code=401, detail="Người dùng không tồn tại trong hệ thống")

    emp = fetchone(
        "SELECT e.full_name, e.department FROM employees e WHERE e.employee_code = :code",
        {"code": code}
    )
    full_name = emp['full_name'] if emp else code
    emp_dept = emp['department'] if emp else ""

    dept_entry = fetchone(
        "SELECT name FROM departments WHERE LOWER(name) = LOWER(:emp_dept)",
        {"emp_dept": emp_dept}
    )
    resolved_dept = dept_entry['name'] if dept_entry else emp_dept

    return {
        "user_code": code,
        "user_role": user['role'],
        "department": resolved_dept,
        "full_name": full_name
    }

@router.get("")
def get_todos(
    scope: str = Query("all", description="all, personal, department"),
    status: str = Query("all", description="all, todo, in_progress, review, completed, cancelled"),
    priority: str = Query("all", description="all, low, medium, high, urgent"),
    search: str = Query("", description="Keywords"),
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token")
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    u_code = user["user_code"]
    u_role = user["user_role"]
    u_dept = user["department"]

    query = "SELECT * FROM todos WHERE 1=1"
    params = {}

    if u_role == 'admin':
        if scope == 'personal':
            query += " AND (scope = 'personal' AND (creator_code = :u_code OR assignee_code = :u_code))"
            params['u_code'] = u_code
        elif scope == 'department':
            query += " AND scope = 'department'"
    else:
        if scope == 'personal':
            query += " AND scope = 'personal' AND (creator_code = :u_code OR assignee_code = :u_code)"
            params['u_code'] = u_code
        elif scope == 'department':
            query += " AND scope = 'department' AND department = :u_dept"
            params['u_dept'] = u_dept
        else:
            query += " AND ((scope = 'personal' AND (creator_code = :u_code OR assignee_code = :u_code)) OR (scope = 'department' AND department = :u_dept))"
            params['u_code'] = u_code
            params['u_dept'] = u_dept

    if status != "all":
        query += " AND status = :status"
        params['status'] = status

    if priority != "all":
        query += " AND priority = :priority"
        params['priority'] = priority

    if search:
        query += " AND (title ILIKE :term OR description ILIKE :term OR tags ILIKE :term OR assignee_name ILIKE :term OR creator_name ILIKE :term)"
        params['term'] = f"%{search}%"

    query += " ORDER BY CASE WHEN status = 'completed' THEN 1 ELSE 0 END, updated_at DESC"

    rows = fetchall(query, params)
    result = []

    for row in rows:
        todo = dict(row)
        subtasks = fetchall(
            "SELECT * FROM todo_subtasks WHERE todo_id = :todo_id ORDER BY sort_order ASC, id ASC",
            {"todo_id": todo['id']}
        )
        todo['subtasks'] = subtasks

        total_sub = len(todo['subtasks'])
        done_sub = sum(1 for s in todo['subtasks'] if s['is_completed'])
        todo['subtask_count'] = total_sub
        todo['subtask_done'] = done_sub
        todo['progress_pct'] = round((done_sub / total_sub * 100)) if total_sub > 0 else (100 if todo['status'] == 'completed' else 0)

        result.append(todo)

    return {"status": "success", "data": result}

@router.get("/stats")
def get_todo_stats(
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token")
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    u_code = user["user_code"]
    u_role = user["user_role"]
    u_dept = user["department"]

    base_where = ""
    params = {}
    if u_role != 'admin':
        base_where = " WHERE ((scope = 'personal' AND (creator_code = :u_code OR assignee_code = :u_code)) OR (scope = 'department' AND department = :u_dept))"
        params = {"u_code": u_code, "u_dept": u_dept}

    total = fetchone(f"SELECT COUNT(*) AS cnt FROM todos{base_where}", params)["cnt"]

    status_where = (base_where + " AND " if base_where else " WHERE ")

    pending = fetchone(f"SELECT COUNT(*) AS cnt FROM todos{status_where}status = 'todo'", params)["cnt"]
    in_progress = fetchone(f"SELECT COUNT(*) AS cnt FROM todos{status_where}status = 'in_progress'", params)["cnt"]
    review = fetchone(f"SELECT COUNT(*) AS cnt FROM todos{status_where}status = 'review'", params)["cnt"]
    completed = fetchone(f"SELECT COUNT(*) AS cnt FROM todos{status_where}status = 'completed'", params)["cnt"]

    import datetime
    today_str = datetime.date.today().isoformat()
    overdue_where = status_where + "due_date != '' AND due_date < :today_str AND status NOT IN ('completed', 'cancelled')"
    overdue = fetchone(f"SELECT COUNT(*) AS cnt FROM todos{overdue_where}", {**params, "today_str": today_str})["cnt"]

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
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token")
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    creator_code = user["user_code"]
    creator_name = user["full_name"]
    creator_dept = user["department"]
    u_role = user["user_role"]

    if u_role != 'admin' and data.assignee_code:
        if u_role == 'head':
            if not fetchone("SELECT id FROM employees WHERE employee_code = :code AND department = :dept", {"code": data.assignee_code, "dept": creator_dept}):
                raise HTTPException(403, "Trưởng phòng chỉ có thể giao việc cho nhân viên trong phòng ban của mình")
        else:
            if data.assignee_code != creator_code:
                raise HTTPException(403, "Người dùng chỉ có thể giao việc cho chính mình")

    if u_role != 'admin' and data.scope == 'department' and data.department and data.department != creator_dept:
        raise HTTPException(403, f"Bạn chỉ có thể tạo công việc trong phòng ban {creator_dept}")

    target_dept = data.department if data.department else (creator_dept if data.scope == 'department' else "")

    todo_id = insert("""
        INSERT INTO todos (
            title, description, scope, department, creator_code, creator_name,
            assignee_code, assignee_name, status, priority, due_date, tags
        ) VALUES (:title, :description, :scope, :department, :creator_code, :creator_name,
                  :assignee_code, :assignee_name, 'todo', :priority, :due_date, :tags)
    """, {
        "title": data.title,
        "description": data.description or "",
        "scope": data.scope or "personal",
        "department": target_dept,
        "creator_code": creator_code,
        "creator_name": creator_name,
        "assignee_code": data.assignee_code or "",
        "assignee_name": data.assignee_name or "",
        "priority": data.priority or "medium",
        "due_date": data.due_date or "",
        "tags": data.tags or ""
    })

    if data.subtasks:
        for idx, sub in enumerate(data.subtasks):
            execute("""
                INSERT INTO todo_subtasks (todo_id, title, is_completed, sort_order)
                VALUES (:todo_id, :title, :is_completed, :sort_order)
            """, {"todo_id": todo_id, "title": sub.title, "is_completed": sub.is_completed or 0, "sort_order": idx})

    events.publish("todo_created", {"id": todo_id, "title": data.title, "scope": data.scope, "department": target_dept})
    return {"status": "success", "id": todo_id, "message": "Công việc đã được tạo thành công"}

@router.get("/assignees")
def get_assignees(
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token")
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    u_role = user["user_role"]
    u_code = user["user_code"]
    u_dept = user["department"]

    if u_role == 'admin':
        rows = fetchall(
            "SELECT employee_code, full_name, department, position FROM employees WHERE status='active' ORDER BY department, full_name"
        )
    elif u_role == 'head':
        rows = fetchall(
            "SELECT employee_code, full_name, department, position FROM employees WHERE status='active' AND department = :dept ORDER BY full_name",
            {"dept": u_dept}
        )
    else:
        rows = fetchall(
            "SELECT employee_code, full_name, department, position FROM employees WHERE status='active' AND employee_code = :code",
            {"code": u_code}
        )

    return {"status": "success", "data": rows}

@router.put("/{todo_id}")
def update_todo(
    todo_id: int,
    data: TodoUpdate,
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token")
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    todo = fetchone("SELECT * FROM todos WHERE id = :todo_id", {"todo_id": todo_id})
    if not todo:
        raise HTTPException(status_code=404, detail="Không tìm thấy công việc")

    u_role = user["user_role"]
    u_code = user["user_code"]
    u_dept = user["department"]

    if u_role == 'admin':
        pass
    elif u_role == 'head':
        if todo['scope'] == 'personal' and todo['creator_code'] != u_code and todo['assignee_code'] != u_code:
            if todo['department'] and todo['department'] != u_dept:
                raise HTTPException(403, "Trưởng phòng chỉ có thể cập nhật công việc trong phòng ban của mình hoặc công việc của chính mình")
    else:
        if todo['creator_code'] != u_code and todo['assignee_code'] != u_code:
            raise HTTPException(403, "Bạn chỉ có thể cập nhật công việc của chính mình")

    if data.assignee_code and u_role != 'admin':
        if u_role == 'head':
            if not fetchone("SELECT id FROM employees WHERE employee_code = :code AND department = :dept", {"code": data.assignee_code, "dept": u_dept}):
                raise HTTPException(403, "Trưởng phòng chỉ có thể giao việc cho nhân viên trong phòng ban của mình")
        else:
            if data.assignee_code != u_code:
                raise HTTPException(403, "Người dùng chỉ có thể giao việc cho chính mình")

    if data.department and u_role != 'admin':
        if data.department != u_dept:
            raise HTTPException(403, "Bạn chỉ có thể gán công việc trong phòng ban của mình")

    update_fields = []
    params = {}

    if data.title is not None:
        update_fields.append("title = :title")
        params['title'] = data.title
    if data.description is not None:
        update_fields.append("description = :description")
        params['description'] = data.description
    if data.scope is not None:
        update_fields.append("scope = :scope")
        params['scope'] = data.scope
    if data.department is not None:
        update_fields.append("department = :department")
        params['department'] = data.department
    if data.assignee_code is not None:
        update_fields.append("assignee_code = :assignee_code")
        params['assignee_code'] = data.assignee_code
    if data.assignee_name is not None:
        update_fields.append("assignee_name = :assignee_name")
        params['assignee_name'] = data.assignee_name
    if data.status is not None:
        update_fields.append("status = :status")
        params['status'] = data.status
    if data.priority is not None:
        update_fields.append("priority = :priority")
        params['priority'] = data.priority
    if data.due_date is not None:
        update_fields.append("due_date = :due_date")
        params['due_date'] = data.due_date
    if data.tags is not None:
        update_fields.append("tags = :tags")
        params['tags'] = data.tags

    if update_fields:
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        sql = f"UPDATE todos SET {', '.join(update_fields)} WHERE id = :todo_id"
        params['todo_id'] = todo_id
        execute(sql, params)

    if data.subtasks is not None:
        execute("DELETE FROM todo_subtasks WHERE todo_id = :todo_id", {"todo_id": todo_id})
        for idx, sub in enumerate(data.subtasks):
            execute("""
                INSERT INTO todo_subtasks (todo_id, title, is_completed, sort_order)
                VALUES (:todo_id, :title, :is_completed, :sort_order)
            """, {"todo_id": todo_id, "title": sub.title, "is_completed": sub.is_completed or 0, "sort_order": idx})

    events.publish("todo_updated", {"id": todo_id, "status": data.status or todo['status']})
    return {"status": "success", "message": "Cập nhật công việc thành công"}

@router.patch("/{todo_id}/status")
def update_todo_status(
    todo_id: int,
    data: TodoStatusUpdate,
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token")
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    todo = fetchone("SELECT * FROM todos WHERE id = :todo_id", {"todo_id": todo_id})
    if not todo:
        raise HTTPException(status_code=404, detail="Không tìm thấy công việc")

    u_role = user["user_role"]
    u_code = user["user_code"]
    u_dept = user["department"]

    if u_role == 'admin':
        pass
    elif u_role == 'head':
        if todo['scope'] == 'personal' and todo['creator_code'] != u_code and todo['assignee_code'] != u_code:
            if todo['department'] and todo['department'] != u_dept:
                raise HTTPException(403, "Trưởng phòng chỉ có thể cập nhật trạng thái công việc trong phòng ban của mình")
    else:
        if todo['creator_code'] != u_code and todo['assignee_code'] != u_code:
            raise HTTPException(403, "Bạn chỉ có thể cập nhật trạng thái công việc của chính mình")

    execute(
        "UPDATE todos SET status = :status, updated_at = CURRENT_TIMESTAMP WHERE id = :todo_id",
        {"status": data.status, "todo_id": todo_id}
    )

    events.publish("todo_updated", {"id": todo_id, "status": data.status})
    return {"status": "success", "message": "Cập nhật trạng thái thành công"}

@router.delete("/{todo_id}")
def delete_todo(
    todo_id: int,
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token")
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    todo = fetchone("SELECT * FROM todos WHERE id = :todo_id", {"todo_id": todo_id})
    if not todo:
        raise HTTPException(status_code=404, detail="Không tìm thấy công việc")

    u_role = user["user_role"]
    u_code = user["user_code"]
    u_dept = user["department"]

    if u_role == 'admin':
        pass
    elif u_role == 'head':
        if todo['scope'] == 'personal' and todo['creator_code'] != u_code and todo['assignee_code'] != u_code:
            if todo['department'] and todo['department'] != u_dept:
                raise HTTPException(403, "Trưởng phòng chỉ có thể xóa công việc trong phòng ban của mình")
    else:
        raise HTTPException(403, "Bạn không có quyền xóa công việc")

    execute("DELETE FROM todo_subtasks WHERE todo_id = :todo_id", {"todo_id": todo_id})
    execute("DELETE FROM todos WHERE id = :todo_id", {"todo_id": todo_id})

    events.publish("todo_deleted", {"id": todo_id})
    return {"status": "success", "message": "Đã xóa công việc"}
