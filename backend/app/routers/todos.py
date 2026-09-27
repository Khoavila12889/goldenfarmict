from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Query, Header
from app.core.db import fetchall, fetchone, execute, insert
from app.core.auth import verify_session, same_dept, canonical_dept_name
from app.core.todo_permissions import (
    ADMIN, HEAD, PERSONAL, DEPARTMENT, can_delete, can_change_status,
    can_approve, can_create_in_scope, capabilities_for, departments_for, permissions_for,
    requires_department_approval, visible_sql, require_edit,
)
from app.core import events

ACTIVE_EMP_SQL = "COALESCE(NULLIF(TRIM(status), ''), 'active') = 'active'"


def _dept_eq(column: str, param: str) -> str:
    return f"LOWER(TRIM({column})) = LOWER(TRIM(:{param}))"


def _active_employees_in_dept(dept_name: str):
    if not (dept_name or "").strip():
        return []
    return fetchall(
        f"""
        SELECT id, employee_code, full_name, department, position
        FROM employees
        WHERE {ACTIVE_EMP_SQL}
          AND {_dept_eq('department', 'dept')}
        ORDER BY full_name
        """,
        {"dept": dept_name.strip()},
    )


def _active_employee(code: str):
    if not code:
        return None
    return fetchone(
        f"""
        SELECT employee_code, full_name, department
        FROM employees
        WHERE employee_code = :code AND {ACTIVE_EMP_SQL}
        """,
        {"code": code},
    )


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
    u_role = user["user_role"]
    u_dept = user["department"]

    if scope not in ("all", PERSONAL, DEPARTMENT):
        raise HTTPException(status_code=400, detail="Phạm vi lọc không hợp lệ")
    visibility, params = visible_sql(user, "todos")
    query = f"SELECT * FROM todos WHERE {visibility}"
    if scope != "all":
        query += " AND todos.scope = :scope"
        params["scope"] = scope

    if status != "all":
        query += " AND status = :status"
        params['status'] = status

    if priority != "all":
        query += " AND priority = :priority"
        params['priority'] = priority

    if search:
        query += " AND (LOWER(title) LIKE LOWER(:term) OR LOWER(description) LIKE LOWER(:term) OR LOWER(tags) LIKE LOWER(:term) OR LOWER(assignee_name) LIKE LOWER(:term) OR LOWER(creator_name) LIKE LOWER(:term))"
        params['term'] = f"%{search}%"

    query += " ORDER BY CASE WHEN status = 'completed' THEN 1 ELSE 0 END, updated_at DESC"

    rows = fetchall(query, params)
    result = []

    for row in rows:
        todo = dict(row)
        todo["permissions"] = permissions_for(user, todo)
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

    return {"status": "success", "data": result, "permissions": capabilities_for(user)}

