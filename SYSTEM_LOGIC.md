# GOLDENFARM ICT Management System — Core Logic & Architecture

> **Bộ nhớ cốt lõi (Core Memory)** cho toàn bộ hệ thống.  
> Mọi AI Assistant / Developer PHẢI đọc kỹ tài liệu này trước khi thực hiện bất kỳ thay đổi nào.

---

## 1. Tổng quan hệ thống

### 1.1 Mục đích
Hệ thống quản lý ICT nội bộ cho doanh nghiệp, bao gồm:
- Quản lý Nhân viên, Thiết bị CNTT, License Key thiết bị
- Hỗ trợ IT (Ticket system)
- Đặt lịch tài nguyên (Xe, Phòng họp) & Đăng ký công tác
- Phê duyệt quy trình động (Approval Workflow)
- Dashboard tổng quan
- **Phiếu lương** (Salary Slips — upload Excel, JSON view)
- **Tài liệu/Tệp tin** (Documents — FTP/SMB/Google Drive file browser + ONLYOFFICE editor)
- **Hồ sơ cá nhân** (Profile — cập nhật thông tin + đổi mật khẩu)
- **Công việc** (Todos — Kanban board, subtasks, phân quyền scope)
- **Phần mềm tổ chức** (Software — quản lý phần mềm/license theo tab)
- **Phân quyền truy cập module** (Permissions — user/role/department permission matrix)

### 1.2 Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 19 + Vite 6 | CSS thuần (CSS Variables) |
| Backend | FastAPI (Python 3.11+) | RESTful API |
| Database | PostgreSQL 16 | PostgreSQL server required (no SQLite) |
| ORM | SQLAlchemy | 30+ tables, no FK constraints |
| Realtime | Server-Sent Events (SSE) | endpoint `/api/events` |
| Auth | SHA-256 hash + Session token | session-based, 16-char token |
| Icons | lucide-react ^1.24 | |
| HTTP | axios ^1.7 | |
| Excel | pandas + openpyxl | Salary import/export |
| SMB | smbprotocol ^1.11 | File browser |
| FTP | aioftp ^0.21 | File browser |
| GDrive | google-api-python-client | File browser |
| ONLYOFFICE | PyJWT + @onlyoffice/document-editor-react | Online document editor |
| PDF | docxtpl + docx2pdf + PyPDF2 | Salary PDF (legacy) |

### 1.3 Giao tiếp
- **RESTful API**: Axios instance với base URL `/api`, không interceptors auth — token gửi qua `sessionStorage`.
- **SSE Realtime**: Frontend kết nối `EventSource('/api/events')`. Dashboard, Booking, Business Trip, Todos, Software sử dụng SSE.
- **No FOREIGN KEY constraints**: Toàn bộ tính toàn vẹn dữ liệu xử lý ở tầng Application (xem mục 4).

---

## 2. Role-Based Access Control (RBAC)

### 2.1 Ba vai trò cơ bản

| Role | Mô tả | Xác định bởi |
|------|-------|-------------|
| `admin` | Quản trị hệ thống | Phòng "Admin" hoặc `seed_users()` |
| `head` | Trưởng phòng | `departments.head_id → employees` |
| `user` | Người dùng thông thường | Mặc định |

- Role được seed từ `auth.py`: nhân viên thuộc phòng "Admin" → `admin`, trưởng phòng → `head`, còn lại → `user`.
- Mật khẩu mặc định: **trùng với mã nhân viên** (hash SHA-256).

### 2.2 Ma trận quyền theo module (mặc định)

| Module | admin/head | user |
|--------|-----------|------|
| **Dashboard** | Xem toàn bộ thống kê + Kanban tất cả tickets | Xem Kanban cá nhân (lịch hôm nay + ticket của tôi) |
| **Nhân viên** | CRUD toàn bộ | ❌ Không truy cập |
| **Thiết bị** | CRUD, cấp phát, thu hồi, bàn giao | ❌ Không truy cập |
| **License Keys (thiết bị)** | CRUD + Bulk import + Scan | ❌ Không truy cập |
| **Tickets** | Xem tất cả, filter, reply, đổi status | Tạo ticket mới, xem ticket của mình |
| **Đặt lịch** | Quản lý tài nguyên (thêm/xoá) | Đặt lịch, xem lịch |
| **Phê duyệt** | Tạo quy trình (template) | Gửi yêu cầu duyệt, duyệt nếu được chỉ định |
| **Quy trình** | CRUD workflow templates | ❌ Không truy cập |
| **Công tác** | Xem tất cả trips | Chỉ xem trip cùng phòng |
| **Phiếu lương** | Xem tất cả, CRUD, bulk gen, import Excel | Xem phiếu lương cá nhân (qua password) |
| **Tài liệu** | Xem tất cả storage configs | Xem storage được phân quyền |
| **Công việc (Todos)** | Xem tất cả, assignee mọi user | Xem personal + department, assignee chỉ mình |
| **Phần mềm** | CRUD categories + items | Xem (nếu được phân quyền) |
| **Phân quyền module** | CRUD user/role/dept permissions | ❌ Không truy cập |

> ⚠️ Quyền truy cập module có thể bị ghi đè bởi `user_permissions`, `role_permissions`, `department_permissions` (xem mục 3.13).

### 2.3 Cơ chế xác thực

