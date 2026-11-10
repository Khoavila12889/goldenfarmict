from fastapi import APIRouter, HTTPException
import logging
from sqlalchemy import text
from ..core.db import fetchall, fetchone, execute, insert
from ..core.session import DATABASE_URL, SessionLocal
from ..core.auth import hash_password, verify_token
from datetime import datetime

logger = logging.getLogger(__name__)

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
    now = _NOW()
    result = sess.execute(text("""
        INSERT INTO users (employee_code, password_hash, role, is_first_login, created_at, updated_at)
        VALUES (:code, :pw, :role, TRUE, :now, :now)
        ON CONFLICT (employee_code) DO NOTHING
        RETURNING id
    """), {
        "code": emp_code,
        "pw": hash_password(emp_code),
        "role": "user",
        "now": now,
    })
    return result.first() is not None


_SYNC_LOCK_SQL = """
    UPDATE users
    SET is_locked = EXISTS (
        SELECT 1 FROM employees e
        WHERE e.employee_code = :code AND e.status = 'resigned'
    )
    WHERE employee_code = :code
"""


def _sync_user_lock(sess, emp_code: str) -> None:
    sess.execute(text(_SYNC_LOCK_SQL), {"code": emp_code})


def _sync_user_lock_by_code(emp_code: str) -> None:
    execute(_SYNC_LOCK_SQL, {"code": emp_code})


def _sync_users_id_sequence(sess) -> None:
    """Sửa sequence bị lệch sau restore/import dữ liệu có id tường minh."""
    if not DATABASE_URL.startswith("postgresql"):
        return
    sess.execute(text("""
        SELECT setval(
            pg_get_serial_sequence('users', 'id'),
            COALESCE((SELECT MAX(id) FROM users), 1),
            EXISTS (SELECT 1 FROM users)
        )
    """))


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
            _sync_user_lock(sess, emp_code)
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
        # Sequence có thể thấp hơn MAX(id) sau khi restore DB, dẫn tới users_pkey.
        _sync_users_id_sequence(sess)
        for line_no, emp in deduped_items:
            try:
                # SAVEPOINT tách từng dòng: một dòng lỗi không làm hỏng
                # transaction và biến các dòng sau thành InFailedSqlTransaction.
                with sess.begin_nested():
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

                    user_created = _ensure_user(sess, code, email, phone)
                    _sync_user_lock(sess, code)

                if is_new:
                    stats["created"] += 1
                else:
                    stats["updated"] += 1
                if user_created:
                    stats["users_created"] += 1

            except Exception as e:
                code = emp.get("employee_code", "N/A")
                logger.exception("Import nhân viên thất bại: dòng=%s code=%s", line_no + 1, code)
                stats["errors"].append(f"Dòng {line_no + 1}: {code} — {str(e)}")

        sess.commit()

    logger.info(
        "Import nhân viên hoàn tất: total=%s created=%s updated=%s users_created=%s errors=%s",
        stats["total"], stats["created"], stats["updated"],
        stats["users_created"], len(stats["errors"]),
    )

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
    if "status" in body:
        row = fetchone("SELECT employee_code FROM employees WHERE id = :id", {"id": employee_id})
        if row:
            _sync_user_lock_by_code(row["employee_code"])
    return {"success": True}


def _delete_employee_rows(sess, employee_id: int, emp_code: str, delete_user: bool = True) -> None:
    sess.execute(text("UPDATE tickets SET employee_id = NULL, full_name = '', department = '', employee_code = '' WHERE employee_id = :id"), {"id": employee_id})
    sess.execute(text("UPDATE bookings SET employee_id = NULL, full_name = '', department = '' WHERE employee_id = :id"), {"id": employee_id})
    if emp_code:
        eqs = sess.execute(text("SELECT id FROM equipment WHERE employee_id = :id"), {"id": employee_id}).mappings().all()
        for eq in eqs:
            sess.execute(text("""
                UPDATE equipment_history SET return_date = CURRENT_DATE::text
                WHERE equipment_id = :eqid AND employee_code = :code AND return_date = ''
            """), {"eqid": eq["id"], "code": emp_code})
    sess.execute(text("UPDATE equipment SET employee_id = NULL, issued_date = '', updated_at = CURRENT_TIMESTAMP::text WHERE employee_id = :id"), {"id": employee_id})
    if delete_user and emp_code:
        sess.execute(text("DELETE FROM user_permissions WHERE employee_code = :code"), {"code": emp_code})
        sess.execute(text("UPDATE formula_print_jobs SET requested_by = NULL WHERE requested_by = :code"), {"code": emp_code})
        sess.execute(text("UPDATE formula_print_logs SET printed_by = NULL WHERE printed_by = :code"), {"code": emp_code})
        sess.execute(text("UPDATE formula_recipes SET created_by = NULL WHERE created_by = :code"), {"code": emp_code})
        sess.execute(text("DELETE FROM users WHERE employee_code = :code"), {"code": emp_code})
    sess.execute(text("DELETE FROM employees WHERE id = :id"), {"id": employee_id})


@router.delete("/{employee_id}")
def delete_employee(employee_id: int, admin_code: str = None, token: str = None, role: str = None):
    _check_employee_perm(admin_code, token, role, "employees.delete")
    old = fetchone("SELECT employee_code FROM employees WHERE id = :id", {"id": employee_id})
    if not old:
        raise HTTPException(404, "Không tìm thấy nhân viên")
    with SessionLocal() as sess:
        _delete_employee_rows(sess, employee_id, old["employee_code"], delete_user=True)
        sess.commit()
    return {"success": True}


@router.delete("/bulk/resigned")
def delete_resigned_employees(admin_code: str = None, token: str = None, role: str = None):
    """Xóa toàn bộ nhân viên đã nghỉ việc cùng tài khoản đăng nhập tương ứng."""
    _check_employee_perm(admin_code, token, role, "employees.delete")
    rows = fetchall("SELECT id, employee_code FROM employees WHERE status = 'resigned'")
    if not rows:
        return {"success": True, "deleted": 0, "message": "Không có nhân viên đã nghỉ việc"}

    deleted = 0
    errors = []
    with SessionLocal() as sess:
        for row in rows:
            try:
                with sess.begin_nested():
                    _delete_employee_rows(sess, row["id"], row["employee_code"], delete_user=True)
                deleted += 1
            except Exception as e:
                logger.exception("Xóa nhân viên đã nghỉ thất bại: id=%s code=%s", row["id"], row["employee_code"])
                errors.append(f"{row['employee_code']}: {e}")
        sess.commit()

    return {
        "success": len(errors) == 0,
        "deleted": deleted,
        "failed": len(errors),
        "errors": errors[:10],
        "message": f"Đã xóa {deleted} nhân viên đã nghỉ việc",
    }



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
