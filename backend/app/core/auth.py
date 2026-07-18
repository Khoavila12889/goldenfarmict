import hashlib
import sqlite3
from .database import get_conn

SESSION_SALT = "goldenfarm_ict_2024"


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()


def make_session_token(user_code: str, role: str) -> str:
    return hashlib.sha256(f"{user_code}:{role}:{SESSION_SALT}".encode()).hexdigest()[:16]


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


def authenticate(employee_code: str, password: str):
    if not employee_code or not password:
        return None

    conn = get_conn()
    row = conn.execute(
        "SELECT password_hash, role FROM users WHERE employee_code=?",
        (employee_code.strip(),)
    ).fetchone()

    if row and row['password_hash'] == hash_password(password):
        # Lấy thông tin department và full_name từ employees table
        emp = conn.execute(
            "SELECT department, full_name FROM employees WHERE employee_code=?",
            (employee_code.strip(),)
        ).fetchone()
        department = emp['department'] if emp else ''
        full_name = emp['full_name'] if emp else employee_code.strip()
        
        conn.close()
        return {
            "employee_code": employee_code.strip(),
            "role": row['role'],
            "department": department,
            "full_name": full_name,
            "token": make_session_token(employee_code.strip(), row['role'])
        }
    conn.close()
    return None


def verify_token(user_code: str, token: str, role: str) -> bool:
    expected = make_session_token(user_code, role)
    return token == expected
