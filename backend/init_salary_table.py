"""
Database migration script to initialize salary_slips table
Run this once to add the table to existing database

Usage: python init_salary_table.py
"""
import sqlite3
import os

DB_FILE = os.path.join(os.path.dirname(__file__), 'company.db')


def init_salary_table():
    """Initialize salary_slips table if not exists"""
    conn = sqlite3.connect(DB_FILE)
    conn.execute("PRAGMA foreign_keys = ON")
    
    print("📋 Initializing salary_slips table...")
    
    # Create table
    conn.execute("""
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
        )
    """)
    print("✅ Table created")
    
    # Create indexes
    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_salary_employee ON salary_slips(employee_code)",
        "CREATE INDEX IF NOT EXISTS idx_salary_month ON salary_slips(month)",
        "CREATE INDEX IF NOT EXISTS idx_salary_emp_month ON salary_slips(employee_code, month)",
    ]
    
    for idx_sql in indexes:
        conn.execute(idx_sql)
    
    print("✅ Indexes created")
    
    conn.commit()
    
    # Verify
    count = conn.execute("SELECT COUNT(*) FROM salary_slips").fetchone()[0]
    print(f"✅ Verification: {count} salary slips in database")
    
    conn.close()
    print("🎉 Migration completed successfully!")
    print("\n📁 Next step: Create 'salary_pdfs' folder in backend directory")
    
    # Create salary_pdfs folder
    salary_dir = os.path.join(os.path.dirname(__file__), 'salary_pdfs')
    os.makedirs(salary_dir, exist_ok=True)
    print(f"✅ Created folder: {salary_dir}")


if __name__ == "__main__":
    try:
        init_salary_table()
    except Exception as e:
        print(f"❌ Error: {e}")
        raise
