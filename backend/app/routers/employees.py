from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from ..core.db import fetchall, fetchone, execute, insert
from ..core.session import DATABASE_URL, SessionLocal
from ..core.auth import hash_password, verify_token
from datetime import datetime

_STR_AGG = "string_agg" if DATABASE_URL.startswith("postgresql") else "group_concat"

router = APIRouter(prefix="/api/employees", tags=["employees"])

_NOW = lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _normalize_code(code: str) -> str:
    """Chuẩn hóa mã NV: strip whitespace, bỏ suffix .0 (do Excel/pandas float)."""
    c = code.strip()
    if c.endswith('.0'):
        c = c[:-2]
    return c


def _check_employee_perm(employee_code: str, token: str, role: str, required_module: str):
    """Kiểm tra quyền trên module nhân viên.
    Admin/Head luôn có quyền. User thường cần can_edit trên module tương ứng.
    required_module: 'employees' (add/edit), 'employees.import', 'employees.delete'
    """
    if not employee_code or not token:
        raise HTTPException(status_code=401, detail="Thiếu thông tin xác thực")
    if not verify_token(employee_code, token, role):
        raise HTTPException(status_code=401, detail="Token không hợp lệ")
    if role in ("admin", "head"):
        return
    # Check permission từ DB
    from ..routers.auth import _get_effective_permissions
    perms = _get_effective_permissions(employee_code)
    mod_perm = perms.get(required_module, {})
    if not mod_perm.get("can_edit"):
        # Fallback: employees.can_edit cho phép add/edit/delete (tương thích ngược)
        if required_module in ("employees.import", "employees.delete"):
            base_perm = perms.get("employees", {})
            if base_perm.get("can_edit"):
                return
        raise HTTPException(status_code=403, detail=f"Không có quyền {required_module}")


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
def create_employee(body: dict, admin_code: str = None, token: str = None, role: str = None):
    _check_employee_perm(admin_code, token, role, "employees")
    now = _NOW()
    emp_code = _normalize_code(body.get("employee_code", ""))
    if not emp_code:
        raise HTTPException(400, "Mã nhân viên không được để trống")
    with SessionLocal() as sess:
        try:
            result = sess.execute(text("""
                INSERT INTO employees (employee_code, full_name, department, position, handover_date, start_date, phone, email, notes, status, created_at, updated_at)
                VALUES (:code, :name, :dept, :pos, :handover, :start_date, :phone, :email, :notes, :status, :now, :now)
                ON CONFLICT (employee_code) DO UPDATE SET
                    full_name=:name, department=:dept, position=:pos,
                    handover_date=:handover, start_date=:start_date, phone=:phone, email=:email,
                    notes=:notes, status=:status, updated_at=:now
                RETURNING id, xmax = 0 AS inserted
            """), {
                "code": emp_code,
                "name": body.get("full_name", ""),
                "dept": body.get("department", ""),
                "pos": body.get("position", ""),
                "handover": body.get("handover_date", ""),
                "start_date": body.get("start_date", ""),
                "phone": body.get("phone", ""),
                "email": body.get("email", ""),
                "notes": body.get("notes", ""),
                "status": body.get("status", "active"),
                "now": now,
            })
            row = result.mappings().first()
            new_id = row["id"]
            user_created = _ensure_user(sess, emp_code, body.get("email", ""), body.get("phone", ""))
            sess.commit()
            return {"success": True, "id": new_id, "user_created": user_created}
        except Exception:
            sess.rollback()
            raise


