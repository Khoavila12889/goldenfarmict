from fastapi import APIRouter, Query
from ..core.db import fetchall, fetchone, execute, insert
from ..core.auth import sync_department_head_role, sync_department_deputy_role

router = APIRouter(prefix="/api/departments", tags=["departments"])


@router.get("")
def list_departments(search: str = ""):
    sql = """
        SELECT d.*, e.full_name as head_name, e.employee_code as head_code,
               dep.full_name as deputy_name, dep.employee_code as deputy_code,
               (SELECT COUNT(*) FROM employees WHERE department=d.name) as emp_count
        FROM departments d
        LEFT JOIN employees e ON e.id = d.head_id
        LEFT JOIN employees dep ON dep.id = d.deputy_id
        WHERE 1=1
    """
    params = {}
    if search:
        sql += " AND LOWER(d.name) LIKE LOWER(:search)"
        params["search"] = f"%{search}%"
    sql += " ORDER BY d.name ASC"
    rows = fetchall(sql, params)
    return {"data": rows}


@router.get("/{dept_id}")
def get_department(dept_id: int):
    row = fetchone("""
        SELECT d.*, e.full_name as head_name, e.employee_code as head_code,
               dep.full_name as deputy_name, dep.employee_code as deputy_code
        FROM departments d
        LEFT JOIN employees e ON e.id = d.head_id
        LEFT JOIN employees dep ON dep.id = d.deputy_id
        WHERE d.id=:dept_id
    """, {"dept_id": dept_id})
    if not row:
        return {"error": "Not found"}
    return row


@router.post("")
def create_department(body: dict):
    name = body.get("name", "").strip()
    if not name:
        return {"success": False, "error": "Tên phòng ban không được để trống"}
    head_id = body.get("head_id") or None
    deputy_id = body.get("deputy_id") or None
    description = body.get("description", "").strip()
    try:
        new_id = insert(
            "INSERT INTO departments (name, head_id, deputy_id, description) VALUES (:name, :head_id, :deputy_id, :description) RETURNING id",
            {"name": name, "head_id": head_id, "deputy_id": deputy_id, "description": description}
        )
        sync_department_head_role(new_head_id=head_id)
        sync_department_deputy_role(new_deputy_id=deputy_id)
        return {"success": True, "id": new_id}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.put("/{dept_id}")
def update_department(dept_id: int, body: dict):
    current = fetchone("SELECT head_id, deputy_id FROM departments WHERE id=:dept_id", {"dept_id": dept_id})
    old_head_id = current["head_id"] if current else None
    old_deputy_id = current["deputy_id"] if current else None
    fields = []
    params = {}
    for key in ("name", "head_id", "deputy_id", "description"):
        if key in body:
            val = body[key]
            if key in ("head_id", "deputy_id") and not val:
                val = None
            fields.append(f"{key}=:{key}")
            params[key] = val
    if not fields:
        return {"success": False, "error": "No fields to update"}
    params["dept_id"] = dept_id
    try:
        execute(f"UPDATE departments SET {', '.join(fields)} WHERE id=:dept_id", params)
        if "head_id" in body:
            sync_department_head_role(new_head_id=params.get("head_id"), old_head_id=old_head_id)
        if "deputy_id" in body:
            sync_department_deputy_role(new_deputy_id=params.get("deputy_id"), old_deputy_id=old_deputy_id)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.delete("/{dept_id}")
def delete_department(dept_id: int):
    current = fetchone("SELECT head_id, deputy_id FROM departments WHERE id=:dept_id", {"dept_id": dept_id})
    execute("DELETE FROM departments WHERE id=:dept_id", {"dept_id": dept_id})
    if current and current.get("head_id"):
        sync_department_head_role(new_head_id=None, old_head_id=current["head_id"])
    if current and current.get("deputy_id"):
        sync_department_deputy_role(new_deputy_id=None, old_deputy_id=current["deputy_id"])
    return {"success": True}