```
Frontend gửi: employee_code, password (hoặc email)
Backend: hash SHA-256(password) → so sánh với DB
Tạo token: SHA-256(user_code + ":" + role + ":" + SESSION_SALT)[:16]
Lưu session: token, employee_code, user_role, user_name, user_department → sessionStorage
```
- Hỗ trợ login bằng `employee_code` hoặc email (company + personal).
- Không dùng JWT. Token là hash ngắn 16 ký tự.
- `verify_token()` dùng cho salary admin routes và todos routes.

### 2.4 Frontend Route Guards

```jsx
// App.jsx
function ProtectedRoute({ children }) {
  const token = sessionStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />
  return children
}

function AdminRoute({ children }) {
  const role = sessionStorage.getItem('user_role')
  if (role !== 'admin' && role !== 'head') return <Navigate to="/" replace />
  return children
}
```

**Routes bảo vệ bởi AdminRoute:** `employees`, `equipment`, `workflows`, `salary-slip-admin`, `permissions`.

---

## 3. Business Logic chi tiết theo Module

### 3.1 Module Nhân viên (Employees)

**API prefix:** `/api/employees`

| Endpoint | Chức năng |
|----------|-----------|
| `GET /api/employees` | Danh sách (filter keyword + department). JOIN equipment → `eq_count`, licenses → `license_keys` |
| `GET /api/employees/{id}` | Chi tiết nhân viên |
| `GET /api/employees/{id}/equipment` | Thiết bị đang cấp phát (kèm `lic_count`) |
| `GET /api/employees/by-code/{code}` | Tra cứu theo employee_code |
| `GET /api/employees/departments/list` | Danh sách phòng ban (JOIN departments → head_name, head_code, emp_count) |
| `POST /api/employees` | Tạo mới |
| `PUT /api/employees/{id}` | Cập nhật (chỉ gửi field có thay đổi) |
| `DELETE /api/employees/{id}` | **Xoá Cascade logic** |

**Quy tắc Cascade khi xoá nhân viên:**
```
1. Tickets: SET employee_id=NULL, full_name='', department='', employee_code=''
2. Bookings: SET employee_id=NULL, full_name='', department=''
3. Equipment history: Đánh dấu return_date = today cho các bản ghi chưa trả
4. Equipment: SET employee_id=NULL, issued_date='' (thu hồi về kho)
5. DELETE employees WHERE id=?
```

### 3.2 Module Thiết bị (Equipment)

**API prefix:** `/api/equipment`

**Vòng đời thiết bị:**
```
Nhập kho (create) → Cấp phát (allocate) → Bàn giao (transfer) → Thu hồi (revoke)
```

| Endpoint | Chức năng |
|----------|-----------|
| `GET /api/equipment` | Danh sách (filter: storage=all/in_stock/allocated, employee_id, search). JOIN employees |
| `GET /api/equipment/{id}` | Chi tiết (JOIN employees) |
| `POST /api/equipment` | Tạo mới — tự sinh `TS-{seq:05d}` nếu không có `asset_code` |
| `PUT /api/equipment/{id}` | Cập nhật thông tin |
| `PUT /api/equipment/{id}/allocate` | **Cấp phát**: SET employee_id, ghi equipment_history |
| `PUT /api/equipment/{id}/transfer` | **Bàn giao**: Đóng history cũ (return_date), tạo history mới, chuyển employee_id |
| `PUT /api/equipment/{id}/revoke` | **Thu hồi**: Đóng history, SET employee_id=NULL |
| `GET /api/equipment/{id}/licenses` | License gắn với thiết bị |
| `GET /api/equipment/{id}/history` | Lịch sử bàn giao (kèm old_status, new_status, changed_by) |

**Quy tắc quan trọng:**
- Không validate trùng serial_number.
- Specs lưu dạng pipe-delimited.
- **SSE**: `equipment_created`, `equipment_updated` (action: transfer/revoke/allocate).

### 3.3 Module License Keys (Thiết bị)

**API prefix:** `/api/licenses`

| Endpoint | Chức năng |
|----------|-----------|
| `GET /api/licenses` | Danh sách (JOIN equipment + employees, có search) |
| `GET /api/licenses/stats` | Thống kê: total, has_product, has_expiry |
| `POST /api/licenses` | Tạo license gắn với equipment |
| `PUT /api/licenses/{id}` | Sửa |
| `DELETE /api/licenses/{id}` | Xoá |
| `POST /api/licenses/bulk` | Import hàng loạt (mảng keys + equipment_id + product_name) |
| `POST /api/licenses/scan` | Auto-scan: dò specs/os_info → regex Product ID / Edition |

### 3.4 Module Ticket (Hỗ trợ IT)

**API prefix:** `/api/tickets`

**Status lifecycle:**
```
Chờ xử lý → Đang xử lý → Đã xử lý
                       → Đã hủy
```

| Endpoint | Chức năng |
|----------|-----------|
| `GET /api/tickets` | Danh sách (filter: status, priority, search) — admin |
| `GET /api/tickets/my?employee_id=` | Ticket của một user |
| `GET /api/tickets/stats` | Thống kê: total, pending, max_id |
| `POST /api/tickets` | Tạo mới (status: 'Cho xu ly') |
| `PUT /api/tickets/{id}` | Cập nhật status + resolution + admin_notes |
| `DELETE /api/tickets/{id}` | Xoá |

**SSE events**: `new_ticket`, `update_ticket`, `delete_ticket`.

### 3.5 Module Đặt lịch (Bookings)

**API prefix:** `/api/bookings`

#### 3.5.1 Scheduler Grid
```
Hàng dọc: Resources (Xe, Phòng họp)
Hàng ngang: Thời gian (07:00→19:00, từng 30 phút)
```

