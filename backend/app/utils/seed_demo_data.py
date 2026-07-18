"""
Seed sample booking & ticket data for demo/testing.
Run: python -m src.utils.seed_demo_data
"""
import sqlite3
import os
import random
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "company.db")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = OFF")
    return conn


def seed_tickets(conn):
    employees = conn.execute(
        "SELECT id, full_name, department, employee_code FROM employees WHERE employee_code != '' AND department != '' ORDER BY RANDOM()"
    ).fetchall()

    if not employees:
        print("No employees found, skip tickets.")
        return

    priorities = ["Binh thuong", "Quan trong", "Khan cap"]
    statuses = ["Cho xu ly", "Dang xu ly", "Da xu ly", "Da huy"]

    ticket_templates = [
        "Lỗi phần mềm {sw} trên máy tính",
        "Yêu cầu cài đặt {sw}",
        "Hỏng thiết bị {eq}",
        "Cần cấp phát {eq} mới",
        "Lỗi kết nối mạng tại {loc}",
        "Yêu cầu reset mật khẩu {sys}",
        "Virus / máy chạy chậm",
        "Máy in {pr} không hoạt động",
        "Yêu cầu nâng cấp RAM / SSD",
        "Mất dữ liệu trên {loc}",
    ]
    sw_list = ["Excel", "AutoCAD", "ERP", "CRM", "Photoshop", "SketchUp", "Word", "TeamViewer", "WPS Office", "Zalo PC"]
    eq_list = ["màn hình", "bàn phím", "chuột", "webcam", "tai nghe", "USB hub", "cáp mạng", "ổ cứng di động"]
    loc_list = ["phòng A", "khu vực sản xuất", "văn phòng", "kho", "bàn số 5"]
    sys_list = ["Windows", "email công ty", "phần mềm ERP", "WiFi"]
    pr_list = ["HP LaserJet", "Epson L5190", "Brother DCP", "Canon LBP"]

    for _ in range(35):
        emp = random.choice(employees)
        template = random.choice(ticket_templates)
        title = template.format(
            sw=random.choice(sw_list),
            eq=random.choice(eq_list),
            loc=random.choice(loc_list),
            sys=random.choice(sys_list),
            pr=random.choice(pr_list),
        )
        description = random.choice([
            f"Máy {random.choice(['bàn', 'tính', 'laptop'])} của tôi gặp vấn đề khi sử dụng. Mong IT hỗ trợ sớm.",
            "Vui lòng kiểm tra và xử lý giúp. Cảm ơn!",
            "Tình trạng đã kéo dài 2 ngày, ảnh hưởng đến công việc.",
            "Cần hỗ trợ gấp trước 16h chiều nay.",
            "Đã thử khởi động lại nhưng không hiệu quả.",
        ])
        priority = random.choice(priorities)
        status = random.choice(statuses)

        days_ago = random.randint(1, 45)
        created = (datetime.now() - timedelta(days=days_ago)).strftime("%Y-%m-%d %H:%M:%S")

        resolution = ""
        admin_notes = ""
        if status in ("Da xu ly", "Dang xu ly"):
            resolution = random.choice([
                "Đã cài đặt lại driver, máy hoạt động bình thường.",
                "Đã cập nhật phần mềm lên phiên bản mới nhất.",
                "Đã thay thế thiết bị mới. Nhân viên đã nhận.",
                "Đã reset mật khẩu và hướng dẫn đăng nhập lại.",
                "Đã cài đặt phần mềm theo yêu cầu.",
                "Mạng đã được khắc phục, kiểm tra lại OK.",
            ])
            admin_notes = random.choice([
                "Đã xử lý xong, liên hệ lại người dùng xác nhận.",
                "Đang chờ nhập thiết bị mới từ kho.",
                "Đã test kỹ trước khi bàn giao.",
            ])

        conn.execute("""
            INSERT INTO tickets (employee_id, full_name, department, title, description, priority, status, resolution, admin_notes, employee_code, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            emp['id'], emp['full_name'], emp['department'],
            title, description, priority, status,
            resolution, admin_notes, emp['employee_code'],
            created, created,
        ))

    print(f"Inserted 35 sample tickets.")


def seed_bookings(conn):
    employees = conn.execute(
        "SELECT id, full_name, department FROM employees WHERE employee_code != '' AND department != '' ORDER BY RANDOM()"
    ).fetchall()

    resources = conn.execute("SELECT * FROM resources WHERE is_active=1").fetchall()

    if not employees or not resources:
        print("Skip bookings: no employees or resources.")
        return

    today = datetime.now().date()
    # Created bookings on various days: past, today, future
    dates = [today - timedelta(days=d) for d in range(1, 15)] + [today] + [today + timedelta(days=d) for d in range(1, 15)]
    time_slots = [
        ("07:30", "09:00"),
        ("08:00", "09:30"),
        ("09:00", "10:30"),
        ("09:30", "11:00"),
        ("10:00", "11:30"),
        ("10:30", "12:00"),
        ("13:00", "14:30"),
        ("13:30", "15:00"),
        ("14:00", "15:30"),
        ("14:30", "16:00"),
        ("15:00", "16:30"),
        ("15:30", "17:00"),
        ("16:00", "17:00"),
    ]

    booking_titles = [
        "Đi công tác khách hàng",
        "Họp dự án hàng tuần",
        "Đón đối tác tại sân bay",
        "Họp giao ban",
        "Giao hàng khu vực nội thành",
        "Điểm QC thực tế",
        "Họp đánh giá chất lượng",
        "Đào tạo nhân viên mới",
        "Họp với nhà cung cấp",
        "Bảo trì máy móc",
        "Kiểm tra kho",
    ]

    for _ in range(25):
        emp = random.choice(employees)
        res = random.choice(resources)
        book_date = random.choice(dates)
        start_time, end_time = random.choice(time_slots)

        title = random.choice(booking_titles)
        status = "active"
        # Past bookings (older than today) are mostly finished
        if book_date < today:
            status = "finished" if random.random() < 0.85 else "active"
        # Future bookings are always active
        elif book_date > today:
            status = "active"

        notes = random.choice(["", "Có khách từ tỉnh.", "Cần xe trước 8h.", "Đi 2 người.", "", ""])

        conn.execute("""
            INSERT INTO bookings (resource_id, title, employee_id, full_name, department, book_date, start_time, end_time, status, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            res['id'], title, emp['id'], emp['full_name'], emp['department'],
            book_date.isoformat(), start_time, end_time, status, notes,
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        ))

    print(f"Inserted 25 sample bookings.")


