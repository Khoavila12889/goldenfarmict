"""
Migration script để thêm indexes cho business_trips module
Chạy: python migrate_business_trips.py
"""
import sqlite3
import os

DB_FILE = os.path.join(os.path.dirname(__file__), 'company.db')

def migrate():
    conn = sqlite3.connect(DB_FILE)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode=WAL")
    
    print("🔧 Bắt đầu migration cho business_trips...")
    
    # Thêm indexes mới
    indexes = [
        ("idx_bt_department", "CREATE INDEX IF NOT EXISTS idx_bt_department ON business_trips(department)"),
        ("idx_bt_dept_dates", "CREATE INDEX IF NOT EXISTS idx_bt_dept_dates ON business_trips(department, start_date, end_date)"),
    ]
    
    for idx_name, idx_sql in indexes:
        try:
            conn.execute(idx_sql)
            print(f"✅ Đã tạo index: {idx_name}")
        except sqlite3.OperationalError as e:
            print(f"⚠️  Index {idx_name} đã tồn tại hoặc lỗi: {e}")
    
    conn.commit()
    conn.close()
    
    print("✅ Migration hoàn tất!")
    print("\n📊 Thống kê indexes cho business_trips:")
    
    # Hiển thị danh sách indexes
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.execute("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='business_trips'")
    for row in cursor.fetchall():
        if row[1]:  # Không hiển thị auto-index
            print(f"   • {row[0]}")
    conn.close()

if __name__ == "__main__":
    migrate()
