# Quy trình chức năng & Luồng dữ liệu — Quản lý Công việc (Todos & Task Kanban)

## I. Giới thiệu

Phân hệ **Quản lý Công việc & Todos** cho phép người dùng tạo, theo dõi và phối hợp công việc theo mô hình bảng Kanban. Hệ thống hỗ trợ ba cấp vai trò (User / Head / Admin), hai phạm vi (Cá nhân & Phòng ban), và luồng trạng thái bốn bước kèm tuỳ chọn **Hủy** dành riêng cho cấp quản lý.

---

## II. Vai trò & Quyền hạn

### 1. Người dùng thường (User)

| Hành vi | Phạm vi cho phép |
|---------|-----------------|
| Xem công việc | Cá nhân (do mình tạo hoặc được giao) + Công việc phòng ban |
| Tạo mới | Cá nhân (chỉ giao cho chính mình) |
| Chỉnh sửa | Công việc mình tạo hoặc được giao |
| Chuyển trạng thái | Công việc mình tạo hoặc được giao |
| Xóa | **Không được phép** |
| Hủy công việc | **Không được phép** (chỉ admin/head) |

### 2. Trưởng phòng (Head)

| Hành vi | Phạm vi cho phép |
|---------|-----------------|
| Xem công việc | Cá nhân + Toàn bộ công việc phòng ban |
| Tạo mới | Cá nhân + Phòng ban (**chỉ giao cho nhân viên trong phòng**) |
| Chỉnh sửa | Công việc cá nhân + Công việc phòng ban mình quản lý |
| Chuyển trạng thái | Công việc cá nhân + Công việc phòng ban mình quản lý |
| Xóa | Công việc phòng ban mình quản lý + Công việc cá nhân do mình tạo |
| Hủy công việc | **Được phép** |

### 3. Quản trị viên (Admin)

| Hành vi | Phạm vi cho phép |
|---------|-----------------|
| Xem | Toàn bộ hệ thống (mọi scope, mọi phòng ban) |
| Tạo mới | Mọi phòng ban, giao cho bất kỳ ai |
| Chỉnh sửa | Mọi công việc |
| Chuyển trạng thái | Mọi công việc |
| Xóa | Mọi công việc |
| Hủy công việc | **Được phép** |

---

## III. Quy trình nghiệp vụ (Task Lifecycle)

### 1. Tạo công việc (Create)

1. Người dùng nhấn **+ Tạo công việc mới**.
2. Hệ thống kiểm tra quyền: User chỉ tạo personal; Head tạo personal + department (chỉ giao cho nv trong phòng); Admin không giới hạn.
3. Nhập các trường bắt buộc: *Tên công việc*, *Phạm vi*, *Độ ưu tiên*.
4. Nhập các trường tùy chọn: *Mô tả*, *Người thực hiện*, *Hạn hoàn thành*, *Tags*, *Subtask checklist*.
5. Gửi POST `/api/todos` → backend validate session + quyền → INSERT vào `todos` + `todo_subtasks` → publish SSE event `todo_created`.
6. Frontend nhận SSE → tự động refetch danh sách → Kanban cập nhật realtime.

### 2. Chuyển trạng thái trên Kanban

Công việc đi qua 4 trạng thái theo luồng chuẩn:

```
Cần làm (todo) → Đang thực hiện (in_progress) → Chờ duyệt (review) → Đã hoàn thành (completed)
```

Ngoài ra, Admin/Head có thể chuyển về **Hủy (cancelled)** bất kỳ lúc nào.

**Cách thao tác:**
- **Cách 1 (dropdown):** Chọn trạng thái mới từ `<select>` trên thẻ Kanban.
- **Cách 2 (trong modal chỉnh sửa):** Mở modal → đổi status → lưu.

**Kiểm tra quyền:**
- Frontend gọi `canChangeStatus(todo)` để enable/disable dropdown.
- Backend `PATCH /api/todos/{id}/status` kiểm tra role + scope + department.
- Khi thành công → publish SSE `todo_updated` (cả vài frontend đang mở cùng lúc đều cập nhật).

### 3. Chỉnh sửa công việc (Edit)

1. Nhấn icon ✏️ trên thẻ → modal **Chỉnh sửa Công việc**.
2. Frontend kiểm tra `canEditTodo(todo)` → nếu không có quyền, icon không hiện hoặc hiện ⚠️.
3. Sửa các trường (title, description, assignee, priority, due_date, tags, subtasks).
4. Gửi PUT `/api/todos/{id}` → backend validate quyền tương tự create → UPDATE `todos` + DELETE + INSERT lại `todo_subtasks` → publish SSE `todo_updated`.

### 4. Xóa công việc (Delete)

