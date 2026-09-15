import hashlib
from typing import Optional, List
from argon2 import PasswordHasher
from .db import fetchone, fetchall, execute

SESSION_SALT = "goldenfarm_ict_2024"

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
    return hashlib.sha256(f"{user_code}:{role}:{SESSION_SALT}".encode()).hexdigest()[:16]


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


def resolve_effective_identity(employee_code: str) -> dict:
    """Role hiệu lực: admin giữ nguyên; người được gán departments.head_id → head."""
    user = fetchone("SELECT role FROM users WHERE employee_code = :code", {"code": employee_code})
    db_role = ((user["role"] if user else None) or "user").strip() or "user"

    emp = fetchone(
        "SELECT full_name, department FROM employees WHERE employee_code = :code",
        {"code": employee_code},
    )
    full_name = emp["full_name"] if emp else employee_code
    emp_dept = canonical_dept_name(emp["department"] if emp else "")
    headed = headed_departments(employee_code)

    role = db_role
    if role != "admin" and headed:
        role = "head"

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
    }


def sync_department_head_role(new_head_id=None, old_head_id=None):
    """Gán trưởng phòng → role=head; bỏ gán và không còn head phòng nào → role=user."""
    def _emp_code(emp_id):
        if not emp_id:
            return None
        row = fetchone("SELECT employee_code FROM employees WHERE id = :id", {"id": emp_id})
        return row["employee_code"] if row else None

    new_code = _emp_code(new_head_id)
    if new_code:
        execute(
            "UPDATE users SET role = 'head' WHERE employee_code = :code AND role = 'user'",
            {"code": new_code},
        )

    if old_head_id and str(old_head_id) != str(new_head_id or ""):
        still = fetchone("SELECT id FROM departments WHERE head_id = :id", {"id": old_head_id})
        if not still:
            old_code = _emp_code(old_head_id)
            if old_code:
                execute(
                    "UPDATE users SET role = 'user' WHERE employee_code = :code AND role = 'head'",
                    {"code": old_code},
                )


def authenticate(login_id: str, password: str):
    if not login_id or not password:
        return None

    employee_code = resolve_login(login_id)
    if not employee_code:
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
    return token == expected


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

    if x_user_token:
        if not verify_token(code, x_user_token, x_user_role or "user"):
            raise HTTPException(status_code=401, detail="Token không hợp lệ")

    user = fetchone(
        "SELECT u.role FROM users u WHERE u.employee_code = :code",
        {"code": code}
    )
    if not user:
        raise HTTPException(status_code=401, detail="Người dùng không tồn tại trong hệ thống")

    return resolve_effective_identity(code)
