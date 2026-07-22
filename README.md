# GOLDENFARM ICT Management System

Hệ thống quản lý ICT nội bộ — Quản lý nhân viên, thiết bị, license phần mềm, ticket hỗ trợ IT và đặt lịch xe/phòng họp.

## Tech Stack

| Tầng | Công nghệ |
|------|-----------|
| **Backend** | FastAPI (Python 3.11+) + SQLite (WAL mode) |
| **Frontend** | React 19 + Vite 6 + React Router 7 |
| **HTTP Client** | Axios 1.7 |
| **Realtime** | Server-Sent Events (SSE) |
| **Icons** | lucide-react (50+ icons) |
| **CSS** | Thuần CSS (CSS Custom Properties — dark/light mode) + `shared.css` cho pattern dùng chung |
| **Storage** | SMB (`pysmb`), FTP (`ftplib`), Google Drive (`google-api-python-client`, `google-auth`) |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React 19)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │  Pages   │  │Components│  │  Hooks   │  │   Utils     │ │
│  │ (8 page) │  │(14 comp) │  │ (3 hooks)│  │(booking +   │ │
│  │          │  │          │  │          │  │ timeUtils)  │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────────────┘ │
│       └──────────────┴─────────────┘                        │
│                        │ Axios                              │
│                   ┌────┴────┐                               │
│                   │  api.js │                               │
│                   └────┬────┘                               │
└────────────────────────┼────────────────────────────────────┘
                         │ HTTP (proxy /api → :8080)
                         │ SSE  (/api/events)
