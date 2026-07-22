"""
Migration script: Import users from oc_users.csv (Nextcloud export)
Run: python -m app.utils.import_oc_users

Reads oc_users.csv from project root, inserts/updates:
  - employees table (employee_code, full_name, department)
  - users table (employee_code, password_hash, role)
"""

import csv
import os
import sqlite3
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from app.core.database import get_conn


def get_role(dept: str, head_codes: set, employee_code: str) -> str:
    if not dept:
        return 'user'
    if dept.strip().lower() == 'admin':
        return 'admin'
    if employee_code in head_codes:
        return 'head'
    return 'user'


def run(csv_path: str = None):
    if csv_path is None:
        csv_path = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'oc_users.csv')

    if not os.path.exists(csv_path):
        print(f'[ERROR] File not found: {csv_path}')
        sys.exit(1)

    conn = get_conn()
    conn.row_factory = sqlite3.Row

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

    with open(csv_path, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    stats = {'new_emp': 0, 'updated_emp': 0, 'new_user': 0, 'updated_user': 0, 'skipped': 0}

    for r in rows:
        uid = (r.get('uid') or '').strip()
        name = (r.get('displayname') or '').strip()
        old_hash = (r.get('password_hash') or '').strip()
        groups = (r.get('groups') or '').strip()

        if not uid or not name or name == 'NULL' or old_hash == 'NULL':
            stats['skipped'] += 1
            continue

        dept = groups.split(';')[0].strip() if groups and groups != 'NULL' else 'Chưa phân phòng'

        # --- employees ---
        emp = conn.execute(
            'SELECT id FROM employees WHERE employee_code=?', (uid,)
        ).fetchone()

        if emp:
            conn.execute(
                'UPDATE employees SET full_name=?, department=? WHERE id=?',
                (name, dept, emp['id'])
            )
            stats['updated_emp'] += 1
        else:
            conn.execute(
                "INSERT INTO employees (employee_code, full_name, department, status) VALUES (?, ?, ?, 'active')",
                (uid, name, dept)
            )
            stats['new_emp'] += 1

        # --- users ---
        user = conn.execute(
            'SELECT id, password_hash FROM users WHERE employee_code=?', (uid,)
        ).fetchone()

        role = get_role(dept, head_codes, uid)

        if user:
            current_hash = user['password_hash'] or ''
            if current_hash == '' or current_hash.startswith('3|$argon2id$') is False:
                conn.execute(
                    'UPDATE users SET password_hash=?, role=? WHERE id=?',
                    (old_hash, role, user['id'])
                )
                stats['updated_user'] += 1
        else:
            conn.execute(
                'INSERT INTO users (employee_code, password_hash, role) VALUES (?, ?, ?)',
                (uid, old_hash, role)
            )
            stats['new_user'] += 1

    conn.commit()
    conn.close()

    print('=== IMPORT COMPLETE ===')
    print(f'  Employees: {stats["new_emp"]} new, {stats["updated_emp"]} updated')
    print(f'  Users:     {stats["new_user"]} new, {stats["updated_user"]} password-updated')
    print(f'  Skipped:   {stats["skipped"]}')
    print(f'  Total CSV rows: {len(rows)}')


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Import users from Nextcloud CSV export')
    parser.add_argument('--csv', '-f', help='Path to oc_users.csv (default: project root)')
    args = parser.parse_args()
    run(csv_path=args.csv)
