import os
import re
import sqlite3
from pathlib import Path

_PROJECT_ROOT = Path(__file__).parent.parent.parent.parent

try:
    from dotenv import load_dotenv
    _dotenv = _PROJECT_ROOT / '.env'
    if _dotenv.exists():
        load_dotenv(str(_dotenv))
except Exception:
    pass
_BASE_DIR = str(_PROJECT_ROOT / 'backend')

_DATABASE_URL = os.environ.get('DATABASE_URL', '')
if _DATABASE_URL:
    m = re.match(r'sqlite:///(.+)', _DATABASE_URL)
    DB_FILE = str(_PROJECT_ROOT / m.group(1)) if m else _DATABASE_URL
else:
    DB_DIR = os.environ.get('DB_DIR') or _BASE_DIR
    DB_FILE = os.path.join(DB_DIR, 'company.db')


def get_conn():
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = sqlite3.connect(DB_FILE)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")
    conn.row_factory = sqlite3.Row

    conn.executescript("""
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL DEFAULT '',
            department TEXT DEFAULT '',
            position TEXT DEFAULT '',
            handover_date TEXT DEFAULT '',
            phone TEXT DEFAULT '',
            email TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            status TEXT DEFAULT 'active',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS equipment (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER,
            equipment_type TEXT DEFAULT '',
            specs TEXT DEFAULT '',
            os_info TEXT DEFAULT '',
            serial_number TEXT DEFAULT '',
            asset_code TEXT DEFAULT '',
            status TEXT DEFAULT '',
            description TEXT DEFAULT '',
            license_key TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            lifecycle_status TEXT DEFAULT '',
            purchase_date TEXT DEFAULT '',
            purchase_cost TEXT DEFAULT '',
            issued_date TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS licenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            equipment_id INTEGER NOT NULL,
            license_key TEXT NOT NULL DEFAULT '',
            product_name TEXT DEFAULT '',
            activated TEXT DEFAULT '',
            expiry_date TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS equipment_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            equipment_id INTEGER NOT NULL,
            employee_code TEXT NOT NULL,
            employee_name TEXT DEFAULT '',
            handover_date TEXT DEFAULT '',
            return_date TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            old_status TEXT DEFAULT '',
            new_status TEXT DEFAULT '',
            changed_by TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER,
            full_name TEXT DEFAULT '',
            department TEXT DEFAULT '',
            title TEXT NOT NULL DEFAULT '',
            description TEXT DEFAULT '',
            priority TEXT DEFAULT 'Binh thuong',
            status TEXT DEFAULT 'Cho xu ly',
            resolution TEXT DEFAULT '',
            admin_notes TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_code TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            created_at TEXT DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS resources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL DEFAULT 'car',
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS workflow_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            icon TEXT DEFAULT 'FileCheck',
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS workflow_steps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id INTEGER NOT NULL,
            step_order INTEGER NOT NULL,
            approver_type TEXT NOT NULL DEFAULT 'role',
            approver_value TEXT DEFAULT '',
            department_match INTEGER DEFAULT 1,
            can_edit INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS approval_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            requester_code TEXT NOT NULL,
            requester_name TEXT DEFAULT '',
            requester_dept TEXT DEFAULT '',
            status TEXT DEFAULT 'draft',
            current_step INTEGER DEFAULT 1,
            total_steps INTEGER NOT NULL DEFAULT 1,
            metadata_json TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS approval_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER NOT NULL,
            step_order INTEGER NOT NULL,
            approver_code TEXT NOT NULL,
            approver_name TEXT DEFAULT '',
            action TEXT NOT NULL,
            comment TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS departments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            head_id INTEGER,
            description TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS business_trips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_code TEXT NOT NULL DEFAULT '',
            full_name TEXT DEFAULT '',
            department TEXT DEFAULT '',
            destination TEXT NOT NULL DEFAULT '',
            purpose TEXT NOT NULL DEFAULT '',
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            notes TEXT DEFAULT '',
            status TEXT DEFAULT 'active',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_id INTEGER NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            employee_id INTEGER,
            full_name TEXT DEFAULT '',
            department TEXT DEFAULT '',
            book_date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS salary_slips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_code TEXT NOT NULL,
            month TEXT NOT NULL,
            basic_salary REAL DEFAULT 0,
            allowances REAL DEFAULT 0,
            bonus REAL DEFAULT 0,
            deductions REAL DEFAULT 0,
            net_salary REAL DEFAULT 0,
            notes TEXT DEFAULT '',
            created_by TEXT DEFAULT '',
            updated_by TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime')),
            UNIQUE(employee_code, month)
        );

        CREATE TABLE IF NOT EXISTS salaries (
            employee_code TEXT NOT NULL,
            month TEXT NOT NULL,
            password TEXT DEFAULT '',
            data_json TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime')),
            UNIQUE(employee_code, month)
        );

        CREATE TABLE IF NOT EXISTS storage_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'smb',
            host TEXT NOT NULL DEFAULT '',
            port INTEGER DEFAULT 445,
            username TEXT DEFAULT '',
            password TEXT DEFAULT '',
            remote_path TEXT DEFAULT '/',
            domain TEXT DEFAULT '',
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS storage_permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            storage_id INTEGER NOT NULL,
            folder_path TEXT NOT NULL DEFAULT '/',
            role TEXT DEFAULT '',
            employee_code TEXT DEFAULT '',
            permission TEXT NOT NULL DEFAULT 'read',
            created_at TEXT DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS salary_upload_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            month TEXT NOT NULL,
            filename TEXT DEFAULT '',
            uploaded_by TEXT DEFAULT '',
            uploaded_by_name TEXT DEFAULT '',
            record_count INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_upload_logs_month ON salary_upload_logs(month);

        CREATE TABLE IF NOT EXISTS user_permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_code TEXT NOT NULL,
            module TEXT NOT NULL,
            can_view INTEGER DEFAULT 1,
            can_edit INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime')),
            UNIQUE(employee_code, module)
        );
        CREATE INDEX IF NOT EXISTS idx_user_perm_emp ON user_permissions(employee_code);
        CREATE INDEX IF NOT EXISTS idx_user_perm_module ON user_permissions(module);
    """)

    for col in ['employee_code TEXT', 'handover_date TEXT DEFAULT ""', 'status TEXT DEFAULT "active"']:
        try:
            conn.execute(f"ALTER TABLE employees ADD COLUMN {col}")
        except sqlite3.OperationalError:
            pass



    try:
        conn.execute("ALTER TABLE tickets ADD COLUMN employee_code TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        conn.execute("ALTER TABLE users ADD COLUMN updated_at TEXT DEFAULT (datetime('now','localtime'))")
    except sqlite3.OperationalError:
        pass

    try:
        conn.execute("ALTER TABLE storage_permissions ADD COLUMN department TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    for col in [
        "target_type TEXT DEFAULT 'DEPARTMENT'",
        "can_read INTEGER DEFAULT 1",
        "can_write INTEGER DEFAULT 0",
        "can_edit INTEGER DEFAULT 0",
        "can_delete INTEGER DEFAULT 0",
        "allow_download INTEGER DEFAULT 1",
        "can_reshare INTEGER DEFAULT 0",
        "expires_at TEXT DEFAULT ''",
        "updated_at TEXT DEFAULT (datetime('now','localtime'))",
    ]:
        try:
            conn.execute(f"ALTER TABLE storage_permissions ADD COLUMN {col}")
        except sqlite3.OperationalError:
            pass

    try:
        conn.execute("ALTER TABLE employees ADD COLUMN personal_email TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass

    try:
        conn.execute("INSERT INTO departments (name) SELECT DISTINCT department FROM employees WHERE department != '' AND department IS NOT NULL AND department NOT IN (SELECT name FROM departments)")
    except sqlite3.OperationalError:
        pass

    try:
        depts = conn.execute("SELECT id, name FROM departments WHERE head_id IS NULL").fetchall()
        for d in depts:
            head = conn.execute("""
                SELECT e.id FROM employees e
                WHERE e.department = ? AND e.status = 'active'
                  AND (LOWER(e.position) LIKE '%trưởng%' OR LOWER(e.position) LIKE '%truong%')
                ORDER BY e.id LIMIT 1
            """, (d['name'],)).fetchone()
            if not head:
                head = conn.execute("""
                    SELECT e.id FROM employees e
                    WHERE e.department = ? AND e.status = 'active'
                    ORDER BY e.id LIMIT 1
                """, (d['name'],)).fetchone()
            if head:
                conn.execute("UPDATE departments SET head_id = ? WHERE id = ?", (head['id'], d['id']))
    except sqlite3.OperationalError:
        pass

    for col in ['completed_at TEXT DEFAULT ""']:
        try:
            conn.execute(f"ALTER TABLE bookings ADD COLUMN {col}")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute(f"ALTER TABLE business_trips ADD COLUMN {col}")
        except sqlite3.OperationalError:
            pass

    for col in ['asset_code TEXT DEFAULT ""', 'lifecycle_status TEXT DEFAULT ""', 'purchase_date TEXT DEFAULT ""', 'purchase_cost TEXT DEFAULT ""']:
        try:
            conn.execute(f"ALTER TABLE equipment ADD COLUMN {col}")
        except sqlite3.OperationalError:
            pass
    for col in ['old_status TEXT DEFAULT ""', 'new_status TEXT DEFAULT ""', 'changed_by TEXT DEFAULT ""']:
        try:
            conn.execute(f"ALTER TABLE equipment_history ADD COLUMN {col}")
        except sqlite3.OperationalError:
            pass

    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_employee_code ON employees(employee_code)",
        "CREATE INDEX IF NOT EXISTS idx_employee_status ON employees(status)",
        "CREATE INDEX IF NOT EXISTS idx_employee_department ON employees(department)",
        "CREATE INDEX IF NOT EXISTS idx_equipment_employee ON equipment(employee_id)",
        "CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status)",
        "CREATE INDEX IF NOT EXISTS idx_equipment_asset_code ON equipment(asset_code)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_license_key ON licenses(license_key)",
        "CREATE INDEX IF NOT EXISTS idx_license_equipment ON licenses(equipment_id)",
        "CREATE INDEX IF NOT EXISTS idx_license_product ON licenses(product_name)",
        "CREATE INDEX IF NOT EXISTS idx_license_expiry ON licenses(expiry_date)",
        "CREATE INDEX IF NOT EXISTS idx_ticket_status ON tickets(status)",
        "CREATE INDEX IF NOT EXISTS idx_ticket_priority ON tickets(priority)",
        "CREATE INDEX IF NOT EXISTS idx_ticket_employee ON tickets(employee_id)",
        "CREATE INDEX IF NOT EXISTS idx_ticket_employee_code ON tickets(employee_code)",
        "CREATE INDEX IF NOT EXISTS idx_booking_resource_date ON bookings(resource_id, book_date)",
        "CREATE INDEX IF NOT EXISTS idx_booking_date ON bookings(book_date)",
        "CREATE INDEX IF NOT EXISTS idx_booking_status ON bookings(status)",
        "CREATE INDEX IF NOT EXISTS idx_booking_employee ON bookings(employee_id)",
        "CREATE INDEX IF NOT EXISTS idx_eq_history_equipment ON equipment_history(equipment_id)",
        "CREATE INDEX IF NOT EXISTS idx_eq_history_employee ON equipment_history(employee_code)",
        "CREATE INDEX IF NOT EXISTS idx_bt_employee ON business_trips(employee_code)",
        "CREATE INDEX IF NOT EXISTS idx_bt_department ON business_trips(department)",
        "CREATE INDEX IF NOT EXISTS idx_bt_dates ON business_trips(start_date, end_date)",
        "CREATE INDEX IF NOT EXISTS idx_bt_status ON business_trips(status)",
        "CREATE INDEX IF NOT EXISTS idx_bt_dept_dates ON business_trips(department, start_date, end_date)",
        "CREATE INDEX IF NOT EXISTS idx_wf_steps_template ON workflow_steps(template_id)",
        "CREATE INDEX IF NOT EXISTS idx_ar_requester ON approval_requests(requester_code)",
        "CREATE INDEX IF NOT EXISTS idx_ar_status ON approval_requests(status)",
        "CREATE INDEX IF NOT EXISTS idx_ar_template ON approval_requests(template_id)",
        "CREATE INDEX IF NOT EXISTS idx_al_request ON approval_logs(request_id)",
        "CREATE INDEX IF NOT EXISTS idx_dept_name ON departments(name)",
        "CREATE INDEX IF NOT EXISTS idx_dept_head ON departments(head_id)",
        "CREATE INDEX IF NOT EXISTS idx_salary_employee ON salary_slips(employee_code)",
        "CREATE INDEX IF NOT EXISTS idx_salary_month ON salary_slips(month)",
        "CREATE INDEX IF NOT EXISTS idx_salary_emp_month ON salary_slips(employee_code, month)",
        "CREATE INDEX IF NOT EXISTS idx_storage_active ON storage_config(is_active)",
        "CREATE INDEX IF NOT EXISTS idx_storage_perm_storage ON storage_permissions(storage_id)",
        "CREATE INDEX IF NOT EXISTS idx_storage_perm_role ON storage_permissions(role)",
        "CREATE INDEX IF NOT EXISTS idx_storage_perm_emp ON storage_permissions(employee_code)",
    ]
    for idx in indexes:
        try:
            conn.execute(idx)
        except (sqlite3.OperationalError, sqlite3.IntegrityError):
            pass

    _existing = conn.execute("SELECT COUNT(*) FROM resources").fetchone()[0]
    if _existing == 0:
        _defaults = [
            ('car', '🚗 Toyota Innova 29A-1234 (7 chỗ)', 'Phục vụ công tác'),
            ('car', '🚗 Hyundai SantaFe 29B-5678 (7 chỗ)', 'Gia đình'),
            ('car', '🚗 Ford Transit 29C-9012 (16 chỗ)', 'Đưa đón'),
            ('meeting_room', '🏢 Phòng họp A (Tầng 2)', 'Sức chứa 20 người'),
            ('meeting_room', '🏢 Phòng họp B (Tầng 3)', 'Sức chứa 8 người'),
            ('meeting_room', '🏢 Phòng họp C (Tầng 5)', 'Có máy chiếu'),
        ]
        conn.executemany("INSERT INTO resources (type, name, description) VALUES (?, ?, ?)", _defaults)

    conn.executescript("""
        CREATE TABLE IF NOT EXISTS lic_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            icon TEXT DEFAULT '',
            sort_order INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS lic_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            registered_date TEXT DEFAULT '',
            expiry_date TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            contract_file TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        );
    """)
    existing_cats = conn.execute("SELECT COUNT(*) FROM lic_categories").fetchone()[0]
    if existing_cats == 0:
        for item in [('License', '🔑', 0), ('Software', '💻', 1), ('Domain', '🌐', 2), ('Tài khoản', '👤', 3)]:
            conn.execute("INSERT INTO lic_categories (name, icon, sort_order) VALUES (?, ?, ?)", item)

    conn.executescript("""
        CREATE TABLE IF NOT EXISTS software_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            icon_name TEXT DEFAULT '',
            order_index INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS software_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            registered_date TEXT DEFAULT '',
            expiration_date TEXT DEFAULT '',
            contract_info TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_sw_items_category ON software_items(category_id);
    """)
    existing_sw = conn.execute("SELECT COUNT(*) FROM software_categories").fetchone()[0]
    if existing_sw == 0:
        for item in [('License', '🔑', 0), ('Software', '💻', 1), ('Domain', '🌐', 2), ('Tài khoản', '👤', 3)]:
            conn.execute("INSERT INTO software_categories (name, icon_name, order_index) VALUES (?, ?, ?)", item)

    conn.commit()
    conn.close()
