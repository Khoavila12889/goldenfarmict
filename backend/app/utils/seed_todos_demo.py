"""
Seed demo data for Todos using REAL company users from oc_users.csv.
Run: python -m app.utils.seed_todos_demo
"""
import os, sys, random
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from app.core.database import get_conn

DEMO_TODOS = [
    {"title": "Kiểm tra chất lượng lô hàng xuất khẩu", "scope": "department", "dept": "Sản Xuất", "priority": "urgent"},
    {"title": "Bảo trì máy móc dây chuyền số 3", "scope": "department", "dept": "Sản Xuất", "priority": "high"},
    {"title": "Cập nhật quy trình vận hành sản xuất", "scope": "department", "dept": "Sản Xuất", "priority": "medium"},
    {"title": "Quyết toán thuế quý 3", "scope": "department", "dept": "Kế Toán", "priority": "urgent"},
    {"title": "Đối chiếu công nợ nhà cung cấp", "scope": "department", "dept": "Kế Toán", "priority": "high"},
    {"title": "Lập báo cáo tài chính tháng", "scope": "department", "dept": "Kế Toán", "priority": "medium"},
    {"title": "Chuẩn bị chương trình khuyến mãi cuối năm", "scope": "department", "dept": "KD - Siêu thị", "priority": "high"},
    {"title": "Đàm phán hợp đồng với nhà cung cấp mới", "scope": "department", "dept": "KD - Siêu thị", "priority": "high"},
    {"title": "Tổng kết doanh thu tháng", "scope": "department", "dept": "KD - Siêu thị", "priority": "medium"},
    {"title": "Tối ưu lộ trình giao hàng khu vực nội thành", "scope": "department", "dept": "Giao hàng", "priority": "medium"},
    {"title": "Kiểm tra tình trạng xe giao hàng", "scope": "department", "dept": "Giao hàng", "priority": "high"},
    {"title": "Bảo dưỡng định kỳ hệ thống điện", "scope": "department", "dept": "Bảo trì", "priority": "urgent"},
    {"title": "Thay thế thiết bị hao mòn", "scope": "department", "dept": "Bảo trì", "priority": "high"},
    {"title": "Kiểm tra an toàn phòng cháy chữa cháy", "scope": "department", "dept": "Bảo trì", "priority": "urgent"},
    {"title": "Nghiên cứu giải pháp tự động hóa", "scope": "department", "dept": "Kỹ Thuật", "priority": "medium"},
    {"title": "Cập nhật bản vẽ kỹ thuật", "scope": "department", "dept": "Kỹ Thuật", "priority": "low"},
    {"title": "Hoàn thành báo cáo tuần", "scope": "personal", "priority": "medium"},
    {"title": "Học quy trình ISO mới", "scope": "personal", "priority": "low"},
    {"title": "Chuẩn bị tài liệu họp giao ban", "scope": "personal", "priority": "high"},
    {"title": "Đăng ký khóa đào tạo nội bộ", "scope": "personal", "priority": "low"},
    {"title": "Xin duyệt đề xuất mua sắm", "scope": "personal", "priority": "medium"},
    {"title": "Gửi mail cảm ơn khách hàng", "scope": "personal", "priority": "low"},
]

SUBTASK_POOL = {
    "Kiểm tra chất lượng lô hàng xuất khẩu": ["Lấy mẫu kiểm tra", "Đo kích thước", "Kiểm tra bao bì", "Lập biên bản KCS"],
    "Bảo trì máy móc dây chuyền số 3": ["Kiểm tra động cơ", "Vệ sinh bộ lọc", "Tra dầu mỡ", "Chạy thử"],
    "Quyết toán thuế quý 3": ["Thu thập hóa đơn", "Tính thuế GTGT", "Lập tờ khai", "Nộp hồ sơ"],
    "Chuẩn bị chương trình khuyến mãi cuối năm": ["Lên danh sách sản phẩm KM", "In ấn poster", "Gửi thông báo đại lý", "Setup gian hàng"],
    "Tối ưu lộ trình giao hàng khu vực nội thành": ["Phân tích dữ liệu giao hàng 3 tháng", "Vẽ bản đồ lộ trình", "Mô phỏng thời gian", "Báo cáo đề xuất"],
    "Bảo dưỡng định kỳ hệ thống điện": ["Cắt điện khu vực", "Kiểm tra tủ điện", "Vệ sinh thiết bị", "Đóng điện kiểm tra"],
    "Nghiên cứu giải pháp tự động hóa": ["Khảo sát hiện trạng", "Tìm hiểu thiết bị", "Tính toán chi phí", "Đề xuất giải pháp"],
}


def seed(conn):
    employees = conn.execute(
        "SELECT employee_code, full_name, department FROM employees WHERE status='active' AND department != 'Chưa phân phòng'"
    ).fetchall()
    if len(employees) < 10:
        print("Not enough real employees, skipping.")
        return {"todos": 0}

    existing = conn.execute("SELECT COUNT(*) FROM todos").fetchone()[0]
    if existing > 20:
        print(f"Todos already exist ({existing}), skip.")
        return {"todos": 0}

    statuses = ["todo", "in_progress", "review", "completed"]
    status_weights = [0.3, 0.3, 0.2, 0.2]
    today = datetime.now().date()
    count = 0

    for t in DEMO_TODOS:
        pool = [e for e in employees if t["scope"] == "personal" or e["department"] == t.get("dept", "")]
        if not pool:
            pool = employees
        creator = random.choice(employees)
        assignee = random.choice(pool)
        status = random.choices(statuses, weights=status_weights, k=1)[0]
        created_date = (today - timedelta(days=random.randint(0, 14))).isoformat()
        due_offset = random.choice([-3, -1, 0, 3, 5, 7, 10])
        due_date = (today + timedelta(days=due_offset)).isoformat() if due_offset else ""
        tags = random.choice(["", "Quan trọng", "Định kỳ", "KHẨN"])

        conn.execute("""INSERT INTO todos (title, description, scope, department, creator_code, creator_name, assignee_code, assignee_name, status, priority, due_date, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                     (t["title"], "", t["scope"], t.get("dept", ""),
                      creator["employee_code"], creator["full_name"],
                      assignee["employee_code"], assignee["full_name"],
                      status, t["priority"], due_date, tags, created_date, created_date))
        todo_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        subtasks = SUBTASK_POOL.get(t["title"], [])
        for idx, st in enumerate(subtasks):
            is_done = 1 if status == "completed" else (0 if status == "todo" else random.choice([0, 1]))
            conn.execute("INSERT INTO todo_subtasks (todo_id, title, is_completed, sort_order) VALUES (?, ?, ?, ?)",
                         (todo_id, st, is_done, idx))
        count += 1

    conn.commit()
    return {"todos": count}


def main():
    conn = get_conn()
    result = seed(conn)
    conn.close()
    print(f"Seeded {result['todos']} demo todos using REAL company users (oc_users.csv)")


if __name__ == "__main__":
    main()