| Endpoint | Chức năng |
|----------|-----------|
| `GET /api/bookings` | Danh sách (filter: date, resource_type, status) |
| `POST /api/bookings` | Tạo booking mới |
| `PUT /api/bookings/{id}` | Cập nhật (ghi `completed_at` nếu status→'finished') |
| `GET /api/bookings/resources` | Danh sách resources + booking_count |
| `POST /api/bookings/resources` | Tạo resource mới |
| `DELETE /api/bookings/resources/{id}` | Xoá resource (chỉ khi không có booking nào) |
| `GET /api/bookings/dates` | Danh sách ngày có booking |
| `GET /api/bookings/overlap` | Kiểm tra trùng giờ |

#### 3.5.2 Logic Check Overlap
**Client-side** (`useBookings.js`):
```javascript
const overlapRes = await checkOverlap(resource_id, book_date, start_time, end_time)
if (overlapRes.data?.overlap) return { error: '⛔ Khung giờ này đã có người đặt!' }
```

**Server-side**: Two-phase check — frontend check trước, backend không có overlap check mặc định khi insert.

#### 3.5.3 Real-time Status (4 trạng thái)
| Status | CSS class | Điều kiện |
|--------|-----------|-----------|
| Sắp diễn ra | `.bk-block.upcoming` | `status='active'` AND `start_time` > `now` |
| Đang diễn ra | `.bk-block.active` | `status='active'` AND `start_time` <= `now` AND `end_time` > `now` |
| Đã hết giờ | `.bk-block.expired` | `status='active'` AND `end_time` <= `now` |
| Đã kết thúc | `.bk-block.finished` | `status='finished'` |

#### 3.5.4 Business Trips (Công tác)

**API prefix:** `/api/business-trips`

| Endpoint | Chức năng |
|----------|-----------|
| `GET /api/business-trips` | Filter theo user_code, user_role, user_dept, date range, status. **Phân quyền**: admin xem tất cả, user chỉ xem cùng department |
| `POST /api/business-trips` | Tạo mới (status='active') |
| `PUT /api/business-trips/{id}` | Cập nhật. **Phân quyền**: chỉ người tạo hoặc admin. Ghi `completed_at` nếu status→'finished' |
| `DELETE /api/business-trips/{id}` | Soft-delete: set status='cancelled' |

**SSE events**: `trip_created`, `trip_updated`, `trip_deleted`.

### 3.6 Module Dashboard

**API prefix:** `/api/dashboard`

**Endpoint duy nhất:** `GET /api/dashboard/stats`

Trả về tổng quan: employees, equipment, pending_tickets, active_bookings, tickets_by_dept, tickets_by_status, bookings_today.

### 3.7 Module Phê duyệt (Approvals Workflow)

**API prefix:** `/api`

#### 3.7.1 Workflow Templates
| Endpoint | Chức năng |
|----------|-----------|
| `GET /api/workflows` | Danh sách active templates (kèm steps) |
| `POST /api/workflows` | Tạo template |
| `GET /api/workflows/{id}` | Chi tiết + steps |
| `PUT /api/workflows/{id}` | Cập nhật |
| `DELETE /api/workflows/{id}` | Xoá (cascade steps) |
| `POST /api/workflows/{id}/steps` | Thêm step (auto step_order) |
| `PUT /api/workflows/steps/{id}` | Sửa step |
| `DELETE /api/workflows/steps/{id}` | Xoá step |

**Step types:** `role` (position name) hoặc `specific` (employee_code).

#### 3.7.2 Approval Requests
| Endpoint | Chức năng |
|----------|-----------|
| `POST /api/requests` | Tạo request (status='draft') |
| `GET /api/requests` | Danh sách (filter: status, requester, template, search) |
| `GET /api/requests/{id}` | Chi tiết + logs + template + steps |
| `PUT /api/requests/{id}` | Sửa (chỉ draft) |
| `PUT /api/requests/{id}/submit` | Gửi duyệt (draft → pending) |
| `PUT /api/requests/{id}/cancel` | Huỷ |
| `PUT /api/requests/{id}/approve` | Duyệt (ghi log, nếu hết step → approved) |
| `PUT /api/requests/{id}/reject` | Từ chối (status='rejected') |
| `GET /api/requests/pending?user_code=` | Lấy danh sách cần duyệt |

**SSE events**: `workflow_created`, `workflow_updated`, `request_submitted`, `request_approved`, `request_rejected`.

### 3.8 Module Phòng ban (Departments)

**API prefix:** `/api/departments`

| Endpoint | Chức năng |
|----------|-----------|
| `GET /api/departments` | Danh sách (JOIN employees → head_name, head_code, emp_count) |
| `GET /api/departments/{id}` | Chi tiết |
| `POST /api/departments` | Tạo mới |
| `PUT /api/departments/{id}` | Cập nhật |
| `DELETE /api/departments/{id}` | Xoá |

`departments` table riêng, liên kết logic với `employees.department` qua tên.

### 3.9 Module Phiếu lương (Salary Slips)

**API prefix:** `/api/salary-slips` (admin), `/api/salary` (user)

#### 3.9.1 Admin Endpoints
| Endpoint | Chức năng |
|----------|-----------|
| `GET /api/salary-slips/admin/list` | Danh sách (filter: month, employee_code, department) |
| `GET /api/salary-slips/admin/employees` | Danh sách nhân viên (filter department) |
| `POST /api/salary-slips/admin/create` | Tạo/cập nhật phiếu lương |
| `DELETE /api/salary-slips/admin/{id}` | Xoá |
| `POST /api/salary-slips/admin/bulk-generate` | Bulk generate cho toàn bộ employee |
| `POST /api/salary-slips/admin/upload-salaries` | Upload Excel → lưu JSON vào `salaries` table |
| `POST /api/salary-slips/admin/import-from-excel` | Import Excel → `salary_slips` table |

