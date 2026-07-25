# 📘 HƯỚNG DẪN SỬ DỤNG PHÂN HỆ PHÂN QUYỀN TÀI LIỆU

*(Dành cho người dùng cuối – End-user)*

---

## I. TỔNG QUAN

Phân hệ Phân quyền cho phép Admin thiết lập quyền truy cập cho từng kho lưu trữ tài liệu. Người dùng sẽ chỉ thấy được các tệp tin mà họ được cấp quyền.

---

## II. GIAO DIỆN CHÍNH

### 1. Danh sách kho
- Hiển thị danh sách các kho lưu trữ (Storage Configs).
- Click vào kho để quản lý phân quyền cho kho đó.

### 2. Bảng quyền (Permission Matrix)
Ma trận quyền cho từng đối tượng:

| Quyền | Ý nghĩa |
|-------|---------|
| **Xem (can_read)** | Xem và duyệt tệp tin |
| **Ghi (can_write)** | Tải lên và tạo tệp tin mới |
| **Sửa (can_edit)** | Chỉnh sửa tệp tin hiện có |
| **Xóa (can_delete)** | Xóa tệp tin |
| **Tải xuống (allow_download)** | Tải tệp về máy |
| **Chia sẻ (can_reshare)** | Chia sẻ quyền cho người khác |
| **In (allow_print)** | In ấn tệp tin |

---

## III. HƯỚNG DẪN THAO TÁC

### 1. Cấp quyền "Mọi người"
- Tích/bỏ các quyền trong mục **Mọi người**.
- Đặt ngày hết hạn (tùy chọn).
- Nhấn **Áp dụng** hoặc **Cập nhật**.

### 2. Cấp quyền theo Phòng ban
- Chọn phòng ban từ dropdown.
- Tích/bỏ các quyền mong muốn.
- Đặt ngày hết hạn (tùy chọn).
- Nhấn **+ Thêm**.

### 3. Chỉnh sửa / Xóa quyền
- Click mở rộng phòng ban → chỉnh sửa quyền hoặc đặt lại hạn.
- Nhấn **🗑️** để xóa quyền của phòng ban đó.

---

## IV. QUYỀN HẠN

| Vai trò | Quyền |
|---------|-------|
| **Admin** | Toàn quyền: thiết lập và quản lý tất cả phân quyền |
| **Nhân viên** | Chỉ xem và sử dụng tài liệu theo quyền được cấp |
| **Người được reshare** | Có thể chia sẻ lại quyền cho người khác nếu được cấp quyền đó |