┌────────────────────────┼────────────────────────────────────┐
│              Backend (FastAPI)                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │  Auth    │  │ Routers  │  │  Core    │  │   Utils     │ │
│  │ JWT-free │  │(8 modules)│  │ DB/Events│  │ Seed/Import │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────────┘ │
│                         │                                    │
│                    ┌────┴────┐                               │
│                    │ SQLite  │                               │
│                    │company.db│                              │
│                    └─────────┘                               │
└──────────────────────────────────────────────────────────────┘
```

## Features

### 📊 Dashboard
- **Admin**: 6 thẻ thống kê (NV, thiết bị, ticket pending, booking active), biểu đồ ticket theo phòng ban/trạng thái, danh sách booking hôm nay
- **User**: Kanban ticket cá nhân, lịch đặt của user, queue position trong ticket

### 👥 Quản lý nhân viên (admin)
- Bảng + filter phòng ban + tìm kiếm realtime
- Panel chi tiết inline-edit
- Modal thêm/sửa
- Cascade: xoá NV → thu hồi thiết bị về kho, giữ lại ticket/booking (set NULL)

### 🖥️ Quản lý thiết bị — Enterprise UI (admin)
- **Layout**: Header → 4 KPI Stats cards → Sticky Toolbar → Data Grid → Detail Drawer → Form Modal
- **Stats cards**: Tổng thiết bị, Đang sử dụng, Trong kho, Cần bảo trì — semantic colors, hover animation
- **Toolbar**: Sticky position, search debounce (300ms) + clear button, 3 dropdown filters (type/status/health), density toggle, column visibility, refresh
- **Data Grid**: Sortable columns (click header), selectable checkboxes (individual + select-all), three-dot action menu per row, sticky header, pagination (15/page), loading skeleton (5 rows), empty state illustration
- **Detail Drawer**: Slide-in từ phải, sections (thông tin chung, thông số kỹ thuật, mô tả, ghi chú, lịch sử), actions (cấp phát/thu hồi/sửa), employee search dropdown
- **Form Modal**: Centered overlay + backdrop blur, sections (chung, kỹ thuật, ngày cấp, ghi chú), validation
- **Icons**: lucide-react (Monitor, Laptop, Printer, CheckCircle, v.v.) — không dùng emoji
- **Phân tích thông số**: CPU, RAM, Ổ cứng, HĐH (từ specs string), hiển thị dạng card với border-left color
- **Cấp phát**: Search dropdown nhân viên (giữ nguyên API)
- **Thu hồi về kho** (giữ nguyên API)
- **Lịch sử bàn giao** (handover/return date) với timeline UI
- **Density**: 3 mức (compact/normal/comfortable), lưu vào localStorage
- **Column visibility**: Toggle cột, lưu vào localStorage
- **Keyboard**: Escape đóng menu/modal
- License gán theo thiết bị

### ✅ Quy trình phê duyệt (Approval Workflow)

Hệ thống phê duyệt đa cấp linh hoạt, cho phép định nghĩa luồng duyệt động với nhiều bước.

**Workflow Templates (Admin):**
- Tạo/sửa/xoá mẫu quy trình phê duyệt
- Thêm/sửa/xoá các bước duyệt trong quy trình
- Mỗi bước có thể là duyệt theo **chức vụ** (role) hoặc **chỉ định cụ thể** (specific)
- Tuỳ chọn **cùng bộ phận**: chỉ người cùng phòng ban mới được duyệt
- Bật/tắt quy trình (is_active)
- Chỉ các quy trình có ít nhất 1 bước duyệt mới hiển thị khi tạo phiếu

**Approval Requests (User):**
- **Tạo phiếu yêu cầu**: chọn quy trình, nhập tiêu đề & mô tả
- Trạng thái: `Nháp` → `Chờ duyệt` → `Đang duyệt` → `Đã duyệt` / `Từ chối`
- Gửi duyệt: chuyển từ Nháp → Chờ duyệt
- Thu hồi: huỷ phiếu khi đang chờ
- Xem nhật ký phê duyệt theo timeline

**Luồng duyệt (Approver):**
- Tab "Cần duyệt" hiển thị các phiếu đang chờ xử lý
- Mỗi bước duyệt chỉ người đúng chức vụ/phòng ban mới thao tác được
- Duyệt: chuyển sang bước tiếp theo (hoặc hoàn tất nếu là bước cuối)
- Từ chối: kết thúc phiếu với trạng thái `rejected`
- SSE realtime: thông báo khi có phiếu mới cần duyệt

### 💰 Quản lý phiếu lương (Salary Slip)

- **Admin — 3 Tab UI** (`SalarySlipAdmin.jsx`):
  1. **Nhân viên (Employees)**: Search typeahead (tìm theo mã/tên NV) → chọn kết quả → form chỉnh sửa. Chỉ hiển thị NV đã có phiếu lương trong tháng đang chọn. Các field chia theo section: Thông tin NV, Mức lương & Công, Thu nhập (A), Khấu trừ (B) & Thực nhận, Theo dõi phép năm & Giờ tích lũy, Ghi chú. Nút Lưu (save JSON), Xuất PDF (có password), Xóa.
  2. **Import Excel**: Tải file mẫu → chọn file .xlsx/.xls → tự động parse cột lương/thuế/phép → lưu JSON vào `salaries` → tạo user + employee record nếu chưa có. Hỗ trợ ghi đè nếu tháng đã tồn tại.
  3. **Lịch sử (History)**: Danh sách các lần upload Excel (tháng, filename, số NV, người upload, thời gian).
- **Admin — Xuất PDF**: Xuất PDF có mật khẩu (template `luong.docx` → LibreOffice headless, fallback `docx2pdf` trên Windows) cho từng NV hoặc batch toàn bộ phòng ban → file ZIP
- **Employee — Xem phiếu lương**: Chọn tháng, nhập mật khẩu (nếu có) → xem JSON render dạng HTML (.pdf-a4-portrait)
- **Employee — Tải PDF**: Tải phiếu lương PDF có mật khẩu
- **Employee — Lịch sử**: Xem danh sách các tháng đã có phiếu lương, chuyển nhanh giữa các tháng

### 🔐 Phân quyền hệ thống (admin/head)

- **Giao diện 3 tab** (`Permissions.jsx`): Phân quyền Module, Chia sẻ Tài liệu, Vai trò người dùng
- **Phân quyền Module**: Chọn user → grid module theo nhóm Quản trị/Nghiệp vụ → toggle `can_view`/`can_edit`
- **Chia sẻ Tài liệu**: Chọn kho tài liệu → thêm/xoá phòng ban với quyền Đọc/Ghi → user trong phòng ban tự động thấy dữ liệu
- **Vai trò người dùng**: Bảng danh sách user với role badges, dropdown đổi role trực tiếp
- **Server-side enforcement**: Document endpoints kiểm tra `verify_token` + `_check_folder_permission`; admin/head bypass toàn bộ

### 🔑 Quản lý License (admin)
- **License Keys**: Bảng danh sách + search, inline edit, bulk import (chọn NV → thiết bị → paste danh sách key), auto scan từ specs/os_info (Product ID, Edition)
- **License Categories & Items**: Quản lý danh mục license theo tab, mỗi mục có tên, ngày đăng ký/hết hạn, thông tin hợp đồng, upload file PDF hợp đồng

### 📦 Quản lý phần mềm (admin)
- **Software Categories**: Quản lý danh mục phần mềm dạng tab, có icon và thứ tự sắp xếp
- **Software Items**: Mỗi mục có tên, ngày đăng ký/hết hạn, thông tin hợp đồng, upload file PDF hợp đồng
- **Contract Upload**: Upload file PDF hợp đồng trực tiếp cho từng mục

### 🎫 Ticket hỗ trợ
- **User**: Form tạo ticket + danh sách ticket của mình (accordion), xem queue position
- **Admin**: Filter status/priority/search, card list, panel reply (đổi status, resolution, admin notes)
- **Realtime**: SSE tự động cập nhật khi có ticket mới/thay đổi

### 📁 Quản lý tài liệu (Documents) — SMB / FTP / Google Drive
- **User UI trực quan**: Giao diện dạng card grid (hiển thị file dạng thumbnail lớn) kết hợp list view, cho phép chuyển đổi linh hoạt
- **File Preview**: Xem trước ảnh, PDF, video, audio, text, code ngay trong trình duyệt (FileViewer component)
- **Search file**: Tìm kiếm file/thư mục theo tên realtime
- **Cấu hình storage**: SMB (Windows Share), FTP, Google Drive (Service Account)
- **Test kết nối** trước khi lưu
- **Duyệt cây thư mục** với breadcrumb navigation
- **Phân quyền Nextcloud-style** (`Permissions.jsx`): 
  - **Everyone**: Cấp quyền cho tất cả nhân viên với granular permissions matrix
  - **Theo phòng ban**: Cấp quyền chi tiết cho từng phòng ban
  - **Granular permissions**: Read (xem), Create/Write (tạo), Edit (sửa), Delete (xoá), Allow Download (cho phép tải), Reshare (chia sẻ lại)
  - **Expiration date**: Đặt ngày hết hạn cho từng permission
  - **Permission inheritance**: quyền folder cha áp dụng cho folder con
  - **Server-side enforcement**: Kiểm tra `can_read` khi browse, `allow_download` khi download; admin/head bypass toàn bộ

### 📅 Đặt lịch — Scheduler Grid (Xe & Phòng họp)
- **Grid scheduling**: Trục dọc time slots 07:00→19:00 (bước 30 phút), trục ngang resources
- **Booking Block**: Block màu chiếm đúng khung giờ, hiển thị title + tên NV + giờ
- **Drag & Drop**: Kéo thả booking sang resource/giờ khác
- **Resize**: Kéo handle dưới block để thay đổi thời gian kết thúc
- **Context Menu**: Chuột phải → Chỉnh sửa / Kết thúc / Hủy
- **Keyboard shortcuts**: `Ctrl+N` (tạo mới), `F5` (làm mới), `Esc` (đóng), `Ctrl+E` (sửa)
- **Dark mode**: Toggle sáng/tối, lưu preference vào sessionStorage
- **Responsive**: Desktop (grid đầy đủ), Mobile (drawer filter, grid cuộn)
- **Real-time**: SSE cập nhật booking realtime
- **Vạch thời gian thực**: Đường đỏ chỉ giờ hiện tại trên grid (cập nhật 30s)
- **3 trạng thái active cùng ngày**:
  - 🟡 **Sắp diễn ra** (`start_time` chưa đến) — dashed border, không drag/resize/finish
  - 🟢 **Đang sử dụng** — đang trong khung giờ
  - ⏰ **Đã hết giờ** (`end_time` đã qua) — opacity thấp, gạch ngang title
- **Overlap detection**: Client-side (gọi API check) + Server-side (SQL)

## Phân quyền (3 lớp)

### Lớp 1 — Vai trò người dùng (`users.role`)

| Vai trò | Dashboard | Employees | Equipment | Licenses | Tickets | Bookings | Documents | Phân quyền |
|---------|-----------|-----------|-----------|---------|---------|----------|-----------|------------|
| **admin** | ✅ Tổng quan | ✅ CRUD | ✅ CRUD | ✅ CRUD | ✅ Xử lý | ✅ Quản lý resource | ✅ Cấu hình + phân quyền | ✅ Quản lý toàn bộ |
| **head** | ✅ Tổng quan | ✅ Xem | ✅ Xem | ✅ Xem | ✅ Xử lý | ✅ Quản lý resource | ✅ Cấu hình + phân quyền | ✅ Chia sẻ tài liệu |
| **user** | ✅ Cá nhân | ❌ | ❌ | ❌ | ✅ Xem/tạo | ✅ Đặt lịch | ✅ Duyệt tài liệu | ❌ |

### Lớp 2 — Module permissions (`user_permissions`)

Phân quyền chi tiết theo module cho từng user (admin quản lý qua giao diện **Phân quyền → Phân quyền Module**):

- **Quản trị** (admin-only modules): Nhân viên, Thiết bị, License Keys, Quy trình, Quản lý lương — chỉ `can_view`, `can_edit` luôn disabled cho non-admin
- **Nghiệp vụ**: Tickets, Phê duyệt, Lịch, Tài liệu, Phiếu lương — có thể bật/tắt `can_view` và `can_edit`

### Lớp 3 — Document permissions (`storage_permissions`)

Chia sẻ tài liệu theo phòng ban (quản lý qua giao diện **Phân quyền → Chia sẻ Tài liệu**):

- **Target types**: `EVERYONE` (tất cả nhân viên) hoặc `DEPARTMENT` (theo phòng ban)
- **Granular permissions**: Read, Create/Write, Edit, Delete, Allow Download, Reshare — cấu hình dạng checkbox matrix
- **Expiration**: Mỗi permission có thể đặt ngày hết hạn, tự động vô hiệu khi quá hạn
- **Permission inheritance**: quyền folder cha áp dụng cho folder con
- **Kiểm tra server-side**: `_check_folder_permission` (can_read) khi browse, `_check_download_allowed` (allow_download) khi download
- Admin/head **luôn bypass** mọi kiểm tra quyền — thấy toàn bộ dữ liệu

## Installation

### Yêu cầu
- Python 3.11+
- Node.js 18+

### Backend
```bash
cd backend
pip install -r requirements.txt
```

### Frontend
```bash
cd frontend
npm install
```

## Cấu hình Database (`.env`)

File `.env` tại thư mục gốc:

```env
# DATABASE_URL=sqlite:///backend/company.db
```

- **Chạy trên PC local**: **Comment dòng `DATABASE_URL` lại** (thêm `#` ở đầu) — hệ thống tự động tính đường dẫn tuyệt đối đến `backend/company.db`
- **Deploy lên VPS (Docker)**: **Bỏ comment** (xóa `#`) — dùng relative path cho SQLAlchemy trong container