#### 3.9.2 User Endpoint
| Endpoint | Chức năng |
|----------|-----------|
| `POST /api/salary/verify-and-view` | Xem phiếu lương JSON (verify token + password) |

#### 3.9.3 Bảng dữ liệu
- **salary_slips**: basic_salary, allowances, bonus, deductions, net_salary (quan hệ 1-N với employee)
- **salaries**: employee_code, month, password, data_json (lưu context JSON từ Excel)
- **salary_upload_logs**: Log mỗi lần upload Excel

### 3.10 Module Tài liệu (Documents/Storage)

**API prefix:** `/api/documents`

Hỗ trợ 3 loại storage: FTP, SMB (Windows Share), Google Drive (Service Account).

#### 3.10.1 Storage Config
| Endpoint | Chức năng | Auth |
|----------|-----------|------|
| `GET /api/documents/config` | Danh sách (admin xem tất cả, user chỉ xem được phân quyền) | Role-based filter |
| `GET /api/documents/config/{id}` | Chi tiết config | None |
| `POST /api/documents/config` | Tạo config | `_require_auth` (admin/head) |
| `PUT /api/documents/config/{id}` | Cập nhật | `_require_auth` |
| `DELETE /api/documents/config/{id}` | Xoá + cascade permissions | `_require_auth` |
| `POST /api/documents/test-connection` | Test kết nối (body trực tiếp) | None |
| `POST /api/documents/config/{id}/test` | Test config đã lưu | None |
| `GET /api/documents/departments` | DS phòng ban (cho dropdown) | None |

#### 3.10.2 File Browsing & Download
| Endpoint | Chức năng | Auth |
|----------|-----------|------|
| `GET /api/documents/browse/{id}` | Duyệt thư mục (path/folder_id) | `_check_folder_permission` |
| `GET /api/documents/download` | Download file stream (FTP/SMB/GDrive) | `_check_folder_permission` + `_check_download_allowed` |

#### 3.10.3 Permissions (Nextcloud-style)
Hệ thống phân quyền chi tiết:

- **Target types**: `EVERYONE` (tất cả nhân viên) hoặc `DEPARTMENT` (theo phòng ban)
- **Granular permissions matrix**:
  - `can_read` — Xem nội dung thư mục/tệp
  - `can_write` — Tạo tệp/thư mục mới
  - `can_edit` — Sửa nội dung tệp hiện có
  - `can_delete` — Xoá tệp/thư mục
  - `allow_download` — Cho phép tải xuống
  - `can_reshare` — Chia sẻ lại cho người khác
- **Expiration date**: Mỗi permission có thể đặt ngày hết hạn
- **Inheritance**: Quyền folder cha áp dụng cho folder con (theo `folder_path` prefix)

| Endpoint | Chức năng | Auth |
|----------|-----------|------|
| `GET /api/documents/permissions/{id}` | DS permission (có JOIN department) | `_require_auth` |
| `POST /api/documents/permissions` | Tạo permission (legacy) | `_require_auth` |
| `POST /api/documents/permissions/share` | Tạo/Cập nhật granular permission (EVERYONE/DEPARTMENT) | `_require_auth` |
| `PUT /api/documents/permissions/{perm_id}` | Cập nhật granular permissions (từng field) | `_require_auth` |
| `DELETE /api/documents/permissions/{perm_id}` | Xoá permission | `_require_auth` |

#### 3.10.4 Permission Check Flow
```
admin/head → bypass (full access)
user → checks storage_permissions:
  1. target_type='EVERYONE' → granted
  2. target_type='DEPARTMENT' + match user_dept → granted
  3. role match → granted
  4. employee_code match → granted
  5. Fallback: nếu không có permission nào → DENY
  6. Expiration: kiểm tra expires_at > now
  7. Download: kiểm tra riêng allow_download flag
```

**Cascade**: Xoá storage config → xoá storage_permissions trước.

#### 3.10.5 ONLYOFFICE Document Editor Integration

Tích hợp **ONLYOFFICE Document Server** (`https://office.goldenfarm.vn`) cho phép chỉnh sửa trực tuyến các file Office (.docx, .xlsx, .pptx, .odt, .ods, .odp, .csv, .txt, .rtf, .pdf).

**Kiến trúc:**
```
User Browser → React (OnlyOfficeViewer) → Backend API (config) → ONLYOFFICE Document Server
                                                      ↕                         ↕
                                              JWT-signed config          Download/Upload file
```

**Luồng xử lý:**
1. User click file Office → Frontend gọi `GET /api/documents/onlyoffice/config`
2. Backend check `_check_folder_permission` (can_read) và `_check_can_edit` (can_edit)
3. Backend sinh JWT-signed editor config, tạo temporary download token (5 phút)
4. Frontend load DocsAPI từ ONLYOFFICE server, khởi tạo `DocEditor`
5. ONLYOFFICE server gọi `GET /api/documents/onlyoffice/download?token=` để lấy nội dung file
6. User chỉnh sửa → tự động lưu → ONLYOFFICE gửi webhook về `POST /api/documents/onlyoffice/callback`
7. Callback nhận file đã save → ghi đè lên storage cũ qua `_put_file_bytes()`
8. Backend publish SSE event `document_updated` để UI refresh

