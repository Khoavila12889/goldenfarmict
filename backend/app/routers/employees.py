from fastapi import APIRouter, Query
from ..core.db import fetchall, fetchone, execute, insert

router = APIRouter(prefix="/api/employees", tags=["employees"])


@router.get("")
def list_employees(keyword: str = "", department: str = "", status: str = ""):
    params = {}
    sql = """
        SELECT e.*,
               (SELECT COUNT(*) FROM equipment WHERE employee_id = e.id) AS eq_count,
               (SELECT string_agg(product_name || ' (' || license_key || ')', '; ')
                FROM licenses
                WHERE equipment_id IN (SELECT id FROM equipment WHERE employee_id = e.id)) AS license_keys
        FROM employees e WHERE 1=1
    """
    if keyword:
        sql += " AND (e.full_name ILIKE :kw OR e.employee_code ILIKE :kw OR e.department ILIKE :kw OR e.phone ILIKE :kw)"
        params["kw"] = f"%{keyword}%"
    if department and department != "Tất cả":
        sql += " AND e.department = :dept"
        params["dept"] = department
    if status and status != "Tất cả":
        sql += " AND e.status = :status"
        params["status"] = status
    sql += " ORDER BY e.full_name ASC"

    rows = fetchall(sql, params)
    return {"data": rows, "total": len(rows)}


@router.get("/{employee_id}")
def get_employee(employee_id: int):
    row = fetchone("SELECT * FROM employees WHERE id = :id", {"id": employee_id})
    if not row:
        return {"error": "Not found"}
    return row


@router.get("/{employee_id}/equipment")
def get_employee_equipment(employee_id: int):
    eqs = fetchall(
        "SELECT eq.*, (SELECT COUNT(*) FROM licenses WHERE equipment_id = eq.id) AS lic_count "
        "FROM equipment eq WHERE eq.employee_id = :id ORDER BY eq.id ASC",
        {"id": employee_id}
    )
    return {"data": eqs}


@router.post("")
def create_employee(body: dict):
    new_id = insert("""
        INSERT INTO employees (employee_code, full_name, department, position, handover_date, phone, email, notes, status)
        VALUES (:code, :name, :dept, :pos, :handover, :phone, :email, :notes, :status)
    """, {
        "code": body.get("employee_code", ""),
        "name": body.get("full_name", ""),
        "dept": body.get("department", ""),
        "pos": body.get("position", ""),
        "handover": body.get("handover_date", ""),
        "phone": body.get("phone", ""),
        "email": body.get("email", ""),
        "notes": body.get("notes", ""),
        "status": body.get("status", "active"),
    })
    return {"success": True, "id": new_id}


@router.put("/{employee_id}")
def update_employee(employee_id: int, body: dict):
    fields = []
    params = {}
    for col in ["employee_code", "full_name", "department", "position", "handover_date", "phone", "email", "notes", "status"]:
        if col in body:
            fields.append(f"{col} = :{col}")
            params[col] = body[col]
    if not fields:
        return {"success": False, "error": "No fields to update"}
    params["id"] = employee_id
    execute(
        f"UPDATE employees SET {', '.join(fields)}, updated_at = CURRENT_TIMESTAMP WHERE id = :id",
        params
    )
    return {"success": True}


@router.delete("/{employee_id}")
def delete_employee(employee_id: int):
    execute("UPDATE tickets SET employee_id = NULL, full_name = '', department = '', employee_code = '' WHERE employee_id = :id", {"id": employee_id})
    execute("UPDATE bookings SET employee_id = NULL, full_name = '', department = '' WHERE employee_id = :id", {"id": employee_id})
    old = fetchone("SELECT employee_code FROM employees WHERE id = :id", {"id": employee_id})
    if old:
        emp_code = old["employee_code"]
        eqs = fetchall("SELECT id FROM equipment WHERE employee_id = :id", {"id": employee_id})
        for eq in eqs:
            execute("""
                UPDATE equipment_history SET return_date = CURRENT_DATE
                WHERE equipment_id = :eqid AND employee_code = :code AND return_date = ''
            """, {"eqid": eq["id"], "code": emp_code})
    execute("UPDATE equipment SET employee_id = NULL, issued_date = '', updated_at = CURRENT_TIMESTAMP WHERE employee_id = :id", {"id": employee_id})
    execute("DELETE FROM employees WHERE id = :id", {"id": employee_id})
    return {"success": True}


@router.get("/by-code/{code}")
def get_employee_by_code(code: str):
    row = fetchone(
        "SELECT id, full_name, department, employee_code FROM employees WHERE employee_code = :code",
        {"code": code}
    )
    if not row:
        return {"error": "Not found"}
    return row


@router.get("/departments/list")
def list_departments():
    rows = fetchall("""
        SELECT d.name,
               e.full_name AS head_name, e.employee_code AS head_code,
               (SELECT COUNT(*) FROM employees WHERE department = d.name) AS emp_count
        FROM departments d
        LEFT JOIN employees e ON e.id = d.head_id
        ORDER BY d.name
    """)
    return {"data": rows}