> 💡 Lý do: Trên PC, chạy backend từ thư mục `backend/`, relative path `backend/company.db` sẽ sai thành `backend/backend/company.db`. Khi comment, code tự tính path tuyệt đối đúng.

## Usage

### Cách 1: Chạy trên PC Local

**Bước 1** — Mở Terminal 1 — Khởi động Backend:
```bash
cd backend
python -m uvicorn main:app --reload --port 8080
```

**Bước 2** — Mở Terminal 2 — Khởi động Frontend:
```bash
cd frontend
npm run dev
```

Mở trình duyệt tại **`http://localhost:5173`**.

### Cách 2: Deploy bằng Docker (VPS)

```bash
docker compose up -d --build
```

- Frontend: `http://<VPS_IP>:8088`
- Backend API: `http://<VPS_IP>:8000`

> Đảm bảo đã **bỏ comment** dòng `DATABASE_URL` trong `.env` trước khi build Docker.

## Hybrid Authentication (Argon2id + SHA-256)

Hệ thống hỗ trợ **đa thuật toán mã hóa** để tương thích với dữ liệu user từ Nextcloud cũ:

| Thuật toán | Đối tượng | Cơ chế |
|-----------|-----------|--------|
| **SHA-256** | User mới tạo (seed_users), admin | `hashlib.sha256(password).hexdigest()` |
| **Argon2id** | User import từ Nextcloud (`oc_users.csv`) | Verify bằng `argon2-cffi`, tự động **re-hash** sang SHA-256 sau lần đăng nhập đầu tiên |