**Endpoints:**

| Method | Endpoint | Mô tả | Auth |
|--------|----------|-------|------|
| `GET` | `/api/documents/onlyoffice/config` | Sinh editor config (JWT-signed) | `_check_folder_permission` + `_check_can_edit` |
| `GET` | `/api/documents/onlyoffice/download` | Stream file gốc cho ONLYOFFICE server | Temporary JWT token |
| `POST` | `/api/documents/onlyoffice/callback` | Webhook lưu file sau khi chỉnh sửa | Chỉ xử lý khi status ∈ {2, 6} |

**Cơ chế JWT:**
- Secret key: `MySuperSecret123456` (HS256)
- Download token: hết hạn sau 300 giây (5 phút)
- `can_edit` = `True` → mode `edit`; `False` → mode `view`
- `admin`/`head` luôn có `can_edit = True`

**Frontend component:** `components/OnlyOfficeViewer.jsx`
- Fullscreen overlay, load DocsAPI từ `https://office.goldenfarm.vn/web-apps/apps/api/documents/api.js`
- Phím Escape để đóng, auto destroyEditor khi unmount

### 3.11 Module Auth & Profile

**API prefix:** `/api/auth`

| Endpoint | Chức năng |
|----------|-----------|
| `POST /api/auth/login` | Login (employee_code hoặc email) |
| `POST /api/auth/change-password` | Đổi mật khẩu |
| `GET /api/auth/profile` | Lấy thông tin cá nhân |
| `PUT /api/auth/profile` | Cập nhật hồ sơ (full_name, phone, personal_email) |

### 3.12 Module Công việc (Todos)

**API prefix:** `/api/todos`

| Endpoint | Chức năng |
|----------|-----------|
| `GET /api/todos` | Danh sách todos (filter: scope=all/personal/department, status, priority, search) |
| `GET /api/todos/stats` | Thống kê KPI: total, todo, in_progress, review, completed, overdue |
| `POST /api/todos` | Tạo mới todo + checklist subtasks |
| `PUT /api/todos/{id}` | Cập nhật todo + subtasks |
| `PATCH /api/todos/{id}/status` | Đổi trạng thái nhanh (Kanban drag/move) |
| `DELETE /api/todos/{id}` | Xoá todo & subtasks liên quan |

**Phân quyền:**
- `admin`: thấy tất cả todos, assignee tất cả users, department tất cả phòng ban
- `head`: thấy todos trong phòng ban mình, chỉ assignee cho user cùng phòng
- `user`: chỉ thấy personal todos + department todos của phòng mình, chỉ assignee cho chính mình

**SSE events**: `todo_created`, `todo_updated`, `todo_deleted`.

**Status values**: `todo` → `in_progress` → `review` → `done`

### 3.13 Module Phần mềm (Software)

**API prefix:** `/api/software`

Quản lý danh sách phần mềm/license tổ chức theo tab danh mục. Hỗ trợ upload file hợp đồng (PDF).

#### 3.13.1 Danh mục (Categories/Tabs)
| Endpoint | Chức năng |
|----------|-----------|
| `GET /api/software/categories` | Danh sách tab (kèm item_count) |
| `POST /api/software/categories` | Tạo tab mới (name unique) |
| `PUT /api/software/categories/{cat_id}` | Cập nhật tab |
| `DELETE /api/software/categories/{cat_id}` | Xoá tab (chỉ khi không có item) |

#### 3.13.2 Items
| Endpoint | Chức năng |
|----------|-----------|
| `GET /api/software/categories/{cat_id}/items` | Danh sách item (search by name) |
| `POST /api/software/categories/{cat_id}/items` | Tạo item (name, registered_date, expiration_date, notes) |
| `PUT /api/software/items/{item_id}` | Cập nhật item |
| `DELETE /api/software/items/{item_id}` | Xoá item + file hợp đồng |
| `POST /api/software/items/{item_id}/upload` | Upload file hợp đồng (PDF) |
| `GET /api/software/contracts/{filename}` | Stream file hợp đồng PDF |

**SSE events**: `tab_updated`, `software_updated`.
**Upload dir**: `backend/uploads/contracts/`

### 3.14 Module Phân quyền Module (Permissions)

**API prefix:** `/api/permissions`  
**Frontend page:** `pages/Permissions.jsx` — Route `/permissions` (AdminRoute)

Hệ thống phân quyền truy cập từng module theo 3 chiều:

| Loại | Bảng | Mô tả |
|------|------|-------|
| User permission | `user_permissions` | Ghi đè theo từng nhân viên cụ thể |
| Role permission | `role_permissions` | Áp dụng theo role: admin/head/user |
| Department permission | `department_permissions` | Áp dụng theo phòng ban |

**Ưu tiên kiểm tra**: `user_permissions` > `department_permissions` > `role_permissions`

**Danh sách module có thể phân quyền**: employees, equipment, licenses, tickets, bookings, approvals, workflows, salary, documents, todos, software, permissions, dashboard

---

## 4. Database — PostgreSQL (30 tables)

### 4.1 Danh sách bảng

