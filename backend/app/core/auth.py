import hashlib
import sqlite3
from argon2 import PasswordHasher
from .database import get_conn

SESSION_SALT = "goldenfarm_ict_2024"

_ph = PasswordHasher()


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()


def _is_argon2(stored: str) -> bool:
    return stored.startswith('$argon2id$') or '|$argon2id$' in stored


def _verify_argon2(stored: str, password: str) -> bool:
    hash_str = stored.split('|', 1)[-1] if '|' in stored else stored
    try:
        return _ph.verify(hash_str, password)
    except Exception:
        return False


def verify_stored_password(stored: str, password: str) -> bool:
    if _is_argon2(stored):
        return _verify_argon2(stored, password)
    return stored == hash_password(password)


def rehash_if_argon2(conn, employee_code: str, stored: str, password: str) -> None:
    if not _is_argon2(stored):
        return
    conn.execute(
        "UPDATE users SET password_hash=? WHERE employee_code=?",
        (hash_password(password), employee_code)
    )
    conn.commit()


def make_session_token(user_code: str, role: str) -> str:
    return hashlib.sha256(f"{user_code}:{role}:{SESSION_SALT}".encode()).hexdigest()[:16]


def resolve_login(login_id: str):
    """Resolve employee_code from login_id (supports employee_code or email)"""
    conn = get_conn()
    row = conn.execute(
        "SELECT employee_code FROM users WHERE employee_code=?", (login_id.strip(),)
    ).fetchone()
    if row:
        conn.close()
        return row['employee_code']
    row = conn.execute(
        "SELECT employee_code FROM employees WHERE personal_email=? OR email=?",
        (login_id.strip(), login_id.strip())
    ).fetchone()
    conn.close()
    return row['employee_code'] if row else None


def seed_users(conn):
    existing = conn.execute("SELECT id FROM users WHERE employee_code='admin'").fetchone()
    if not existing:
        conn.execute(
            "INSERT OR IGNORE INTO users (employee_code, password_hash, role) VALUES (?, ?, ?)",
            ('admin', hash_password('admin'), 'admin')
        )

    # Collect head employee codes (from departments.head_id → employees.employee_code)
    head_codes = set()
    try:
        heads = conn.execute("""
            SELECT e.employee_code FROM departments d
            JOIN employees e ON e.id = d.head_id
            WHERE e.employee_code IS NOT NULL AND e.employee_code != ''
        """).fetchall()
        head_codes = {r['employee_code'] for r in heads}
    except sqlite3.OperationalError:
        pass

    emp_rows = conn.execute("SELECT employee_code, department FROM employees WHERE employee_code != ''").fetchall()
    for r in emp_rows:
        code = r['employee_code']
        dept = r['department'] or ''
        if code in head_codes:
            role = 'head'
        elif dept.strip().lower() == 'admin':
            role = 'admin'
        else:
            role = 'user'

        existing_user = conn.execute("SELECT id, role FROM users WHERE employee_code=?", (code,)).fetchone()
        if not existing_user:
            conn.execute(
                "INSERT OR IGNORE INTO users (employee_code, password_hash, role) VALUES (?, ?, ?)",
                (code, hash_password(code), role)
            )
        elif existing_user and existing_user['role'] != role:
            conn.execute("UPDATE users SET role=? WHERE employee_code=?", (role, code))

    conn.commit()


def authenticate(login_id: str, password: str):
    if not login_id or not password:
        return None

    employee_code = resolve_login(login_id)
    if not employee_code:
        return None

    conn = get_conn()
    row = conn.execute(
        "SELECT password_hash, role FROM users WHERE employee_code=?",
        (employee_code,)
    ).fetchone()

    if row and verify_stored_password(row['password_hash'], password):
        rehash_if_argon2(conn, employee_code, row['password_hash'], password)
        emp = conn.execute(
            "SELECT department, full_name FROM employees WHERE employee_code=?",
            (employee_code,)
        ).fetchone()
        department = emp['department'] if emp else ''
        full_name = emp['full_name'] if emp else employee_code
        conn.close()
        return {
            "employee_code": employee_code,
            "role": row['role'],
            "department": department,
            "full_name": full_name,
            "token": make_session_token(employee_code, row['role'])
        }
    conn.close()
    return None


def verify_token(user_code: str, token: str, role: str) -> bool:
    expected = make_session_token(user_code, role)
    return token == expected
