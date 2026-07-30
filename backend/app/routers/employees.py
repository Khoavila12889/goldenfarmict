from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from ..core.db import fetchall, fetchone, execute, insert
from ..core.session import DATABASE_URL, SessionLocal
from ..core.auth import hash_password
from datetime import datetime

_STR_AGG = "string_agg" if DATABASE_URL.startswith("postgresql") else "group_concat"

router = APIRouter(prefix="/api/employees", tags=["employees"])

_NOW = lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _ensure_user(sess, emp_code: str, email: str = "", phone: str = "") -> bool:
    existing = sess.execute(
        text("SELECT id FROM users WHERE employee_code = :code"),
        {"code": emp_code}
    ).first()
    if existing:
        return False
    now = _NOW()
    sess.execute(text("""
        INSERT INTO users (employee_code, password_hash, role, is_first_login, created_at, updated_at)
        VALUES (:code, :pw, :role, TRUE, :now, :now)
    """), {
        "code": emp_code,
        "pw": hash_password(emp_code),
        "role": "user",
        "now": now,
    })
    return True


@router.get("")
def list_employees(keyword: str = "", department: str = "", status: str = ""):
    params = {}
    sql = f"""
        SELECT e.*,
               (SELECT COUNT(*) FROM equipment WHERE employee_id = e.id) AS eq_count,
               (SELECT {_STR_AGG}(product_name || ' (' || license_key || ')', '; ')
                FROM licenses
                WHERE equipment_id IN (SELECT id FROM equipment WHERE employee_id = e.id)) AS license_keys
        FROM employees e WHERE 1=1
    """
    if keyword:
        sql += " AND (LOWER(e.full_name) LIKE LOWER(:kw) OR LOWER(e.employee_code) LIKE LOWER(:kw) OR LOWER(e.department) LIKE LOWER(:kw) OR LOWER(e.phone) LIKE LOWER(:kw))"
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
    now = _NOW()
    emp_code = body.get("employee_code", "").strip()
    with SessionLocal() as sess:
        try:
            result = sess.execute(text("""
                INSERT INTO employees (employee_code, full_name, department, position, handover_date, phone, email, notes, status, created_at, updated_at)
                VALUES (:code, :name, :dept, :pos, :handover, :phone, :email, :notes, :status, :now, :now)
                RETURNING id
            """), {
                "code": emp_code,
                "name": body.get("full_name", ""),
                "dept": body.get("department", ""),
                "pos": body.get("position", ""),
                "handover": body.get("handover_date", ""),
                "phone": body.get("phone", ""),
                "email": body.get("email", ""),
                "notes": body.get("notes", ""),
                "status": body.get("status", "active"),
                "now": now,
            })
            new_id = result.scalar()
            user_created = _ensure_user(sess, emp_code, body.get("email", ""), body.get("phone", ""))
            sess.commit()
            return {"success": True, "id": new_id, "user_created": user_created}
        except Exception:
            sess.rollback()
            raise


@router.post("/import")
def import_employees(body: dict):
    items = body.get("employees", [])
    if not items:
        raise HTTPException(400, "No employees data provided")

    stats = {
        "total": len(items),
        "created": 0,
        "updated": 0,
        "skipped": 0,
        "users_created": 0,
        "errors": [],
    }
    now = _NOW()

    with SessionLocal() as sess:
        for i, emp in enumerate(items):
            line_no = i + 1
            try:
                code = emp.get("employee_code", "").strip()
                if not code:
                    stats["errors"].append(f"Dòng {line_no}: thiếu mã nhân viên")
                    continue

                full_name = emp.get("full_name", "").strip()
                department = emp.get("department", "").strip()
                position = emp.get("position", "").strip() or "Nhân viên"
                status = emp.get("status", "").strip() or "active"
                phone = emp.get("phone", "").strip()
                email = emp.get("email", "").strip()
                handover_date = emp.get("handover_date", "").strip()
                notes = emp.get("notes", "").strip()

                existing = sess.execute(
                    text("SELECT id FROM employees WHERE employee_code = :code"),
                    {"code": code}
                ).first()

                if existing:
                    sess.execute(text("""
                        UPDATE employees SET full_name=:name, department=:dept, position=:pos,
                            handover_date=:handover, phone=:phone, email=:email, notes=:notes, status=:status,
                            updated_at=:now
                        WHERE id=:id
                    """), {
                        "id": existing[0], "name": full_name, "dept": department, "pos": position,
                        "handover": handover_date, "phone": phone, "email": email,
                        "notes": notes, "status": status, "now": now,
                    })
                    stats["updated"] += 1
                else:
                    sess.execute(text("""
                        INSERT INTO employees (employee_code, full_name, department, position, handover_date, phone, email, notes, status, created_at, updated_at)
                        VALUES (:code, :name, :dept, :pos, :handover, :phone, :email, :notes, :status, :now, :now)
                    """), {
                        "code": code, "name": full_name, "dept": department, "pos": position,
                        "handover": handover_date, "phone": phone, "email": email,
                        "notes": notes, "status": status, "now": now,
                    })
                    stats["created"] += 1

                if _ensure_user(sess, code, email, phone):
                    stats["users_created"] += 1

            except Exception as e:
                stats["errors"].append(f"Dòng {line_no}: {emp.get('employee_code', 'N/A')} — {str(e)}")

        sess.commit()

    return stats


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
        f"UPDATE employees SET {', '.join(fields)}, updated_at = CURRENT_TIMESTAMP::text WHERE id = :id",
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
                UPDATE equipment_history SET return_date = CURRENT_DATE::text
                WHERE equipment_id = :eqid AND employee_code = :code AND return_date = ''
            """, {"eqid": eq["id"], "code": emp_code})
    execute("UPDATE equipment SET employee_id = NULL, issued_date = '', updated_at = CURRENT_TIMESTAMP::text WHERE employee_id = :id", {"id": employee_id})
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