### Import Users từ Nextcloud

Script migration: `backend/app/utils/import_oc_users.py`

```bash
cd backend
python -m app.utils.import_oc_users
# hoặc chỉ định file CSV khác:
python -m app.utils.import_oc_users --csv /path/to/oc_users.csv
```

Chức năng:
- Đọc CSV → upsert `employees` (employee_code, full_name, department)
- Lưu nguyên hash argon2id vào `users.password_hash`
- Tự động gán role (`admin` nếu department = "Admin", `head` nếu là trưởng phòng, còn lại `user`)
- User import có thể đăng nhập bằng **mật khẩu Nextcloud cũ** ngay lập tức

## Tài khoản mặc định

| Mã NV | Vai trò | Mật khẩu |
|-------|---------|----------|
| `admin` | admin | `admin` |
| `NV001` | user | `NV001` |

Database `company.db` đã bao gồm dữ liệu mẫu + 355 user thật từ Nextcloud. Để seed lại:
```bash
cd backend
python -c "from app.core.auth import seed_users; from app.core.database import get_conn; conn=get_conn(); seed_users(conn); conn.close()"
```

## Project Structure

```
goldenfarm-ict-web/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── database.py        # DB init, schema, indexes, seed resources
│   │   │   ├── auth.py            # Xác thực (simple token), seed users
│   │   │   └── events.py          # SSE event bus (async generator)
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py            # Login, password, profile, user/permission admin
│   │   │   ├── employees.py       # CRUD NV + departments + cascade delete
│   │   │   ├── departments.py     # Department CRUD
│   │   │   ├── equipment.py       # CRUD + transfer/revoke/allocate + history
│   │   │   ├── tickets.py         # CRUD + queue position + SSE events
│   │   │   ├── bookings.py        # CRUD + resources + dates + overlap
│   │   │   ├── business_trips.py  # CRUD + role-based filtering
│   │   │   ├── dashboard.py       # GET /api/dashboard/stats
│   │   │   ├── licenses.py        # Keys + categories/items + bulk/scan + contract upload
│   │   │   ├── software.py        # Software categories/items + contract upload
│   │   │   ├── approvals.py       # Workflows + steps + requests + approve/reject + SSE
│   │   │   ├── documents.py       # Storage CRUD + browse/download + granular permissions
│   │   │   ├── salary_slips.py    # Admin salary CRUD + Excel + PDF (single/batch)
│   │   │   └── salary_user.py     # Employee salary view + PDF download
│   │   ├── utils/
│   │   │   ├── import_oc_users.py  # Migration: import users từ Nextcloud CSV
│   │   │   ├── pdf_generator.py    # Salary slip PDF generation
│   │   │   ├── ftp_utils.py        # FTP/SMB upload utility
│   │   │   └── seed_demo_data.py   # Seed dữ liệu mẫu
│   ├── main.py                    # FastAPI entry point + SSE endpoint
│   ├── company.db                 # SQLite database
│   ├── requirements.txt
│   └── run.bat
├── frontend/
│   ├── src/
│   │   ├── main.jsx               # Entry point (BrowserRouter + React.StrictMode)
│   │   ├── App.jsx                # Routing + ProtectedRoute / AdminRoute guards
│   │   ├── pages/
│   │   │   ├── Login.jsx          # Đăng nhập (employee_code + password/email)
│   │   │   ├── Dashboard.jsx      # Admin tổng quan / User cá nhân
│   │   │   ├── Employees.jsx      # CRUD nhân viên (cascade equipment)
│   │   │   ├── Equipment.jsx      # Enterprise UI: 4 stats, sticky toolbar, sortable grid, 3-dot menu, detail drawer, form modal — lucide-react
│   │   │   ├── Licenses.jsx       # Keys + categories/items + bulk import + scan
│   │   │   ├── SoftwarePage.jsx   # Software categories/items + contract upload
│   │   │   ├── Tickets.jsx        # User kanban / Admin filter+reply
│   │   │   ├── Approvals.jsx      # Approval requests: tạo phiếu, duyệt/từ chối, timeline logs
│   │   │   ├── WorkflowTemplates.jsx # Quản lý quy trình phê duyệt & bước duyệt
│   │   │   ├── Documents.jsx      # Storage browser SMB/FTP/GDrive
│   │   │   ├── Permissions.jsx    # Phân quyền 3 tab: Module + Documents (Nextcloud-style) + Roles
│   │   │   ├── Profile.jsx        # Hồ sơ cá nhân, đổi mật khẩu
│   │   │   ├── SalarySlip.jsx     # Employee: xem phiếu lương JSON dạng HTML
│   │   │   ├── SalarySlipAdmin.jsx # Admin: import Excel, chỉnh sửa, xuất PDF
│   │   │   ├── SalarySlip.css     # Styles cho Salary Slip module
│   │   │   └── booking/
│   │   │       ├── BookingPage.jsx # Scheduler Grid (drag/drop, resize, context menu)
│   │   │       └── *.jsx          # 14 booking components
│   │   │   ├── Layout.jsx         # Sidebar navigation (role-based)
│   │   │   └── booking/
│   │   │       ├── BookingGrid.jsx         # Grid chính (time x resource)
│   │   │       ├── BookingBlock.jsx        # Block booking (drag, resize, 3 status)
│   │   │       ├── BookingDialog.jsx       # Modal tạo/sửa booking
│   │   │       ├── BookingDrawer.jsx       # Drawer filter (mobile)
│   │   │       ├── BookingToolbar.jsx      # Toolbar (new, refresh, today, filter, dark mode)
│   │   │       ├── BookingFilter.jsx       # Bộ lọc (date, type, status)
│   │   │       ├── BookingContextMenu.jsx  # Right-click menu
│   │   │       ├── BookingTooltip.jsx      # Hover tooltip
│   │   │       ├── BookingStats.jsx        # 5 thẻ thống kê
│   │   │       ├── BookingSkeleton.jsx     # Loading skeleton
│   │   │       ├── BookingCurrentTime.jsx  # Vạch thời gian thực
│   │   │       ├── BusinessTripPanel.jsx   # Panel quản lý công tác
│   │   │       ├── BusinessTripGrid.jsx    # Gantt chart công tác
│   │   │       └── BusinessTripDialog.jsx  # Dialog tạo/sửa công tác
│   │   ├── hooks/
│   │   │   ├── useScheduler.js    # Hook điều phối (resources, filter, SSE)
│   │   │   ├── useBookings.js     # Hook CRUD bookings + overlap check
│   │   │   ├── useCurrentTime.js  # Hook thời gian thực (update 30s)
│   │   │   └── useSalarySlip.js   # Hook xem & tải PDF phiếu lương
│   │   ├── services/
│   │   │   └── api.js             # Axios instance + 93+ API functions (all modules)
│   │   ├── styles/
│   │   │   ├── booking.css        # Booking module styles (~960 dòng, CSS vars)
│   │   │   ├── Documents.css      # Document storage styles
│   │   │   ├── Login.css          # Login page styles
│   │   │   ├── Profile.css        # Profile page styles
│   │   │   ├── SalarySlip.css     # Salary slip styles
│   │   │   └── shared.css         # Shared patterns: .tbl, .side-panel, .panel-overlay
│   │   └── utils/
│   │       ├── bookingUtils.js    # Helper: isExpired, isUpcoming, getStatusLabel, getBookingStats, validate
│   │       ├── timeUtils.js       # Helper: slotIndex, gridPos, snapToSlot, nearestDate, timeSlots
│   │       └── formatters.js      # formatDate
│   ├── index.html
│   ├── vite.config.js             # Proxy /api → localhost:8080
│   ├── package.json               # React 19, React Router 7, Axios 1.7, lucide-react
│   └── run.bat
└── README.md
```