| Bảng | Mục đích |
|------|----------|
| `employees` | Nhân viên (full_name, department, position, employee_code, phone, email, personal_email, handover_date, status) |
| `equipment` | Thiết bị CNTT (employee_id, equipment_type, specs, os_info, serial_number, asset_code, lifecycle_status, purchase_date, purchase_cost, issued_date) |
| `licenses` | License key thiết bị (equipment_id, license_key, product_name, activated, expiry_date) |
| `equipment_history` | Lịch sử bàn giao (equipment_id, employee_code, employee_name, handover_date, return_date, old_status, new_status, changed_by) |
| `tickets` | Ticket hỗ trợ (employee_id, full_name, department, title, description, priority, status, resolution, admin_notes) |
| `users` | Tài khoản (employee_code UNIQUE, password_hash, role) |
| `resources` | Tài nguyên đặt lịch (type=car/meeting_room, name, description, is_active) |
| `bookings` | Lịch đặt (resource_id, title, employee_id, full_name, department, book_date, start_time, end_time, status, completed_at) |
| `business_trips` | Công tác (employee_code, full_name, department, destination, purpose, start_date, end_date, status, completed_at) |
| `workflow_templates` | Template quy trình (name, description, icon, is_active) |
| `workflow_steps` | Bước duyệt (template_id, step_order, approver_type, approver_value, department_match, can_edit) |
| `approval_requests` | Yêu cầu duyệt (template_id, title, requester_code, requester_name, requester_dept, status, current_step, total_steps, metadata_json) |
| `approval_logs` | Lịch sử duyệt (request_id, step_order, approver_code, approver_name, action, comment) |
| `departments` | Phòng ban (name UNIQUE, head_id → employees.id, description) |
| `salary_slips` | Phiếu lương (employee_code, month, basic_salary, allowances, bonus, deductions, net_salary — UNIQUE(emp, month)) |
| `salaries` | Dữ liệu lương JSON (employee_code PK, month PK, password, data_json) |
| `salary_upload_logs` | Log upload Excel lương (month, filename, uploaded_by, record_count) |
| `storage_config` | Cấu hình storage (name, type=ftp/smb/gdrive, host, port, username, password, remote_path, domain, is_active) |
| `storage_permissions` | Phân quyền folder (storage_id, folder_path, target_type, department, can_read, can_write, can_edit, can_delete, allow_download, can_reshare, expires_at) |
| `software_categories` | Tab danh mục phần mềm (name, icon_name, order_index) |
| `software_items` | Phần mềm/license tổ chức (category_id, name, registered_date, expiration_date, contract_info, notes) |
| `lic_categories` | Danh mục license tổ chức (name, icon, sort_order) |
| `lic_items` | License item (category_id, name, registered_date, expiry_date, contract_file, notes) |
| `todos` | Công việc (title, scope, department, creator_code, assignee_code, status, priority, due_date, tags) |
| `todo_subtasks` | Subtask checklist (todo_id, title, is_completed, sort_order) |
| `user_permissions` | Phân quyền module theo user (employee_code, module, can_view, can_edit) |
| `role_permissions` | Phân quyền module theo role (role, module, can_view, can_edit) |
| `department_permissions` | Phân quyền module theo phòng ban (department, module, can_view, can_edit) |

### 4.2 KHÔNG có FOREIGN KEY
Dự án cố tình không sử dụng FOREIGN KEY constraints. Cascade được xử lý ở application layer.

### 4.3 Cascade quan trọng

| Hành động | Xử lý |
|-----------|-------|
| **Xoá nhân viên** | Tickets → set NULL, Bookings → set NULL, Equipment → thu hồi kho, History → đánh dấu return_date |
| **Xoá workflow template** | DELETE workflow_steps trước, DELETE template sau |
| **Xoá resource** | Chỉ cho phép khi COUNT(bookings)=0 |
| **Xoá storage config** | DELETE storage_permissions trước |
| **Thu hồi/Bàn giao Tbị** | Đóng history cũ, tạo history mới |
| **Xoá software_categories** | Chỉ cho phép khi COUNT(software_items)=0 |
| **Xoá todo** | DELETE todo_subtasks trước |

### 4.4 WAL Mode (PostgreSQL)
```wal_level=logical``` — concurrent read/write.

---

## 5. SSE Event System

### 5.1 Cơ chế

```python
# Backend: sync từ HTTP handler → async event loop
publish_sync("event_name", {"id": 123})

# Frontend: subscribe
new EventSource('/api/events')
es.addEventListener('booking_created', handler)
```

### 5.2 Danh sách sự kiện (22 events)

| Event | File | Khi nào |
|-------|------|---------|
| `new_ticket` | tickets.py | Tạo ticket |
| `update_ticket` | tickets.py | Cập nhật ticket |
| `delete_ticket` | tickets.py | Xoá ticket |
| `booking_created` | bookings.py | Tạo booking |
| `booking_updated` | bookings.py | Cập nhật booking |
| `trip_created` | business_trips.py | Tạo trip |
| `trip_updated` | business_trips.py | Cập nhật trip |
| `trip_deleted` | business_trips.py | Xoá/huỷ trip |
| `equipment_created` | equipment.py | Tạo thiết bị |
| `equipment_updated` | equipment.py | Transfer/revoke/allocate |
| `workflow_created` | approvals.py | Tạo workflow |
| `workflow_updated` | approvals.py | Cập nhật workflow |
| `request_submitted` | approvals.py | Gửi duyệt |
| `request_approved` | approvals.py | Duyệt |
| `request_rejected` | approvals.py | Từ chối |
| `document_updated` | documents.py | ONLYOFFICE lưu file thành công |
| `todo_created` | todos.py | Tạo todo |
| `todo_updated` | todos.py | Cập nhật todo |
| `todo_deleted` | todos.py | Xoá todo |
| `tab_updated` | software.py | Thêm/sửa/xoá tab phần mềm |
| `software_updated` | software.py | Thêm/sửa/xoá item phần mềm |