def seed_business_trips(conn):
    employees = conn.execute(
        "SELECT employee_code, full_name, department FROM employees WHERE employee_code != '' AND department != '' ORDER BY RANDOM()"
    ).fetchall()

    if not employees:
        print("No employees found, skip business trips.")
        return

    today = datetime.now().date()
    destinations = [
        "Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng", "Hải Phòng", "Cần Thơ",
        "Nha Trang", "Đà Lạt", "Vũng Tàu", "Huế", "Quảng Ninh",
        "Bình Dương", "Đồng Nai", "Lào Cai", "Sapa", "Phú Quốc",
    ]
    purposes = [
        "Họp đối tác chiến lược",
        "Kiểm tra dự án thực tế",
        "Đào tạo khách hàng",
        "Báo giá & ký hợp đồng",
        "Hỗ trợ kỹ thuật tại chi nhánh",
        "Tham gia hội thảo ngành",
        "Khảo sát thị trường",
        "Quyết toán công trình",
        "Nghiệm thu giai đoạn dự án",
        "Công tác đột xuất theo chỉ đạo",
    ]

    for _ in range(20):
        emp = random.choice(employees)
        dest = random.choice(destinations)
        purpose = random.choice(purposes)

        start_offset = random.randint(-30, 14)
        duration = random.randint(1, 4)
        start_date = today + timedelta(days=start_offset)
        end_date = start_date + timedelta(days=duration)

        if end_date < today:
            status = random.choice(["active", "finished", "finished", "finished"])
        elif start_date > today:
            status = "active"
        else:
            status = random.choice(["active", "finished"])

        notes = random.choice([
            "", "Mang theo laptop công ty.", "Cần đặt vé máy bay trước.",
            "Liên hệ anh Tuấn đầu cầu.", "", "", "Đã báo cáo trưởng phòng.",
        ])

        conn.execute("""
            INSERT INTO business_trips (employee_code, full_name, department,
                                        destination, purpose, start_date, end_date, notes, status,
                                        created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            emp['employee_code'], emp['full_name'], emp['department'],
            dest, purpose, start_date.isoformat(), end_date.isoformat(),
            notes, status,
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        ))

    print("Inserted 20 sample business trips.")


def main():
    conn = get_conn()

    seed_tickets(conn)
    seed_bookings(conn)
    seed_business_trips(conn)
    conn.commit()
    conn.close()
    print("Demo data seeded successfully!")


if __name__ == "__main__":
    main()