## API Endpoints

### Auth & Profile
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `POST` | `/api/auth/login` | Đăng nhập (employee_code hoặc email) |
| `POST` | `/api/auth/change-password` | Đổi mật khẩu |
| `GET` | `/api/auth/profile` | Lấy profile cá nhân |
| `PUT` | `/api/auth/profile` | Cập nhật profile (full_name, phone, personal_email) |
| `POST` | `/api/auth/forgot-password` | Quên mật khẩu → lấy email gợi ý |
| `POST` | `/api/auth/verify-reset` | Reset mật khẩu qua personal_email |
| `POST` | `/api/auth/admin-reset-password` | Admin reset mật khẩu người khác |
| `GET` | `/api/auth/users` | Danh sách users (admin) |
| `GET` | `/api/auth/users/search` | Tìm kiếm users (admin/head) |
| `GET` | `/api/auth/permissions/modules` | Danh sách module permissions |
| `GET` | `/api/auth/permissions` | Permission của user hiện tại |
| `GET` | `/api/auth/permissions/{target_code}` | Permission của user khác (admin) |
| `PUT` | `/api/auth/permissions/{target_code}` | Cập nhật permission user (admin) |
| `PUT` | `/api/auth/role/{target_code}` | Đổi role user (admin) |

### Dashboard
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/dashboard/stats` | Thống kê tổng quan (NV, TB, ticket, booking, biểu đồ) |

### Employees
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/employees` | Danh sách (filter: `keyword`, `department`) |
| `GET` | `/api/employees/{id}` | Chi tiết |
| `GET` | `/api/employees/by-code/{code}` | Tra theo mã NV |
| `GET` | `/api/employees/departments/list` | Danh sách phòng ban |
| `POST` | `/api/employees` | Thêm mới |
| `PUT` | `/api/employees/{id}` | Cập nhật |
| `DELETE` | `/api/employees/{id}` | Xoá (cascade: thu hồi thiết bị, NULL ticket/booking) |
| `GET` | `/api/employees/{id}/equipment` | Thiết bị của NV |

