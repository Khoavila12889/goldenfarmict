# 📘 HƯỚNG DẪN SỬ DỤNG PHÂN HỆ YÊU CẦU HỖ TRỢ (TICKETS)

*(Dành cho người dùng cuối – End-user)*

---

## I. TỔNG QUAN

Phân hệ Yêu cầu Hỗ trợ (IT Tickets) cho phép nhân viên gửi yêu cầu hỗ trợ kỹ thuật tới bộ phận IT và theo dõi tiến trình xử lý. Bộ phận IT quản lý và xử lý yêu cầu qua bảng Kanban trực quan.

---

## II. NGƯỜI DÙNG (NHÂN VIÊN)

### 1. Gửi yêu cầu hỗ trợ mới

1. Nhập **Tiêu đề** — mô tả ngắn gọn vấn đề (bắt buộc).
2. Nhập **Mô tả chi tiết** — giải thích rõ ràng lỗi/nhu cầu.
3. Chọn **Mức độ ưu tiên**: Bình thường / Quan trọng / Khẩn cấp.
4. Nhấn **Gửi yêu cầu**.

### 2. Theo dõi ticket

- Ticket của bạn hiển thị trong danh sách **Ticket của tôi**.
- Mỗi thẻ hiển thị: mã số, tiêu đề, mức độ ưu tiên, trạng thái xử lý, ngày gửi.
- Khi IT phản hồi, nội dung hiển thị trong mục **Phản hồi từ IT**.

### 3. Quy trình xử lý

| Trạng thái | Ý nghĩa |
|------------|---------|
| ⏳ **Chờ xử lý** | IT chưa bắt đầu xử lý |
| ⚙️ **Đang xử lý** | IT đang làm việc |
| ✅ **Đã xử lý** | Đã có phản hồi giải pháp |
| ❌ **Đã hủy** | Yêu cầu bị hủy |

---

## III. IT ADMIN / QUẢN TRỊ

### 1. Bảng Kanban

Gồm 4 cột tương ứng 4 trạng thái. Kéo thả ticket qua các cột bằng menu chọn trạng thái trên mỗi thẻ.

### 2. Xử lý & Phản hồi

1. Click vào thẻ ticket để mở bảng điều khiển bên phải.
2. Xem **Mô tả** chi tiết từ người dùng.
3. Chọn **Trạng thái** mới hoặc nhập **Ghi chú nội bộ** (chỉ IT thấy).
4. Nhập **Phản hồi cho người dùng** — giải pháp, hướng dẫn xử lý.
5. Nhấn **Lưu phản hồi** (tự động chuyển trạng thái thành *Đã xử lý* nếu có phản hồi).

### 3. Bộ lọc

- **Trạng thái**: Lọc theo tiến trình xử lý.
- **Mức độ ưu tiên**: Ưu tiên ticket khẩn cấp.
- **Tìm kiếm**: Tra cứu theo tiêu đề, mã số.