### 5.3 Frontend SSE subscriptions

| File | Events listened |
|------|----------------|
| `useScheduler.js` | `booking_created`, `booking_updated` (auto-reconnect 3s) |
| `Dashboard.jsx` | Booking & Ticket events (reload stats) |

---

## 6. File Structure

### 6.1 Backend (`backend/`)

```
main.py                          # FastAPI app entry, SSE endpoint /api/events
app/
├── core/
│   ├── database.py              # DB init, schema (30 tables), migrations, indexes
│   ├── db.py                    # DB abstraction layer: fetchall, fetchone, execute, insert
│   ├── auth.py                  # SHA-256 hash, session token, seed_users, authenticate
│   ├── events.py                # SSE pub/sub (async Queue)
│   └── session.py               # PostgreSQL connection configuration
├── models.py                    # SQLAlchemy ORM models (30 tables)
├── routers/
│   ├── auth.py                  # Login, change-password, profile CRUD
│   ├── employees.py             # Employee CRUD + cascade delete
│   ├── equipment.py             # Equipment CRUD + allocate/transfer/revoke
│   ├── tickets.py               # Ticket CRUD
│   ├── bookings.py              # Booking + Resource CRUD
│   ├── business_trips.py        # Business Trip CRUD + permission
│   ├── dashboard.py             # Dashboard stats aggregation
│   ├── licenses.py              # License CRUD + bulk + scan
│   ├── approvals.py             # Workflow templates + approval requests
│   ├── departments.py           # Department CRUD
│   ├── documents.py             # Storage config + browse + permissions (FTP/SMB/GDrive/ONLYOFFICE)
│   ├── salary_slips.py          # Admin salary management + Excel import
│   ├── salary_user.py           # Employee salary JSON view
│   ├── todos.py                 # Todo CRUD + subtasks + Kanban
│   └── software.py              # Software categories + items + contract upload
├── utils/
│   ├── ftp_utils.py             # FTP/SMB upload utility
│   ├── pdf_generator.py         # Salary PDF generation from Excel+Docx template
│   └── seed_demo_data.py        # Seed demo tickets, bookings, trips
uploads/
└── contracts/                   # PDF hợp đồng phần mềm
```

### 6.2 Frontend (`frontend/src/`)

```
App.jsx                          # Routes: ProtectedRoute, AdminRoute (admin/head)
main.jsx                         # ReactDOM + BrowserRouter
services/api.js                  # Axios API client (all endpoints)
hooks/
├── useBookings.js               # Booking CRUD + overlap check
├── useScheduler.js              # Scheduler state + SSE subscription
├── useCurrentTime.js            # Real-time clock
└── useSalarySlip.js             # Salary slip view
components/
├── Layout.jsx                   # Sidebar + Mobile drawer + Change password popup
├── FileViewer.jsx               # Universal file viewer (image, PDF, text, video, audio)
├── FileViewer.css
├── OnlyOfficeViewer.jsx         # ONLYOFFICE document editor overlay
└── booking/                     # 16 booking components
    ├── BookingBlock.jsx, BookingGrid.jsx, BookingDialog.jsx, ...
    ├── BusinessTripGrid.jsx, BusinessTripPanel.jsx, BusinessTripDialog.jsx
pages/
├── Dashboard.jsx                # KPI dashboard + realtime kanban
├── Employees.jsx                # CRUD nhân viên (AdminRoute)
├── Equipment.jsx                # CRUD thiết bị + lịch sử (AdminRoute)
├── Tickets.jsx                  # Ticket hỗ trợ IT
├── Licenses.jsx, Licenses.css   # License key thiết bị
├── Approvals.jsx                # Yêu cầu phê duyệt
├── WorkflowTemplates.jsx        # Template quy trình (AdminRoute)
├── Documents.jsx, Documents.css # File browser + ONLYOFFICE
├── Todos.jsx, Todos.css         # Kanban công việc
├── SalarySlip.jsx, SalarySlip.css  # Xem phiếu lương (user)
├── SalarySlipAdmin.jsx          # Quản lý lương (AdminRoute)
├── Permissions.jsx              # Phân quyền module (AdminRoute)
├── HelpPage.jsx                 # Trang trợ giúp
├── Profile.jsx, Profile.css     # Hồ sơ cá nhân
├── Login.jsx, Login.css         # Đăng nhập
└── booking/
    └── BookingPage.jsx          # Scheduler đặt lịch
styles/
├── booking.css                  # Booking scheduler styles
└── shared.css                   # Shared: .tbl, .panel, .module-header, .ticket-user-*
utils/
├── bookingUtils.js              # isExpired, isUpcoming, getStatusLabel, validateBookingForm
├── formatters.js                # Re-exports từ date.js (backward compat)
├── date.js                      # CENTRALIZED date utils: formatDate, parseDateInput, toISODate, todayISO, SYSTEM_DATE_FORMAT
└── timeUtils.js                 # today(), nearestDate(), etc.
assets/                          # logo.png, background.webp
template/                        # luong.docx, luong.xlsx (salary PDF template)
```

---

## 7. Date Format — QUY TẮC TOÀN CỤC (D13)

**Mọi ngày tháng hiển thị trên UI PHẢI dùng format `DD/MM/YYYY`** qua `formatDate()` từ `utils/date.js` (module tập trung).