### Equipment
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/equipment` | Danh sách (filter: `storage`, `employee_id`, `search`) |
| `GET` | `/api/equipment/{id}` | Chi tiết |
| `POST` | `/api/equipment` | Thêm (tự sinh asset_code TS-XXXXX) |
| `PUT` | `/api/equipment/{id}` | Cập nhật |
| `PUT` | `/api/equipment/{id}/transfer` | Bàn giao (chuyển employee_id + ghi history) |
| `PUT` | `/api/equipment/{id}/revoke` | Thu hồi về kho (set employee_id=NULL) |
| `PUT` | `/api/equipment/{id}/allocate` | Cấp phát từ kho |
| `GET` | `/api/equipment/{id}/licenses` | License gán theo thiết bị |
| `GET` | `/api/equipment/{id}/history` | Lịch sử bàn giao |

### Tickets
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/tickets` | Danh sách (filter: `status`, `priority`, `search`) |
| `GET` | `/api/tickets/my` | Ticket của user (`employee_id` query) |
| `GET` | `/api/tickets/stats` | Thống kê (`total`, `pending`, `max_id`) |
| `POST` | `/api/tickets` | Tạo ticket |
| `PUT` | `/api/tickets/{id}` | Cập nhật (status, resolution, admin_notes) |
| `DELETE` | `/api/tickets/{id}` | Xoá |

### Bookings
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/bookings` | Danh sách (filter: `date`, `resource_type`, `status`) |
| `GET` | `/api/bookings/resources` | Danh sách tài nguyên (kèm booking_count) |
| `GET` | `/api/bookings/dates` | Các ngày có booking |
| `GET` | `/api/bookings/overlap` | Kiểm tra trùng giờ (`resource_id`, `date`, `start_time`, `end_time`) |
| `POST` | `/api/bookings` | Tạo booking (publish SSE event) |
| `PUT` | `/api/bookings/{id}` | Cập nhật (status, resource_id, start_time, end_time, book_date) |

### Licenses
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/licenses` | Danh sách (search) |
| `GET` | `/api/licenses/stats` | Thống kê |
| `POST` | `/api/licenses` | Thêm |
| `PUT` | `/api/licenses/{id}` | Cập nhật (inline edit) |
| `DELETE` | `/api/licenses/{id}` | Xoá |
| `POST` | `/api/licenses/bulk` | Bulk import (danh sách key) |
| `POST` | `/api/licenses/scan` | Auto scan license từ specs/os_info |
| `GET` | `/api/licenses/categories` | Danh sách danh mục license |
| `POST` | `/api/licenses/categories` | Thêm danh mục license |
| `PUT` | `/api/licenses/categories/{id}` | Sửa danh mục license |
| `DELETE` | `/api/licenses/categories/{id}` | Xoá danh mục + items + contracts |
| `GET` | `/api/licenses/categories/{id}/items` | Danh sách items trong danh mục |
| `POST` | `/api/licenses/categories/{id}/items` | Thêm item |
| `PUT` | `/api/licenses/items/{id}` | Sửa item |
| `DELETE` | `/api/licenses/items/{id}` | Xoá item + contract file |
| `POST` | `/api/licenses/items/{id}/upload` | Upload PDF contract |

### Software (admin)
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/software/categories` | Danh sách danh mục phần mềm |
| `POST` | `/api/software/categories` | Thêm danh mục |
| `PUT` | `/api/software/categories/{id}` | Sửa danh mục |
| `DELETE` | `/api/software/categories/{id}` | Xoá danh mục (nếu rỗng) |
| `GET` | `/api/software/categories/{id}/items` | Danh sách items |
| `POST` | `/api/software/categories/{id}/items` | Thêm item |
| `PUT` | `/api/software/items/{id}` | Sửa item |
| `DELETE` | `/api/software/items/{id}` | Xoá item + contract |
| `POST` | `/api/software/items/{id}/upload` | Upload PDF contract |

### Salary Slips (Admin — `/api/salary-slips/admin`)
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/admin/list` | Danh sách phiếu lương (filter: `month`, `employee_code`, `department`) |
| `GET` | `/admin/employees` | Danh sách NV để tạo phiếu (filter `department`) |
| `POST` | `/admin/create` | Tạo/cập nhật phiếu lương |
| `DELETE` | `/admin/{slip_id}` | Xoá phiếu lương |
| `POST` | `/admin/bulk-generate` | Tạo hàng loạt phiếu theo tháng |
| `POST` | `/admin/upload-salaries` | Upload Excel → parse `create_salary_context` → lưu JSON vào `salaries` |
| `GET` | `/admin/upload-history` | Lịch sử upload Excel |
| `POST` | `/admin/import-from-excel` | Import dữ liệu từ Excel vào `salary_slips` |
| `GET` | `/admin/view/{employee_code}` | Xem JSON phiếu lương NV |
| `GET` | `/admin/with-salary` | DS NV đã có phiếu trong tháng |
| `PUT` | `/admin/update-fields` | Cập nhật field trong JSON |
| `POST` | `/admin/export-pdf` | Xuất PDF có mật khẩu |
| `POST` | `/admin/batch-export-pdf` | Xuất hàng loạt PDF → ZIP |