1. Nhấn icon 🗑️ trên thẻ → confirm dialog.
2. Frontend kiểm tra `canDeleteTodo(todo)`:
   - User: **không có quyền xóa**.
   - Head: được xóa công việc phòng ban mình quản lý + công việc cá nhân do mình tạo.
   - Admin: xóa mọi công việc.
3. Gửi DELETE `/api/todos/{id}` → backend validate → DELETE `todo_subtasks` + DELETE `todos` → publish SSE `todo_deleted`.

### 5. Quản lý Subtask Checklist

- **Thêm:** Nhập tên → Enter hoặc nhấn "Thêm".
- **Toggle hoàn thành:** Check/uncheck checkbox → cập nhật `is_completed` (0/1).
- **Xóa:** Nhấn icon X trên từng subtask.
- **Lưu:** Subtask chỉ được lưu khi user nhấn **Tạo mới** hoặc **Lưu thay đổi** (dữ liệu subtask gửi kèm trong payload).
- **Hiển thị progress:** Trên thẻ Kanban hiển thị thanh tiến trình `(done/total) %`.

### 6. Realtime SSE (Server-Sent Events)

- Khi có bất kỳ thay đổi nào (tạo/sửa/xóa), backend publish event qua `events.publish()`.
- Frontend kết nối SSE tại `GET /api/events` ngay khi mount.
- Sự kiện nhận được → gọi `fetchData()` refetch toàn bộ danh sách.
- Nếu mất kết nối → tự động reconnect sau 3 giây.

### 7. Thống kê & Overdue

- Stats được tính riêng cho từng user (dựa trên scope + department + role).
- **Overdue:** Công việc có `due_date < today` và `status NOT IN ('completed', 'cancelled')`.
- Nhấn vào từng thẻ KPI sẽ kích hoạt bộ lọc trạng thái tương ứng.
- Nhấn vào thẻ **Quá hạn** → lọc `status=all` + `priority=urgent` (hiển thị toàn bộ công việc quá hạn).

---

## IV. Quy tắc nghiệp vụ (Business Rules)

### Quy tắc giao việc (Assignee)

- **User:** Chỉ được giao việc cho chính mình (`assignee_code == creator_code`).
- **Head:** Có thể giao việc cho bất kỳ nhân viên nào trong phòng ban mình quản lý.
- **Admin:** Có thể giao việc cho bất kỳ ai trong hệ thống.

### Quy tắc phạm vi (Scope)

- **personal:** Chỉ người tạo và người được giao có quyền xem/chỉnh sửa.
- **department:** Toàn bộ thành viên trong phòng ban đều thấy được.
- Admin thấy tất cả, không giới hạn phòng ban.

### Quy tắc trạng thái

- Không có ràng buộc thứ tự: có thể chuyển từ bất kỳ trạng thái nào sang bất kỳ trạng thái nào (miễn có quyền).
- **cancelled:** Chỉ Admin và Head có quyền chọn. User không thấy option này trong dropdown.
- Khi công việc ở trạng thái `completed` hoặc `cancelled`, không còn bị tính là overdue.

### Quy tắc xóa

- User thường **không thể xóa** bất kỳ công việc nào.
- Head không thể xóa công việc cá nhân của người khác nếu không thuộc phòng ban mình.
- Khi xóa, subtask liên quan cũng bị xóa theo (CASCADE qua application code).

### Quy tắc hiển thị

- Công việc `completed` luôn được xếp cuối cùng trong danh sách (ORDER BY `CASE WHEN status = 'completed' THEN 1 ELSE 0 END`).
- Thẻ quá hạn có màu đỏ cảnh báo (`is-overdue`).
- Nếu user không có quyền edit/delete, thẻ hiển thị ⚠️ và button bị ẩn hoặc disabled.

---

## V. Collaboration — Bình luận, Mentions & File đính kèm

Phân hệ **Collaboration** cho phép các thành viên trao đổi trực tiếp trên từng công việc qua bình luận, nhắc nhau bằng `@mention`, và đính kèm file để chia sẻ tài liệu.

### 1. Kiến trúc dữ liệu

| Bảng | Mục đích |
|------|----------|
| `comments` | Lưu nội dung bình luận của người dùng trên từng Todo |
| `attachments` | Lưu thông tin file đính kèm (tên, loại, kích thước, URL) |
| `notifications` | Lưu thông báo khi user bị mention trong bình luận |

### 2. API Endpoints

#### Comments

| Endpoint | Method | Chức năng |
|----------|--------|-----------|
| `/api/todos/{id}/comments` | GET | Lấy danh sách bình luận (kèm `full_name` của người tạo) |
| `/api/todos/{id}/comments` | POST | Tạo bình luận mới |

