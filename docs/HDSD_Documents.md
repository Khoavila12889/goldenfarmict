# 📘 HƯỚNG DẪN SỬ DỤNG PHÂN HỆ TÀI LIỆU (DOCUMENTS)

*(Dành cho người dùng cuối – End-user)*

---

## I. TỔNG QUAN

Phân hệ Tài liệu cho phép truy cập và quản lý tệp tin từ các kho lưu trữ dùng chung (File Server SMB, FTP, Google Drive). Hỗ trợ xem trước tệp tin, tải xuống, phân quyền truy cập, và **chia sẻ file / thư mục qua link**. Link chia sẻ thư mục mở ra giao diện duyệt thư mục cho khách (Grid/List), xem file con bằng ONLYOFFICE và tải .zip toàn bộ thư mục.

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

### 6. Chia sẻ link (File & Thư mục)
**Người dùng tạo link chia sẻ**
1. Vào **Tài liệu** → hover thẻ **File** hoặc **Thư mục** → nhấn icon **🔗 Chia sẻ** (hoặc chuột phải → **Chia sẻ** / **Chia sẻ thư mục**).
2. Trong modal **Chia sẻ**:
   - Chọn **Hình thức chia sẻ**:
     - **Tất cả nhân viên** — mọi user nội bộ đã đăng nhập.
     - **Theo phòng ban** — user thuộc phòng ban đã chọn.
     - **Công khai / Link** — bất kỳ ai giữ link, **không cần đăng nhập**.
   - (Tùy chọn) Chọn **Ngày hết hạn** — để trống là không hết hạn.
   - Chọn **Quyền truy cập** (mặc định **Xem + Tải xuống**):
     - **Xem** — luôn bật: mở/xem trực tuyến qua ONLYOFFICE/preview.
     - **Tải xuống** — cho phép tải file / nén thư mục `.zip`.
     - **Chỉnh sửa** — mở ONLYOFFICE ở chế độ sửa và lưu ngược về kho; chỉ áp dụng cho link **nội bộ** (ALL/DEPT). Link **Công khai** luôn chỉ xem (quyền này bị ẩn).
3. Nhấn **"Tạo link chia sẻ"** → link được sinh ra.
4. **Sao chép link** (nút **Sao chép** hoạt động cả trên mạng LAN HTTP) hoặc quét **QR code** để gửi.
5. Phần **"Chia sẻ hiện tại"** hiển thị các link đang hoạt động (kèm **chip quyền**); nhấn icon **Thu hồi** để vô hiệu link ngay.

**Khách truy cập link chia sẻ**
- **Link file**: mở trực tiếp qua **ONLYOFFICE** (docx/xlsx/pptx/pdf…) ở chế độ xem, hoặc xem ảnh/PDF, hoặc tải xuống (nếu có quyền).
- **Link thư mục**:
  - Hiển thị danh sách **Grid/List** các file và thư mục con.
  - **Breadcrumb** chỉ cho đi sâu vào thư mục con — không thể thoát lên trên thư mục gốc được chia sẻ.
  - Click file con → mở **toàn màn hình** qua **ONLYOFFICE / preview ảnh-PDF** (như trình xem tài liệu nội bộ); thanh trên cùng có nút **Quay lại thư mục**, **Tải xuống** và **Đóng** (hoặc phím **Esc**).
  - Nhấn **Tải .zip** để nén toàn bộ thư mục (chỉ khi thư mục đủ nhỏ — mặc định ≤ 200 file / 200MB; nếu quá lớn hệ thống hướng dẫn tải từng file).
- Nếu link **không cho phép tải xuống**: các nút **Tải xuống / .zip** bị ẩn và yêu cầu tải bị backend chặn — nhưng **vẫn xem online** bình thường.
- Nếu link nội bộ **cho phép chỉnh sửa**: ONLYOFFICE mở ở chế độ **sửa**, lưu thay đổi ngược về kho; ngược lại **chỉ xem** (link công khai luôn chỉ xem).
- Link **PUBLIC** không cần đăng nhập; link **ALL/DEPT** yêu cầu đăng nhập nội bộ.
- Link **hết hạn** sẽ tự chặn truy cập với thông báo lỗi.

**Cơ chế xem file con trong Share Folder** (cho IT)
- File con được xác thực bằng **token của thư mục cha** + định danh file con (`file_path`/`file_id`/`file_name`) — giống hệt luồng Share File.
- Backend sinh `document.url` là **absolute URL** trỏ vào `GET /api/shares/{token}/download?...`; OnlyOffice Document Server tải file server-to-server bằng signed token.
- Mỗi request đều **tái kiểm tra**: link còn hạn, file con **nằm trong thư mục được chia sẻ** (chống path traversal / vượt phạm vi), quyền `download` khi tải xuống thật sự (`disposition=attachment`); xem online chỉ cần quyền `view`.

---

## IV. QUYỀN HẠN

| Vai trò | Quyền |
|---------|-------|
| **Admin** | Quản lý kho lưu trữ, phân quyền, duyệt tất cả tệp tin, quản lý mọi link chia sẻ |
| **Nhân viên** | Duyệt và xem tệp tin theo quyền được cấp, chia sẻ file/thư mục được phép |