- Database lưu ISO `yyyy-mm-dd`
- **KHÔNG dùng** `<input type="date">` (phụ thuộc locale trình duyệt)
- Thay vào đó dùng `<input type="text" placeholder="DD/MM/YYYY">` với `parseDateInput()` để chuyển `DD/MM/YYYY` → `yyyy-mm-dd` trước khi gửi API
- `formatDate()` nhận ISO string, trả về `DD/MM/YYYY[ HH:mm]`

---

## 8. AI Core Directives — MỆNH LỆNH TỐI THƯỢNG

> ⚠️ **CÁC MỆNH LỆNH SAU LÀ BẮT BUỘC. AI VI PHẠM SẼ BỊ REJECT.**

### D1 — ĐỌC KỸ tài liệu này
Trước khi viết bất kỳ API endpoint, component, hay business logic nào: **ĐỌC TOÀN BỘ** file `SYSTEM_LOGIC.md`. Không suy luận — phải dựa trên tài liệu.

### D2 — KHÔNG phá vỡ luồng phân quyền
- Backend: kiểm tra role (`admin`/`head`/`user`) trong các endpoint nhạy cảm.
- Frontend: `AdminRoute` bảo vệ route (check both `admin` và `head`).
- Business trips: kiểm tra `user_role` và `employee_code` trước khi update/delete.

### D3 — BẮT BUỘC kiểm tra cascade khi xoá entity
Khi thêm chức năng xoá cho bất kỳ entity nào:
1. Xác định tất cả bảng tham chiếu đến entity đó.
2. Quyết định: SET NULL hay CASCADE DELETE?
3. Implement trong handler backend — KHÔNG dựa vào DB constraint.

### D4 — KHÔNG tự ý thay đổi database schema
- Chỉ thêm column qua `ALTER TABLE` trong `database.py` (có try/except).
- KHÔNG xoá column — chỉ đánh dấu deprecated.
- Mọi migration PHẢI backward-compatible.

### D5 — SSE event PHẢI được publish cho mọi thay đổi CRUD
Nếu module đã có SSE subscription ở frontend, mọi CREATE/UPDATE/DELETE endpoint PHẢI gọi `publish_sync()`.

### D6 — KHÔNG hard-code employee_id / user_code
Luôn lấy từ `sessionStorage` (frontend) hoặc từ request body/query param (backend).

### D7 — Overlap check PHẢI luôn đi kèm booking create
Two-phase check: Client (`useBookings.js`) + Server (`/api/bookings/overlap`).

### D8 — KHÔNG dùng inline style cho layout
Mọi style phải qua CSS class. Ngoại lệ: dynamic position (top, left, width, height).

### D9 — Xoá code chết
Khi thay thế implementation cũ: xoá import, function, CSS class, prop không còn dùng.

### D10 — KHÔNG tự ý thêm dependency
Nếu cần thêm thư viện npm / PyPI → hỏi lại user.

### D11 — `head` role tương đương `admin` về quyền truy cập
Trong `AdminRoute`: check `role !== 'admin' && role !== 'head'`.
Trong backend: các endpoint admin kiểm tra `role == 'admin'` (chưa có middleware cho `head`).

### D12 — Salary module dùng token verification riêng
Các endpoint salary dùng `require_admin()` với `verify_token()` thay vì chỉ check role từ sessionStorage.

### D13 — Date format DD/MM/YYYY
Xem mục 7.

### D14 — Software module dùng tab-based navigation
Mỗi category là một tab. KHÔNG load tất cả categories cùng lúc — lazy load items theo tab active.

### D15 — Permissions module (3 tầng)
Khi thêm module mới phải đăng ký trong danh sách module của Permissions page. Thứ tự ưu tiên: user > department > role.

---

## 9. PostgreSQL Architecture

> **PostgreSQL là database duy nhất được hỗ trợ** từ phiên bản 2.0 trở đi.

### 9.1 Database Architecture
- SQLAlchemy ORM với PostgreSQL 14+
- `app/core/session.py` — PostgreSQL connection configuration
- `app/core/db.py` — Abstraction layer (PostgreSQL optimized)
- `app/core/database.py` — Schema initialization (PostgreSQL syntax)
- `app/models.py` — ORM models cho 30 tables

### 9.2 Database Connection
```python
# Connection string format
DATABASE_URL=postgresql://user:password@host:port/database

# Environment variable must be set
# SQLite is NOT supported from v2.0 onwards
```

### 9.3 Automatic Schema Creation
- Tables được tự động tạo khi backend khởi động
- `Base.metadata.create_all(bind=engine)` — SQLAlchemy ORM
- Sequences tự động được quản lý bởi PostgreSQL

### 9.4 Data Types Mapping
| SQLite | PostgreSQL | Notes |
|--------|------------|-------|
| `INTEGER PRIMARY KEY` | `SERIAL` | Auto-increment |
| `TEXT` | `TEXT` | Same |
| `REAL` | `DOUBLE PRECISION` | Float numbers |
| `BLOB` | `BYTEA` | Binary data |
| `datetime('now')` | `CURRENT_TIMESTAMP` | Different syntax |

### 9.5 Date/Time Handling
```python
# PostgreSQL - use CURRENT_TIMESTAMP with type cast
execute("UPDATE table SET updated_at=CURRENT_TIMESTAMP::text")

# Python datetime - use ISO format strings
datetime.utcnow().isoformat()  # "2026-07-27T08:19:59.123456"
```

---

> **Tài liệu này có hiệu lực ngay khi được commit.**  
> Cập nhật lần cuối: **2026-07-29**  
> Mọi AI CLI (Cursor, Copilot, Antigravity agent) PHẢI đọc và tuân thủ.  
> Team Dev review: vi phạm → reject ngay.