@router.post("/import")
def import_employees(body: dict, admin_code: str = None, token: str = None, role: str = None):
    _check_employee_perm(admin_code, token, role, "employees.import")
    items = body.get("employees", [])
    if not items:
        raise HTTPException(400, "No employees data provided")

    stats = {
        "total": len(items),
        "created": 0,
        "updated": 0,
        "skipped": 0,
        "duplicates_in_file": 0,
        "users_created": 0,
        "errors": [],
    }
    now = _NOW()

    # Deduplicate trong file import: giữ dòng cuối cùng cho mỗi mã NV
    seen_codes = {}
    for i, emp in enumerate(items):
        code = _normalize_code(emp.get("employee_code", ""))
        if not code:
            stats["errors"].append(f"Dòng {i + 1}: thiếu mã nhân viên")
            continue
        emp["employee_code"] = code
        if code in seen_codes:
            stats["duplicates_in_file"] += 1
        seen_codes[code] = (i, emp)

    deduped_items = list(seen_codes.values())

    with SessionLocal() as sess:
        for line_no, emp in deduped_items:
            try:
                code = emp.get("employee_code", "").strip()
                full_name = emp.get("full_name", "").strip()
                department = emp.get("department", "").strip()
                position = emp.get("position", "").strip() or "Nhân viên"
                status = emp.get("status", "").strip() or "active"
                phone = emp.get("phone", "").strip()
                email = emp.get("email", "").strip()
                handover_date = emp.get("handover_date", "").strip()
                start_date = emp.get("start_date", "").strip()
                notes = emp.get("notes", "").strip()

                # Upsert bằng ON CONFLICT
                result = sess.execute(text("""
                    INSERT INTO employees (employee_code, full_name, department, position, handover_date, start_date, phone, email, notes, status, created_at, updated_at)
                    VALUES (:code, :name, :dept, :pos, :handover, :start_date, :phone, :email, :notes, :status, :now, :now)
                    ON CONFLICT (employee_code) DO UPDATE SET
                        full_name=:name, department=:dept, position=:pos,
                        handover_date=:handover, start_date=:start_date, phone=:phone, email=:email,
                        notes=:notes, status=:status, updated_at=:now
                    RETURNING xmax = 0 AS inserted
                """), {
                    "code": code, "name": full_name, "dept": department, "pos": position,
                    "handover": handover_date, "start_date": start_date, "phone": phone, "email": email,
                    "notes": notes, "status": status, "now": now,
                })
                is_new = result.scalar()
                if is_new:
                    stats["created"] += 1
                else:
                    stats["updated"] += 1

                if _ensure_user(sess, code, email, phone):
                    stats["users_created"] += 1

            except Exception as e:
                stats["errors"].append(f"Dòng {line_no + 1}: {emp.get('employee_code', 'N/A')} — {str(e)}")

        sess.commit()

    return stats


@router.put("/{employee_id}")
def update_employee(employee_id: int, body: dict, admin_code: str = None, token: str = None, role: str = None):
    _check_employee_perm(admin_code, token, role, "employees")
    fields = []
    params = {}
    for col in ["employee_code", "full_name", "department", "position", "handover_date", "start_date", "phone", "email", "notes", "status"]:
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
def delete_employee(employee_id: int, admin_code: str = None, token: str = None, role: str = None):
    _check_employee_perm(admin_code, token, role, "employees.delete")
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


@router.post("/deduplicate")
def deduplicate_employees(admin_code: str = None, token: str = None, role: str = None):
    """Tìm và xóa các bản ghi nhân viên trùng employee_code.
    Giữ lại bản ghi có id nhỏ nhất, cập nhật references sang bảng khác.
    """
    _check_employee_perm(admin_code, token, role, "employees")
    dupes = fetchall("""
        SELECT employee_code, COUNT(*) - 1 AS extra_count
        FROM employees
        WHERE employee_code IS NOT NULL AND employee_code != ''
        GROUP BY employee_code
        HAVING COUNT(*) > 1
    """)

    if not dupes:
        return {"success": True, "duplicates_found": 0, "removed": 0, "message": "Không có nhân viên trùng"}

    total_removed = 0
    with SessionLocal() as sess:
        for d in dupes:
            code = d["employee_code"]
            # Lấy tất cả id theo employee_code, giữ lại id nhỏ nhất
            rows = sess.execute(text(
                "SELECT id FROM employees WHERE employee_code = :code ORDER BY id"
            ), {"code": code}).fetchall()
            keep_id = rows[0][0]
            remove_ids = [r[0] for r in rows[1:]]

            # Cập nhật references
            sess.execute(text("UPDATE equipment SET employee_id = :keep WHERE employee_id = ANY(:remove)"),
                         {"keep": keep_id, "remove": remove_ids})
            sess.execute(text("UPDATE tickets SET employee_id = :keep WHERE employee_id = ANY(:remove)"),
                         {"keep": keep_id, "remove": remove_ids})
            sess.execute(text("UPDATE bookings SET employee_id = :keep WHERE employee_id = ANY(:remove)"),
                         {"keep": keep_id, "remove": remove_ids})
            sess.execute(text("DELETE FROM employees WHERE id = ANY(:remove)"),
                         {"remove": remove_ids})
            total_removed += len(remove_ids)

        sess.commit()

    return {"success": True, "duplicates_found": len(dupes), "removed": total_removed,
            "message": f"Đã xóa {total_removed} bản ghi trùng"}
