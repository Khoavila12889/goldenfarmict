import hashlib
from argon2 import PasswordHasher
from .db import fetchone, execute

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
    user = fetchone("SELECT employee_code FROM users WHERE employee_code = :code", {"code": code})
    if user:
        return user["employee_code"]
    emp = fetchone(
        "SELECT employee_code FROM employees WHERE personal_email = :email OR email = :email",
        {"email": code}
    )
    return emp["employee_code"] if emp else None


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
        emp = fetchone(
            "SELECT department, full_name FROM employees WHERE employee_code = :code",
            {"code": employee_code}
        )
        department = emp["department"] if emp else ""
        full_name = emp["full_name"] if emp else employee_code
        return {
            "employee_code": employee_code,
            "role": row["role"],
            "department": department,
            "full_name": full_name,
            "token": make_session_token(employee_code, row["role"]),
        }
    return None


def verify_token(user_code: str, token: str, role: str) -> bool:
    expected = make_session_token(user_code, role)
    return token == expected


from typing import Optional
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

    emp = fetchone(
        "SELECT e.full_name, e.department FROM employees e WHERE e.employee_code = :code",
        {"code": code}
    )
    full_name = emp['full_name'] if emp else code
    emp_dept = emp['department'] if emp else ""

    dept_entry = fetchone(
        "SELECT name FROM departments WHERE LOWER(name) = LOWER(:emp_dept)",
        {"emp_dept": emp_dept}
    )
    resolved_dept = dept_entry['name'] if dept_entry else emp_dept

    return {
        "user_code": code,
        "user_role": user['role'],
        "department": resolved_dept,
        "full_name": full_name
    }