**Luồng POST comment:**
1. Frontend gửi `POST /api/todos/{id}/comments` với body `{ "content": "Nội dung @user_code" }`.
2. Backend verify session → verify todo tồn tại → INSERT vào `comments`.
3. Parse nội dung bằng regex `@(\w[\w.-]*)` để tìm danh sách `user_code` được mention.
4. Với mỗi mention hợp lệ (user tồn tại trong `employees`), INSERT bản ghi vào `notifications`.
5. Publish SSE event `comment_added` → frontend cập nhật realtime.
6. Trả về comment object kèm `full_name`.

#### Attachments

| Endpoint | Method | Chức năng |
|----------|--------|-----------|
| `/api/todos/{id}/attachments` | GET | Danh sách file đính kèm (kèm `uploader_name`) |
| `/api/todos/{id}/attachments` | POST | Upload file (multipart/form-data) |
| `/api/attachments/{id}` | DELETE | Xóa file (chỉ uploader hoặc admin) |
| `/api/uploads/todos/{filename}` | GET | Serve/download file |

**Luồng POST attachment:**
1. Frontend gửi `POST /api/todos/{id}/attachments` với `multipart/form-data` (field name: `file`).
2. Backend verify session → verify todo → validate file:
   - Định dạng cho phép: PDF, DOCX, XLSX, JPG, PNG.
   - Dung lượng tối đa: **10MB/file**.
3. File được lưu tại `uploads/todos/{uuid}.{ext}` với tên random (tránh xung đột).
4. INSERT metadata vào `attachments`, publish SSE `attachment_added`.
5. Trả về attachment object.

**Luồng DELETE attachment:**
1. Frontend gửi `DELETE /api/attachments/{id}`.
2. Backend verify session → kiểm tra quyền (chỉ uploader hoặc admin).
3. Xóa file vật lý trên disk → DELETE DB record → publish SSE `attachment_deleted`.

### 3. Realtime SSE Events (Collaboration)

| Event | Payload | Trigger |
|-------|---------|---------|
| `comment_added` | `{ todo_id, comment_id, user_code }` | Khi có comment mới |
| `attachment_added` | `{ todo_id, attachment_id, file_name }` | Khi có file mới được upload |
| `attachment_deleted` | `{ todo_id, attachment_id }` | Khi file bị xóa |

### 4. Notifications (Mentions)

- Khi user bị `@mention` trong comment, hệ thống tự động INSERT vào bảng `notifications`.
- Mỗi notification bao gồm: `user_code` (người nhận), `todo_id`, `message` (VD: *"Nguyễn Văn A đã nhắc đến bạn trong công việc #42"*), `is_read` (mặc định 0).
- Frontend có thể gọi API riêng để lấy danh sách notifications cho user hiện tại.

### 5. Business Rules — Collaboration

| Quy tắc | Mô tả |
|---------|-------|
| **Quyền xem comment/attachment** | Bất kỳ ai có quyền xem Todo đều xem được comments & attachments của Todo đó |
| **Quyền tạo comment** | Bất kỳ ai có quyền xem Todo đều có thể bình luận |
| **Quyền upload file** | Bất kỳ ai có quyền xem Todo đều có thể upload file |
| **Quyền xóa file** | Chính người upload hoặc Admin mới được xóa |
| **Giới hạn file** | Max 10MB, chỉ chấp nhận: `.pdf .docx .xlsx .jpg .jpeg .png` |
| **@mention** | Phân biệt hoa/thường (exact match với `employee_code`) |
| **Notification is_read** | Mặc định `false` (0) khi tạo, frontend đánh dấu đã đọc sau |

---

## VI. Hướng phát triển (Future Enhancements)

### 1. Drag & Drop trực tiếp trên Kanban

Hiện tại chỉ dùng dropdown để chuyển trạng thái. Có thể nâng cấp lên kéo thả thẻ giữa các cột bằng thư viện `react-beautiful-dnd` hoặc `@dnd-kit/core` để tăng trải nghiệm.

### 2. Nhắc nhở & Thông báo (Notifications mở rộng)

- Gửi email/in-app notification khi:
  - Có công việc mới được giao.
  - Công việc sắp đến hạn (reminder N ngày trước due_date).
  - Công việc bị quá hạn.
  - File mới được đính kèm.
- Có thể tích hợp cron job backend quét hàng ngày.

### 3. Báo cáo & Analytics nâng cao

- Dashboard tổng quan cho Head/Admin: số lượng công việc theo phòng ban, tỷ lệ hoàn thành đúng hạn, top người dùng hiệu suất cao.
- Xuất báo cáo Excel/PDF định kỳ.
- Biểu đồ xu hướng (line chart) số lượng công việc tạo mới / hoàn thành theo tuần/tháng.

### 4. Rich Text & File Preview trong Comments

- Hỗ trợ Markdown/rich text editor cho nội dung bình luận.
- Xem trước file PDF, hình ảnh ngay trong modal Todo.