### Salary (User — `/api/salary`)
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `POST` | `/verify-and-view` | Xem phiếu lương JSON (cần password nếu có) |
| `GET` | `/available-months` | Danh sách tháng đã có phiếu |
| `POST` | `/export-pdf` | Tải PDF phiếu lương (có mật khẩu) |

### Approvals
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/workflows` | Danh sách quy trình (filter: `active`) |
| `POST` | `/api/workflows` | Tạo quy trình |
| `GET` | `/api/workflows/{id}` | Chi tiết quy trình + steps |
| `PUT` | `/api/workflows/{id}` | Cập nhật quy trình |
| `DELETE` | `/api/workflows/{id}` | Xoá quy trình (cascade steps) |
| `POST` | `/api/workflows/{wf_id}/steps` | Thêm bước duyệt |
| `PUT` | `/api/workflows/steps/{step_id}` | Sửa bước duyệt |
| `DELETE` | `/api/workflows/steps/{step_id}` | Xoá bước duyệt |
| `POST` | `/api/requests` | Tạo phiếu yêu cầu (draft) |
| `GET` | `/api/requests` | Danh sách phiếu (filter: `status`, `requester`, `template_id`, `search`) |
| `GET` | `/api/requests/pending` | Phiếu chờ duyệt của user (`user_code`) |
| `GET` | `/api/requests/{id}` | Chi tiết phiếu + logs + template |
| `PUT` | `/api/requests/{id}` | Sửa phiếu (chỉ draft) |
| `PUT` | `/api/requests/{id}/submit` | Gửi duyệt (draft → pending) |
| `PUT` | `/api/requests/{id}/cancel` | Huỷ phiếu |
| `PUT` | `/api/requests/{id}/approve` | Phê duyệt bước hiện tại |
| `PUT` | `/api/requests/{id}/reject` | Từ chối phiếu |

### System
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/events` | SSE global event stream |
| `GET` | `/api/health` | Health check |

