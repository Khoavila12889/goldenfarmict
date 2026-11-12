import hashlib
import hmac
import os
from typing import Optional, List
from argon2 import PasswordHasher
from .db import fetchone, fetchall, execute

def _session_secret() -> str:
    # Keep old deployments working while allowing a dedicated secret to be set.
    secret = os.getenv("SESSION_SECRET") or os.getenv("ONLYOFFICE_SECRET")
    if not secret:
        raise RuntimeError("SESSION_SECRET must be configured")
    return secret

_ph = PasswordHasher()


def hash_password(password: str) -> str:
    return _ph.hash(password)


def _hash_sha256(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def _is_argon2(stored: str) -> bool:
    return stored.startswith("$argon2id$") or "|$argon2id$" in stored


def _verify_argon2(stored: str, password: str) -> bool:
    hash_str = stored.split("|", 1)[-1] if "|" in stored else stored
    try:
        return _ph.verify(hash_str, password)
    except Exception:
        return False


def verify_stored_password(stored: str, password: str) -> bool:
    if _is_argon2(stored):
        return _verify_argon2(stored, password)
    return stored == _hash_sha256(password)


def rehash_if_argon2(user_code: str, stored: str, password: str) -> None:
    if _is_argon2(stored):
        return
    execute(
        "UPDATE users SET password_hash = :pw WHERE employee_code = :code",
        {"pw": hash_password(password), "code": user_code}
    )


def make_session_token(user_code: str, role: str) -> str:
    message = f"{user_code}:{role}".encode("utf-8")
    return hmac.new(_session_secret().encode("utf-8"), message, hashlib.sha256).hexdigest()


def resolve_login(login_id: str):
    code = login_id.strip()
    user = fetchone(
        "SELECT employee_code FROM users WHERE employee_code = :code OR username = :code",
        {"code": code}
    )
    if user:
        return user["employee_code"]
    emp = fetchone(
        "SELECT employee_code FROM employees WHERE personal_email = :email OR email = :email",
        {"email": code}
    )
    return emp["employee_code"] if emp else None


def same_dept(a: Optional[str], b: Optional[str]) -> bool:
    return bool(a) and bool(b) and str(a).strip().lower() == str(b).strip().lower()


def canonical_dept_name(name: Optional[str]) -> str:
    name = (name or "").strip()
    if not name:
        return ""
    row = fetchone(
        "SELECT name FROM departments WHERE LOWER(TRIM(name)) = LOWER(TRIM(:name))",
        {"name": name},
    )
    return row["name"] if row else name


def headed_departments(employee_code: str) -> List[str]:
    if not employee_code:
        return []
    rows = fetchall(
        """
        SELECT d.name
        FROM departments d
        JOIN employees e ON e.id = d.head_id
        WHERE e.employee_code = :code
        ORDER BY d.name
        """,
        {"code": employee_code},
    )
    return [r["name"] for r in rows if r.get("name")]


def deputy_departments(employee_code: str) -> List[str]:
    if not employee_code:
        return []
    rows = fetchall(
        """
        SELECT d.name
        FROM departments d
        JOIN employees e ON e.id = d.deputy_id
        WHERE e.employee_code = :code
        ORDER BY d.name
        """,
        {"code": employee_code},
    )
    return [r["name"] for r in rows if r.get("name")]


def resolve_effective_identity(employee_code: str) -> dict:
    """Role hiệu lực: admin giữ nguyên; departments.head_id → head; departments.deputy_id → deputy."""
    user = fetchone("SELECT role FROM users WHERE employee_code = :code", {"code": employee_code})
    db_role = ((user["role"] if user else None) or "user").strip() or "user"

    emp = fetchone(
        "SELECT full_name, department FROM employees WHERE employee_code = :code",
        {"code": employee_code},
    )
    full_name = emp["full_name"] if emp else employee_code
    emp_dept = canonical_dept_name(emp["department"] if emp else "")
    headed = headed_departments(employee_code)
    deputized = deputy_departments(employee_code)

    role = db_role
    if role != "admin" and headed:
        role = "head"
    elif role != "admin" and role not in ("head", "deputy") and deputized:
        role = "deputy"

    department = emp_dept
    if headed:
        match = next((d for d in headed if same_dept(d, emp_dept)), None)
        department = match or headed[0]

    return {
        "user_code": employee_code,
        "user_role": role,
        "department": department,
        "full_name": full_name,
        "headed_departments": headed,
        "deputy_departments": deputized,
    }


def _employee_code_for_id(emp_id):
    if not emp_id:
        return None
    row = fetchone("SELECT employee_code FROM employees WHERE id = :id", {"id": emp_id})
    return row["employee_code"] if row else None


def _resync_user_role(employee_code):
    """Vai trò là chuẩn suy ra từ bảng departments: head_id của phòng nào →
    head; deputy_id → deputy; không còn gán ở đâu → user. Admin không đổi.
    Chỉ gọi cho người vừa được gán/gỡ ở trang Phòng ban."""
    if not employee_code:
        return
    row = fetchone("SELECT role FROM users WHERE employee_code = :code", {"code": employee_code})
    if not row:
        return
    current = ((row["role"] or "user").strip() or "user")
    if current == "admin":
        return
    if headed_departments(employee_code):
        target = "head"
    elif deputy_departments(employee_code):
        target = "deputy"
    else:
        target = "user"
    if target != current:
        execute(
            "UPDATE users SET role = :role WHERE employee_code = :code",
            {"role": target, "code": employee_code},
        )


def sync_department_head_role(new_head_id=None, old_head_id=None):
    """Đồng bộ users.role sau khi gán/gỡ trưởng phòng ở trang Phòng ban."""
    for emp_id in {new_head_id, old_head_id}:
        _resync_user_role(_employee_code_for_id(emp_id))


def sync_department_deputy_role(new_deputy_id=None, old_deputy_id=None):
    """Đồng bộ users.role sau khi gán/gỡ phó phòng ở trang Phòng ban."""
    for emp_id in {new_deputy_id, old_deputy_id}:
        _resync_user_role(_employee_code_for_id(emp_id))


def is_isolated(employee_code: str) -> bool:
    """Tài khoản bị cách ly: đã khóa hoặc nhân viên đang ở trạng thái nghỉ việc."""
    code = (employee_code or "").strip()
    if not code:
        return False
    try:
        row = fetchone(
            """
            SELECT u.is_locked, e.status
            FROM users u
            LEFT JOIN employees e ON e.employee_code = u.employee_code
            WHERE u.employee_code = :code
            """,
            {"code": code},
        )
        if row:
            if row.get("is_locked"):
                return True
            return (row.get("status") or "").strip().lower() == "resigned"
        emp = fetchone(
            "SELECT status FROM employees WHERE employee_code = :code",
            {"code": code},
        )
        return bool(emp and (emp.get("status") or "").strip().lower() == "resigned")
    except Exception:
        return False


def authenticate(login_id: str, password: str):
    if not login_id or not password:
        return None

    employee_code = resolve_login(login_id)
    if not employee_code:
        return None

    if is_isolated(employee_code):
        return None

    row = fetchone(
        "SELECT password_hash, role FROM users WHERE employee_code = :code",
        {"code": employee_code}
    )

    if row and verify_stored_password(row["password_hash"], password):
        rehash_if_argon2(employee_code, row["password_hash"], password)
        identity = resolve_effective_identity(employee_code)
        return {
            "employee_code": employee_code,
            "role": identity["user_role"],
            "department": identity["department"],
            "full_name": identity["full_name"],
            "token": make_session_token(employee_code, identity["user_role"]),
        }
    return None


def verify_token(user_code: str, token: str, role: str) -> bool:
    expected = make_session_token(user_code, role)
    if not hmac.compare_digest(token or "", expected):
        return False
    # Cách ly: token cũ của tài khoản đã nghỉ việc / bị khóa không còn hiệu lực.
    return not is_isolated(user_code)


from fastapi import HTTPException


def verify_session(
    x_user_code: Optional[str],
    x_user_role: Optional[str],
    x_user_dept: Optional[str],
    x_user_token: Optional[str] = None
) -> dict:
    code = (x_user_code or "").strip()
    if not code:
        raise HTTPException(status_code=401, detail="Thiếu thông tin người dùng")

    if not x_user_token or not verify_token(code, x_user_token, x_user_role or "user"):
        raise HTTPException(status_code=401, detail="Token không hợp lệ")

    user = fetchone(
        "SELECT u.role FROM users u WHERE u.employee_code = :code",
        {"code": code}
    )
    if not user:
        raise HTTPException(status_code=401, detail="Người dùng không tồn tại trong hệ thống")

    return resolve_effective_identity(code)
