from fastapi import APIRouter, Query
from ..core.database import get_conn

router = APIRouter(prefix="/api/employees", tags=["employees"])


@router.get("")
def list_employees(keyword: str = "", department: str = "", status: str = ""):
    conn = get_conn()
    sql = """
        SELECT e.*,
               (SELECT COUNT(*) FROM equipment WHERE employee_id=e.id) as eq_count,
               (SELECT group_concat(product_name || ' (' || license_key || ')', '; ')
                FROM licenses
                WHERE equipment_id IN (SELECT id FROM equipment WHERE employee_id=e.id)) as license_keys
        FROM employees e WHERE 1=1
    """
    params = []
    if keyword:
        sql += " AND (e.full_name LIKE ? OR e.employee_code LIKE ? OR e.department LIKE ? OR e.phone LIKE ?)"
        kw = f"%{keyword}%"
        params.extend([kw, kw, kw, kw])
    if department and department != "Tất cả":
        sql += " AND e.department = ?"
        params.append(department)
    if status and status != "Tất cả":
        sql += " AND e.status = ?"
        params.append(status)
    sql += " ORDER BY e.full_name ASC"

    rows = [dict(r) for r in conn.execute(sql, params).fetchall()]
    return {"data": rows, "total": len(rows)}


@router.get("/{employee_id}")
def get_employee(employee_id: int):
    conn = get_conn()
    row = conn.execute("SELECT * FROM employees WHERE id=?", (employee_id,)).fetchone()
    if not row:
        return {"error": "Not found"}
    return dict(row)


@router.get("/{employee_id}/equipment")
def get_employee_equipment(employee_id: int):
    conn = get_conn()
    eqs = [dict(r) for r in conn.execute(
        "SELECT eq.*, (SELECT COUNT(*) FROM licenses WHERE equipment_id=eq.id) as lic_count "
        "FROM equipment eq WHERE eq.employee_id=? ORDER BY eq.id ASC",
        (employee_id,)
    ).fetchall()]
    return {"data": eqs}


@router.post("")
def create_employee(body: dict):
    conn = get_conn()
    conn.execute(
        "INSERT INTO employees (employee_code, full_name, department, position, handover_date, phone, email, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            body.get("employee_code", ""),
            body.get("full_name", ""),
            body.get("department", ""),
            body.get("position", ""),
            body.get("handover_date", ""),
            body.get("phone", ""),
            body.get("email", ""),
            body.get("notes", ""),
            body.get("status", "active"),
        ),
    )
    conn.commit()
    return {"success": True, "id": conn.execute("SELECT last_insert_rowid()").fetchone()[0]}


@router.put("/{employee_id}")
def update_employee(employee_id: int, body: dict):
    conn = get_conn()
    fields = []
    params = []
    for col in ["employee_code", "full_name", "department", "position", "handover_date", "phone", "email", "notes", "status"]:
        if col in body:
            fields.append(f"{col}=?")
            params.append(body[col])
    if not fields:
        return {"success": False, "error": "No fields to update"}
    params.append(employee_id)
    conn.execute(
        f"UPDATE employees SET {', '.join(fields)}, updated_at=datetime('now','localtime') WHERE id=?",
        params,
    )
    conn.commit()
    return {"success": True}


@router.delete("/{employee_id}")
def delete_employee(employee_id: int):
    conn = get_conn()
    conn.execute("UPDATE tickets SET employee_id=NULL, full_name='', department='', employee_code='' WHERE employee_id=?", (employee_id,))
    conn.execute("UPDATE bookings SET employee_id=NULL, full_name='', department='' WHERE employee_id=?", (employee_id,))
    # Revoke equipment back to storage instead of deleting
    old = conn.execute("SELECT employee_code FROM employees WHERE id=?", (employee_id,)).fetchone()
    if old:
        emp_code = old["employee_code"]
        for eq in conn.execute("SELECT id FROM equipment WHERE employee_id=?", (employee_id,)).fetchall():
            conn.execute(
                "UPDATE equipment_history SET return_date=date('now','localtime') "
                "WHERE equipment_id=? AND employee_code=? AND return_date=''",
                (eq["id"], emp_code)
            )
    conn.execute("UPDATE equipment SET employee_id=NULL, issued_date='', updated_at=datetime('now','localtime') WHERE employee_id=?", (employee_id,))
    conn.execute("DELETE FROM employees WHERE id=?", (employee_id,))
    conn.commit()
    return {"success": True}


@router.get("/by-code/{code}")
def get_employee_by_code(code: str):
    conn = get_conn()
    row = conn.execute(
        "SELECT id, full_name, department, employee_code FROM employees WHERE employee_code=?",
        (code,)
    ).fetchone()
    if not row:
        return {"error": "Not found"}
    return dict(row)


@router.get("/departments/list")
def list_departments():
    conn = get_conn()
    rows = conn.execute("""
        SELECT d.name,
               e.full_name as head_name, e.employee_code as head_code,
               (SELECT COUNT(*) FROM employees WHERE department=d.name) as emp_count
        FROM departments d
        LEFT JOIN employees e ON e.id = d.head_id
        ORDER BY d.name
    """).fetchall()
    return {"data": [dict(r) for r in rows]}