@router.get("/stats")
def get_todo_stats(
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token")
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    visibility, params = visible_sql(user, "todos")
    base_where = f" WHERE {visibility}"

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

@router.get("/export")
def export_todos_report(
    scope: str = Query("all", description="all, personal, department"),
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token")
):
    """Xuất báo cáo Excel thống kê + chi tiết todos.
    User: chỉ xuất todos cá nhân mình.
    Head: xuất todos phòng ban mình phụ trách.
    Admin: xuất toàn bộ."""
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    u_code = user["user_code"]
    u_role = user["user_role"]
    u_dept = user["department"]
    u_name = user["full_name"]

    if scope not in ("all", PERSONAL, DEPARTMENT):
        raise HTTPException(status_code=400, detail="Phạm vi lọc không hợp lệ")
    visibility, params = visible_sql(user, "todos")
    where = f" WHERE {visibility}"
    if scope != "all":
        where += " AND todos.scope = :scope"
        params["scope"] = scope

    rows = fetchall(f"SELECT * FROM todos{where} ORDER BY created_at DESC", params)

    # Gắn subtask count
    todos_list = []
    for row in rows:
        t = dict(row)
        subs = fetchall("SELECT * FROM todo_subtasks WHERE todo_id = :id ORDER BY sort_order", {"id": t["id"]})
        t["subtask_count"] = len(subs)
        t["subtask_done"] = sum(1 for s in subs if s["is_completed"])
        todos_list.append(t)

    # Thống kê
    total = len(todos_list)
    by_status = {}
    by_priority = {}
    overdue = 0
    import datetime
    today = datetime.date.today().isoformat()
    for t in todos_list:
        s = t.get("status", "unknown")
        by_status[s] = by_status.get(s, 0) + 1
        p = t.get("priority", "medium")
        by_priority[p] = by_priority.get(p, 0) + 1
        if t.get("due_date") and t["due_date"] < today and t["status"] not in ("completed", "cancelled"):
            overdue += 1

    # Tạo Excel
    from openpyxl import Workbook
    from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
    from io import BytesIO

    wb = Workbook()

    # ── Sheet 1: Thống kê ──
    ws1 = wb.active
    ws1.title = "Thống kê"
    ws1.sheet_properties.tabColor = "4472C4"

    title_font = Font(name="Calibri", size=14, bold=True, color="1F4E79")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    label_font = Font(name="Calibri", size=11, bold=True)
    thin_border = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"), bottom=Side(style="thin")
    )

    ws1.merge_cells("A1:B1")
    ws1["A1"] = "BÁO CÁO THỐNG KÊ CÔNG VIỆC (TODOS)"
    ws1["A1"].font = title_font

    ws1.merge_cells("A2:B2")
    scope_label = "Toàn hệ thống" if u_role == "admin" and scope == "all" else (f"Phòng ban: {u_dept}" if u_role == "head" else f"Cá nhân: {u_name} ({u_code})")
    ws1["A2"] = f"Phạm vi: {scope_label}  |  Ngày xuất: {datetime.datetime.now().strftime('%d/%m/%Y %H:%M')}"
    ws1["A2"].font = Font(name="Calibri", size=10, italic=True, color="666666")

    stats_start = 4
    ws1.merge_cells(f"A{stats_start}:B{stats_start}")
    ws1[f"A{stats_start}"] = "TỔNG QUAN"
    ws1[f"A{stats_start}"].font = Font(name="Calibri", size=12, bold=True, color="2E75B6")

    stat_rows = [
        ("Tổng công việc", total),
        ("Đang xử lý", by_status.get("in_progress", 0)),
        ("Cần làm", by_status.get("todo", 0)),
        ("Chờ duyệt", by_status.get("review", 0)),
        ("Đã hoàn thành", by_status.get("completed", 0)),
        ("Đã hủy", by_status.get("cancelled", 0)),
        ("Quá hạn", overdue),
    ]

    r = stats_start + 1
    for label, val in stat_rows:
        ws1[f"A{r}"] = label
        ws1[f"A{r}"].font = label_font
        ws1[f"B{r}"] = val
        ws1[f"B{r}"].font = Font(name="Calibri", size=11, bold=True)
        for col in ("A", "B"):
            ws1[f"{col}{r}"].border = thin_border
            ws1[f"{col}{r}"].alignment = Alignment(horizontal="center" if col == "B" else "left")
        r += 1

    r += 1
    ws1.merge_cells(f"A{r}:B{r}")
    ws1[f"A{r}"] = "THEO ĐỘ ƯU TIÊN"
    ws1[f"A{r}"].font = Font(name="Calibri", size=12, bold=True, color="2E75B6")
    r += 1
    prio_labels = {"urgent": "Khẩn cấp", "high": "Cao", "medium": "Trung bình", "low": "Thấp"}
    for key in ["urgent", "high", "medium", "low"]:
        ws1[f"A{r}"] = prio_labels.get(key, key)
        ws1[f"A{r}"].font = label_font
        ws1[f"B{r}"] = by_priority.get(key, 0)
        ws1[f"B{r}"].font = Font(name="Calibri", size=11, bold=True)
        for col in ("A", "B"):
            ws1[f"{col}{r}"].border = thin_border
            ws1[f"{col}{r}"].alignment = Alignment(horizontal="center" if col == "B" else "left")
        r += 1

    ws1.column_dimensions["A"].width = 28
    ws1.column_dimensions["B"].width = 14

    # ── Sheet 2: Chi tiết ──
    ws2 = wb.create_sheet(title="Chi tiết công việc")
    ws2.sheet_properties.tabColor = "70AD47"

    detail_headers = ["STT", "Tiêu đề", "Người tạo", "Người nhận", "Phòng ban",
                      "Phạm vi", "Trạng thái", "Độ ưu tiên", "Hạn chót", "Subtask",
                      "Tags", "Ngày tạo"]
    header_row = 1
    for ci, h in enumerate(detail_headers, 1):
        cell = ws2.cell(row=header_row, column=ci, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        cell.border = thin_border

    status_map = {"todo": "Cần làm", "in_progress": "Đang xử lý", "review": "Chờ duyệt",
                  "completed": "Đã hoàn thành", "cancelled": "Đã hủy"}
    prio_map = {"urgent": "Khẩn cấp", "high": "Cao", "medium": "Trung bình", "low": "Thấp"}
    scope_map = {"personal": "Cá nhân", "department": "Phòng ban"}

    for idx, t in enumerate(todos_list, 1):
        due = t.get("due_date", "")
        if due and len(due) >= 10:
            try:
                due = datetime.datetime.strptime(due[:10], "%Y-%m-%d").strftime("%d/%m/%Y")
            except Exception:
                pass
        created = t.get("created_at", "")
        if created and len(created) >= 10:
            try:
                created = datetime.datetime.strptime(created[:10], "%Y-%m-%d").strftime("%d/%m/%Y")
            except Exception:
                pass

        row_data = [
            idx,
            t.get("title", ""),
            t.get("creator_name", ""),
            t.get("assignee_name", ""),
            t.get("department", ""),
            scope_map.get(t.get("scope", ""), t.get("scope", "")),
            status_map.get(t.get("status", ""), t.get("status", "")),
            prio_map.get(t.get("priority", ""), t.get("priority", "")),
            due,
            f"{t.get('subtask_done', 0)}/{t.get('subtask_count', 0)}",
            t.get("tags", ""),
            created,
        ]
        for ci, val in enumerate(row_data, 1):
            cell = ws2.cell(row=idx + 1, column=ci, value=val)
            cell.border = thin_border
            cell.alignment = Alignment(wrap_text=True, vertical="top")
            if t.get("status") == "completed":
                cell.fill = PatternFill(start_color="E2EFDA", end_color="E2EFDA", fill_type="solid")
            elif t.get("status") == "cancelled":
                cell.fill = PatternFill(start_color="F2F2F2", end_color="F2F2F2", fill_type="solid")

    # Auto column widths
    for ci, h in enumerate(detail_headers, 1):
        max_len = len(str(h))
        for row in ws2.iter_rows(min_col=ci, max_col=ci, min_row=2, max_row=len(todos_list) + 1):
            for cell in row:
                if cell.value:
                    max_len = max(max_len, min(len(str(cell.value)), 40))
        ws2.column_dimensions[ws2.cell(row=1, column=ci).column_letter].width = max_len + 2

    # Lưu vào BytesIO
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)

    from fastapi.responses import StreamingResponse
    filename = f"todos_report_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    safe_name = filename.encode("ascii", "ignore").decode("ascii") or "report.xlsx"
    from urllib.parse import quote
    cd = f"attachment; filename=\"{safe_name}\"; filename*=UTF-8''{quote(filename)}"

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": cd, "Content-Length": str(buf.getbuffer().nbytes)}
    )

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

    scope = (data.scope or "personal").strip()
    if scope not in ("personal", "department"):
        raise HTTPException(400, "Phạm vi công việc không hợp lệ")

    # ── Phân quyền tạo nhiệm vụ ──────────────────────────────
    target_dept = ""
    assignee_code = ""
    assignee_name = ""
    is_dept_approved = 1  # Mặc định đã duyệt (personal hoặc admin/head tạo)

    if scope == "personal":
        # Cá nhân: chỉ giao cho chính mình
        if data.assignee_code and data.assignee_code != creator_code:
            raise HTTPException(403, "Công việc cá nhân chỉ giao cho chính bạn")
        assignee_code = creator_code
        assignee_name = creator_name
        # target_dept đã là "" ở trên

    elif scope == "department":
        allowed = departments_for(user)
        requested = (data.department or "").strip()
        if u_role == ADMIN:
            requested = requested or creator_dept
        elif u_role == HEAD:
            requested = requested or (creator_dept if any(same_dept(creator_dept, d) for d in (allowed or [])) else ((allowed or [""])[0]))
        else:
            requested = creator_dept
        if not can_create_in_scope(user, scope, requested):
            raise HTTPException(status_code=403, detail="Bạn không có quyền tạo công việc cho phòng ban này")
        target_dept = canonical_dept_name(requested)
        is_dept_approved = 0 if requires_department_approval(user, scope) else 1

        assignee_code = (data.assignee_code or "").strip()
        assignee_name = (data.assignee_name or "").strip()
        if assignee_code:
            emp = _active_employee(assignee_code)
            if not emp:
                raise HTTPException(400, "Nhân viên không tồn tại hoặc không còn làm việc")
            if target_dept and not same_dept(emp.get("department"), target_dept):
                raise HTTPException(403, "Chỉ có thể giao việc cho nhân viên trong phòng ban đã chọn")
            assignee_name = emp.get("full_name") or assignee_name

    todo_id = insert("""
        INSERT INTO todos (
            title, description, scope, department, creator_code, creator_name,
            assignee_code, assignee_name, status, priority, due_date, tags, is_dept_approved
        ) VALUES (:title, :description, :scope, :department, :creator_code, :creator_name,
                  :assignee_code, :assignee_name, 'todo', :priority, :due_date, :tags, :is_dept_approved)
        RETURNING id
    """, {
        "title": data.title,
        "description": data.description or "",
        "scope": scope,
        "department": target_dept,
        "creator_code": creator_code,
        "creator_name": creator_name,
        "assignee_code": assignee_code,
        "assignee_name": assignee_name,
        "priority": data.priority or "medium",
        "due_date": data.due_date or "",
        "tags": data.tags or "",
        "is_dept_approved": is_dept_approved
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
    department: str = Query("", description="Lọc nhân viên theo phòng ban"),
    x_user_code: str = Header(None, alias="X-User-Code"),
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_dept: str = Header(None, alias="X-User-Dept"),
    x_user_token: str = Header(None, alias="X-User-Token")
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    allowed = departments_for(user)
    requested = (department or "").strip()

    def _all_active():
        return fetchall(
            f"""
            SELECT id, employee_code, full_name, department, position
            FROM employees
            WHERE {ACTIVE_EMP_SQL}
            ORDER BY department, full_name
            """
        )

    if allowed is None:
        rows = _active_employees_in_dept(requested) if requested else _all_active()
    else:
        if requested:
            if not any(same_dept(requested, d) for d in allowed):
                raise HTTPException(403, "Bạn chỉ có thể xem nhân viên trong phòng ban được phép")
            rows = _active_employees_in_dept(requested)
        elif len(allowed) == 1:
            rows = _active_employees_in_dept(allowed[0])
        elif allowed:
            seen = set()
            rows = []
            for d in allowed:
                for emp in _active_employees_in_dept(d):
                    if emp["employee_code"] not in seen:
                        seen.add(emp["employee_code"])
                        rows.append(emp)
        else:
            rows = []

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

    require_edit(user, dict(todo))
    new_scope = data.scope if data.scope is not None else todo['scope']
    if new_scope not in (PERSONAL, DEPARTMENT):
        raise HTTPException(status_code=400, detail="Phạm vi công việc không hợp lệ")
    if data.status is not None and data.status not in {"todo", "in_progress", "review", "completed", "cancelled"}:
        raise HTTPException(status_code=400, detail="Trạng thái công việc không hợp lệ")

    target_dept = (data.department if data.department is not None else todo['department']) or u_dept
    if new_scope == DEPARTMENT:
        target_dept = canonical_dept_name(target_dept)
        if not can_create_in_scope(user, new_scope, target_dept):
            raise HTTPException(status_code=403, detail="Bạn không có quyền giao việc cho phòng ban này")
    elif u_role != ADMIN and data.assignee_code and data.assignee_code != u_code:
        raise HTTPException(status_code=403, detail="Công việc cá nhân chỉ giao cho chính bạn")

    if data.assignee_code and new_scope == DEPARTMENT:
        emp = _active_employee(data.assignee_code)
        if not emp:
            raise HTTPException(status_code=400, detail="Nhân viên không tồn tại hoặc không còn làm việc")
        if not same_dept(emp.get("department"), target_dept):
            raise HTTPException(status_code=403, detail="Chỉ có thể giao việc cho nhân viên trong phòng ban đã chọn")

    # Nhân viên tạo/sửa việc phòng ban → luôn chờ duyệt; sếp/admin → đã duyệt; cá nhân → đã duyệt
    is_dept_approved = 0 if requires_department_approval(user, new_scope) else 1

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
        params['department'] = target_dept if new_scope == DEPARTMENT else data.department
    elif new_scope == DEPARTMENT and todo['scope'] != DEPARTMENT:
        update_fields.append("department = :department")
        params['department'] = target_dept
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

    if new_scope != todo['scope'] or data.scope is not None:
        update_fields.append("is_dept_approved = :is_dept_approved")
        params['is_dept_approved'] = is_dept_approved

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
    if data.status not in {"todo", "in_progress", "review", "completed", "cancelled"}:
        raise HTTPException(status_code=400, detail="Trạng thái công việc không hợp lệ")
    if not can_change_status(user, dict(todo)):
        raise HTTPException(status_code=403, detail="Bạn không có quyền cập nhật trạng thái công việc này")

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

    if not can_delete(user, dict(todo)):
        raise HTTPException(status_code=403, detail="Bạn không có quyền xóa công việc này")

    execute("DELETE FROM todo_subtasks WHERE todo_id = :todo_id", {"todo_id": todo_id})
    execute("DELETE FROM todos WHERE id = :todo_id", {"todo_id": todo_id})

    events.publish("todo_deleted", {
        "id": todo_id,
        "scope": todo["scope"],
        "department": todo["department"],
        "creator_code": todo["creator_code"],
        "assignee_code": todo["assignee_code"],
        "is_dept_approved": todo["is_dept_approved"],
    })
    return {"status": "success", "message": "Đã xóa công việc"}


@router.patch("/{todo_id}/approve")
def approve_department_todo(
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

    if todo['scope'] != DEPARTMENT:
        raise HTTPException(status_code=400, detail="Chỉ có thể duyệt công việc của phòng ban")
    if not can_approve(user, dict(todo)):
        raise HTTPException(status_code=403, detail="Bạn không có quyền duyệt công việc này")

    # 2. Cập nhật trạng thái
    execute(
        "UPDATE todos SET is_dept_approved = 1, updated_at = CURRENT_TIMESTAMP WHERE id = :todo_id",
        {"todo_id": todo_id}
    )

    # 3. Bắn event realtime (SSE) cho cả phòng ban biết để load lại bảng
    events.publish("todo_updated", {"id": todo_id, "status": todo['status']})

    return {"status": "success", "message": "Đã phê duyệt công việc thành công"}
