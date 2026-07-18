from fastapi import APIRouter, Query
from ..core.database import get_conn

router = APIRouter(prefix="/api/departments", tags=["departments"])


@router.get("")
def list_departments(search: str = ""):
    conn = get_conn()
    sql = """
        SELECT d.*, e.full_name as head_name, e.employee_code as head_code,
               (SELECT COUNT(*) FROM employees WHERE department=d.name) as emp_count
        FROM departments d
        LEFT JOIN employees e ON e.id = d.head_id
        WHERE 1=1
    """
    params = []
    if search:
        sql += " AND d.name LIKE ?"
        params.append(f"%{search}%")
    sql += " ORDER BY d.name ASC"
    rows = [dict(r) for r in conn.execute(sql, params).fetchall()]
    return {"data": rows}


@router.get("/{dept_id}")
def get_department(dept_id: int):
    conn = get_conn()
    row = conn.execute("""
        SELECT d.*, e.full_name as head_name, e.employee_code as head_code
        FROM departments d
        LEFT JOIN employees e ON e.id = d.head_id
        WHERE d.id=?
    """, (dept_id,)).fetchone()
    if not row:
        return {"error": "Not found"}
    return dict(row)


@router.post("")
def create_department(body: dict):
    conn = get_conn()
    name = body.get("name", "").strip()
    if not name:
        return {"success": False, "error": "Tên phòng ban không được để trống"}
    head_id = body.get("head_id")
    description = body.get("description", "").strip()
    try:
        conn.execute(
            "INSERT INTO departments (name, head_id, description) VALUES (?, ?, ?)",
            (name, head_id, description)
        )
        conn.commit()
        return {"success": True, "id": conn.execute("SELECT last_insert_rowid()").fetchone()[0]}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.put("/{dept_id}")
def update_department(dept_id: int, body: dict):
    conn = get_conn()
    fields = []
    params = []
    for key in ("name", "head_id", "description"):
        if key in body:
            fields.append(f"{key}=?")
            params.append(body[key])
    if not fields:
        return {"success": False, "error": "No fields to update"}
    params.append(dept_id)
    try:
        conn.execute(
            f"UPDATE departments SET {', '.join(fields)} WHERE id=?",
            params
        )
        conn.commit()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.delete("/{dept_id}")
def delete_department(dept_id: int):
    conn = get_conn()
    conn.execute("DELETE FROM departments WHERE id=?", (dept_id,))
    conn.commit()
    return {"success": True}