### Documents / Storage
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/documents/config` | Danh sách storage configs |
| `GET` | `/api/documents/config/{id}` | Chi tiết storage config |
| `POST` | `/api/documents/config` | Thêm storage config (SMB/FTP/GDrive) |
| `PUT` | `/api/documents/config/{id}` | Cập nhật storage config |
| `DELETE` | `/api/documents/config/{id}` | Xoá storage config + cascade permissions |
| `POST` | `/api/documents/test-connection` | Test kết nối với config data (chưa lưu) |
| `POST` | `/api/documents/config/{id}/test` | Test kết nối với config đã lưu |
| `GET` | `/api/documents/browse/{id}` | Duyệt thư mục (path/folder_id) — có permission check |
| `GET` | `/api/documents/download` | Download file stream (FTP/SMB/GDrive) — có permission check |
| `GET` | `/api/documents/departments` | Danh sách phòng ban (cho dropdown) |
| `GET` | `/api/documents/permissions/{config_id}` | Danh sách phân quyền (granular fields) |
| `POST` | `/api/documents/permissions` | Thêm phân quyền (legacy) |
| `POST` | `/api/documents/permissions/share` | Tạo/Cập nhật granular permission (EVERYONE/DEPARTMENT) |
| `PUT` | `/api/documents/permissions/{perm_id}` | Cập nhật granular permissions (từng field) |
| `DELETE` | `/api/documents/permissions/{perm_id}` | Xoá phân quyền |

## Database

**File**: `backend/company.db` (SQLite) — WAL mode, busy_timeout 5000ms

### Tables

| Table | Records | Ghi chú |
|-------|---------|---------|
| `employees` | Nhân viên | `employee_code` unique, `status` (active/inactive) |
| `equipment` | Thiết bị CNTT | `asset_code` (TS-XXXXX), `lifecycle_status`, `storage` (in_stock/issued) |
| `licenses` | License key | `license_key` UNIQUE, gán theo equipment_id |
| `lic_categories` | Danh mục license | name, icon, order_index |
| `lic_items` | Mục license | category_id, name, registered_date, expiration_date, contract_info, contract_file |
| `equipment_history` | Lịch sử bàn giao | handover_date, return_date, old/new status, changed_by |
| `tickets` | Yêu cầu hỗ trợ IT | employee_id set NULL khi xoá NV |
| `users` | Tài khoản | employee_code + password_hash + role |
| `user_permissions` | Permission module theo user | employee_code + module + can_view + can_edit |
| `resources` | Xe + Phòng họp | is_active, mặc định 6 resources |
| `bookings` | Đặt lịch | resource_id, book_date, start/end_time, status |
| `business_trips` | Công tác | employee_code, destination, start/end_date, status |
| `workflow_templates` | Mẫu quy trình phê duyệt | name, icon, is_active |
| `workflow_steps` | Bước duyệt | template_id, step_order, approver_type/role/department_match |
| `approval_requests` | Phiếu yêu cầu duyệt | template_id, requester_code, status, current_step, total_steps |
| `approval_logs` | Nhật ký phê duyệt | request_id, step_order, approver_code, action, comment |
| `departments` | Phòng ban | name UNIQUE, head_id → employees.id |
| `storage_config` | Cấu hình storage SMB/FTP/GDrive | type, host, port, username, password, remote_path, domain, is_active |
| `storage_permissions` | Phân quyền thư mục storage | storage_id, folder_path, target_type (EVERYONE/DEPARTMENT), can_read/write/edit/delete, allow_download, can_reshare, expires_at |
| `salary_slips` | Phiếu lương (dạng cột) | employee_code, month, basic_salary, allowances, bonus, deductions, net_salary |
| `salaries` | Phiếu lương (dạng JSON) | employee_code, month, password, data_json — ON CONFLICT upsert |
| `salary_upload_logs` | Lịch sử upload Excel | month, filename, uploaded_by, record_count |
| `software_categories` | Danh mục phần mềm | name, icon_name, order_index |
| `software_items` | Mục phần mềm | category_id, name, registered_date, expiration_date, contract_info |

> Schema không dùng FOREIGN KEY constraints — xử lý integrity ở application layer.

### Indexes

| Index | Table | Loại | Mục đích |
|-------|-------|------|----------|
| `idx_employee_code` | employees | INDEX | Tra cứu theo mã NV |
| `idx_employee_status` | employees | INDEX | Lọc active |
| `idx_employee_department` | employees | INDEX | Filter phòng ban |
| `idx_equipment_employee` | equipment | INDEX | Thiết bị theo NV |
| `idx_equipment_status` | equipment | INDEX | Lọc trạng thái |
| `idx_equipment_asset_code` | equipment | INDEX | Tra cứu mã TS |
| `idx_license_equipment` | licenses | INDEX | License theo thiết bị |
| `idx_license_product` | licenses | INDEX | Tìm kiếm sản phẩm |
| `idx_license_key` | licenses | **UNIQUE** | Chống trùng key |
| `idx_license_expiry` | licenses | INDEX | Cảnh báo hết hạn |
| `idx_ticket_status` | tickets | INDEX | Lọc trạng thái |
| `idx_ticket_priority` | tickets | INDEX | Lọc mức độ |
| `idx_ticket_employee` | tickets | INDEX | Ticket của user |
| `idx_ticket_employee_code` | tickets | INDEX | Tra theo mã NV |
| `idx_booking_resource_date` | bookings | INDEX | Overlap check |
| `idx_booking_date` | bookings | INDEX | Lọc ngày |
| `idx_booking_status` | bookings | INDEX | Lọc trạng thái |
| `idx_booking_employee` | bookings | INDEX | Lịch user |
| `idx_eq_history_equipment` | equipment_history | INDEX | Lịch sử thiết bị |
| `idx_eq_history_employee` | equipment_history | INDEX | Lịch sử NV |

## Booking Module — Chi tiết

### Luồng dữ liệu

```
BookingPage
  └─ useScheduler (state: resources, filter, selected, SSE)
       ├─ useBookings (CRUD: loadBookings, createBooking, finishBooking)
       │    ├─ api.getBookings()      → GET /api/bookings
       │    ├─ api.createBooking()    → POST /api/bookings
       │    ├─ api.finishBooking()    → PUT /api/bookings/{id}
       │    └─ api.checkOverlap()     → GET /api/bookings/overlap
       ├─ getResources()             → GET /api/bookings/resources
       ├─ getBookingDates()          → GET /api/bookings/dates
       └─ SSE /api/events            → auto reload bookings
              ├─ booking_created
              ├─ booking_updated
              └─ onopen → initial load

useCurrentTime
  └─ Cập nhật mỗi 30s → gridOffset → vạch đỏ BookingCurrentTime
```

### 3 trạng thái Booking (cho `status='active'` cùng ngày)

| Trạng thái | Điều kiện | UI | Cho phép |
|------------|-----------|-----|----------|
| 🟡 **Sắp diễn ra** | `now < start_time` | Badge vàng, dashed border, opacity 85% | Xem, sửa, huỷ |
| 🟢 **Đang sử dụng** | `start_time ≤ now < end_time` | Badge xanh, block đầy màu | Drag, resize, kết thúc |
| ⏰ **Đã hết giờ** | `now ≥ end_time` | Badge đỏ, opacity 50%, title gạch ngang | Chỉ xem, huỷ |

### Keyboard Shortcuts

| Phím | Hành động |
|------|-----------|
| `Ctrl+N` | Mở dialog tạo booking mới |
| `Ctrl+E` | Mở dialog sửa booking đang chọn |
| `F5` | Làm mới dữ liệu |
| `Esc` | Đóng dialog/drawer/context menu |

### CSS Variables

Booking module dùng `--bk-*` CSS custom properties, hỗ trợ dark mode qua class `.dark-mode` trên `html`.

## Maintenance

- **Backend logs**: Xem terminal chạy uvicorn
- **Frontend build**: `npm run build` → output `frontend/dist/`
- **DB reset**: Xoá `backend/company.db` → tự động seed lại khi chạy backend
- **Realtime**: SSE qua `/api/events`, tự động update tickets, bookings, equipment, approvals
- **SSE filterRef**: Dùng `useRef` tránh reconnect khi filter thay đổi
- **Booking status update**: Cập nhật mỗi 30s qua `useCurrentTime` hook (vạch đỏ + trạng thái)
