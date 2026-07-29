# 📘 HƯỚNG DẪN SỬ DỤNG PHÂN HỆ QUẢN LÝ CÔNG VIỆC (TODOS & TASK KANBAN)

*(Dành cho người dùng cuối – End-user)*

---

## I. TỔNG QUAN VỀ PHÂN HỆ

Phân hệ Quản lý Công việc & Todos giúp bạn dễ dàng theo dõi, lập kế hoạch, phân công và quản lý tiến độ công việc cá nhân cũng như phòng ban theo mô hình bảng Kanban trực quan và hiện đại.

**Các điểm nổi bật:**
- **Theo dõi tiến độ trực quan:** Dễ dàng nhận biết trạng thái công việc qua các cột Kanban (Cần làm, Đang thực hiện, Chờ duyệt, Đã hoàn thành).
- **Cập nhật thời gian thực (Realtime):** Mọi thay đổi trạng thái hay công việc mới sẽ tự động hiển thị ngay lập tức cho các thành viên liên quan.
- **Chuẩn hóa thời gian:** Toàn bộ hạn hoàn thành hiển thị theo chuẩn DD/MM/YYYY (Ví dụ: 25/07/2026).

---

## II. GIAO DIỆN CHÍNH & CÁC THÀNH PHẦN

### 1. Thống kê KPI (Stats Cards)

Nằm ở ngay đầu trang, giúp bạn nắm bắt nhanh tổng quan công việc:

| Thẻ | Ý nghĩa |
|-----|---------|
| **Tổng công việc** | Tổng số lượng task trong bộ lọc hiện tại |
| **Cần làm** | Các công việc mới tạo, chưa bắt đầu |
| **Đang xử lý** | Công việc đang trong quá trình thực hiện |
| **Chờ kiểm tra** | Công việc đã làm xong, chờ cấp trên/đồng nghiệp duyệt |
| **Đã hoàn thành** | Công việc đã kết thúc thành công |
| **Quá hạn** | Công việc chưa xong nhưng đã quá hạn hoàn thành (Due Date) |

💡 **Mẹo:** Bạn có thể nhấp chuột trực tiếp vào từng ô KPI để lọc nhanh các công việc thuộc trạng thái đó.

### 2. Thanh công cụ & Bộ lọc (Toolbar)

| Thành phần | Chức năng |
|-----------|-----------|
| **Thẻ phạm vi (Scope): Tất cả** | Xem toàn bộ công việc cá nhân và phòng ban |
| **Cá nhân** | Chỉ hiển thị công việc do bạn tạo hoặc được giao trực tiếp |
| **Phòng ban** | Hiển thị công việc chung của phòng ban bạn |
| **Tìm kiếm** | Nhập từ khóa để tìm kiếm nhanh theo tên tiêu đề công việc |
| **Độ ưu tiên** | Lọc công việc theo mức độ: Thấp, Trung bình, Cao, Khẩn cấp |
| **Nút Tải lại** | Làm mới dữ liệu hệ thống thủ công |

---

## III. HƯỚNG DẪN THAO TÁC CHI TIẾT

### Bước 1: Tạo mới một công việc (Create Task)

1. Nhấp vào nút **+ Tạo công việc mới** (màu xanh ở góc trên bên phải).
2. Cửa sổ **Tạo mới Công việc** xuất hiện, điền các thông tin sau:

| Trường thông tin | Hướng dẫn nhập | Yêu cầu |
|-----------------|----------------|---------|
| **Tên công việc** | Nhập tiêu đề rõ ràng, ngắn gọn về việc cần làm | **Bắt buộc** (*) |
| **Mô tả chi tiết** | Nhập thêm hướng dẫn, yêu cầu cụ thể hoặc ghi chú | Tùy chọn |
| **Phạm vi (Scope)** | Chọn **Cá nhân** (Chỉ bạn thấy) hoặc **Phòng ban** (Cả phòng thấy) | Bắt buộc |
| **Người thực hiện** | Chọn người nhận nhiệm vụ từ danh sách nhân viên | Tùy chọn |
| **Độ ưu tiên** | Chọn: Thấp, Trung bình, Cao, Khẩn cấp 🚨 | Bắt buộc |
| **Hạn hoàn thành** | Nhập theo định dạng **DD/MM/YYYY** (Ví dụ: 30/07/2026) | Tùy chọn |
| **Tags / Nhãn** | Nhập các từ khóa phân loại, cách nhau bằng dấu phẩy (VD: IT, Báo cáo) | Tùy chọn |

### Bước 2: Tạo danh sách việc nhỏ (Subtasks Checklist)

Nằm ngay trong khung Tạo mới / Chỉnh sửa công việc:

1. Di chuyển xuống phần **Danh sách việc nhỏ (Subtasks Checklist)**.
2. Nhập nội dung việc nhỏ vào ô *"Thêm mục việc cần hoàn thành..."*.
3. Nhấn nút **Thêm** (hoặc ấn phím **Enter** trên bàn phím).
4. Bạn có thể thêm nhiều công việc nhỏ nối tiếp nhau để tạo thành danh sách kiểm tra (Checklist).

### Bước 3: Cập nhật & Chuyển trạng thái công việc

Bạn có **2 cách** cập nhật trạng thái nhanh:

**Cách 1: Menu chuyển nhanh trên thẻ (Khuyên dùng)**
- Tại mỗi thẻ công việc trên bảng Kanban, bạn sẽ thấy một ô chọn trạng thái ở phía dưới.
- Bấm vào ô và chọn trạng thái mới: **Cần làm → Đang xử lý → Chờ duyệt → Hoàn thành**.

**Cách 2: Cập nhật danh sách Subtask**
- Mở giao diện **Chỉnh sửa (Edit)** công việc (icon ✏️).
- Tích chọn ☑ vào ô vuông bên cạnh công việc nhỏ đã làm xong.
- Thanh tiến độ Subtask ngoài thẻ Kanban sẽ tự động tính toán % hoàn thành tương ứng.

### Bước 4: Chỉnh sửa hoặc Xóa công việc

| Thao tác | Cách thực hiện |
|----------|----------------|
| **Chỉnh sửa** | Bấm vào icon ✏️ ở góc trên bên phải thẻ công việc để mở cửa sổ cập nhật thông tin |
| **Xóa công việc** | Bấm vào icon 🗑️ màu đỏ → Nhấn **OK** khi hệ thống hỏi xác nhận |

---

## IV. QUYỀN HẠN & BẢO MẬT (PERMISSIONS)

Tùy vào vai trò (Role) của bạn trong hệ thống, quyền hạn thao tác sẽ khác nhau:

| Vai trò | Quyền hạn |
|---------|-----------|
| **Quản trị viên (Admin)** | Có toàn quyền xem, chỉnh sửa, chuyển trạng thái và xóa **tất cả** công việc |
| **Trưởng phòng (Head)** | Có toàn quyền quản lý công việc thuộc phòng ban mình phụ trách và công việc do mình tạo ra/được giao |
| **Nhân viên (User)** | **Được phép:** Tạo mới công việc, chỉnh sửa/chuyển trạng thái công việc do mình tạo hoặc được giao<br>**Hạn chế:** Các công việc không thuộc quyền hạn sẽ có biểu tượng cảnh báo ⚠️ *Chỉ xem*, nút chỉnh sửa/xóa và ô chuyển trạng thái sẽ bị ẩn hoặc vô hiệu hóa |
