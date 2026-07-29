# 📘 HƯỚNG DẪN SỬ DỤNG PHÂN HỆ TÀI LIỆU (DOCUMENTS)

*(Dành cho người dùng cuối – End-user)*

---

## I. TỔNG QUAN

Phân hệ Tài liệu cho phép truy cập và quản lý tệp tin từ các kho lưu trữ dùng chung (File Server SMB, FTP, Google Drive). Hỗ trợ xem trước tệp tin, tải xuống, và phân quyền truy cập.

---

## II. GIAO DIỆN CHÍNH

### 1. Danh sách tệp tin
- Hiển thị dạng **Lưới (Grid)** hoặc **Danh sách (List)**.
- Mỗi tệp tin hiển thị: tên, kích thước, ngày sửa đổi, biểu tượng loại tệp.

### 2. Chọn kho lưu trữ
- Danh sách các kho (Storage Configs) ở đầu trang.
- Click vào kho để duyệt tệp tin trong kho đó.

### 3. Breadcrumb
- Đường dẫn thư mục hiện tại — click để quay lại thư mục cha.

---

## III. HƯỚNG DẪN THAO TÁC

### 1. Duyệt tệp tin
- Click vào thư mục để mở.
- Click vào tệp tin để xem trước (File Viewer).

### 2. Xem trước tệp
- Hỗ trợ: Hình ảnh, PDF, văn bản, code.
- Xem toàn màn hình bằng nút **⛶ Phóng to**.

### 3. Tải xuống
- Nhấn **⬇️ Tải xuống** ở góc trên bên phải File Viewer.

### 4. Quản lý kho (Admin)
- **📁 Quản lý kho**: Thêm/sửa/xóa kết nối đến File Server.
- Hỗ trợ các giao thức: SMB (Windows Share), FTP, Google Drive.

### 5. Phân quyền (Admin)
- Click vào kho → **🔒 Phân quyền**.
- Cấp quyền: **Mọi người** hoặc theo **Phòng ban**.
- Thiết lập quyền: Xem, Ghi, Sửa, Xóa, Tải xuống, Chia sẻ.
- Đặt ngày hết hạn cho quyền (tùy chọn).

---

## IV. QUYỀN HẠN

| Vai trò | Quyền |
|---------|-------|
| **Admin** | Quản lý kho lưu trữ, phân quyền, duyệt tất cả tệp tin |
| **Nhân viên** | Duyệt và xem tệp tin theo quyền được cấp |
