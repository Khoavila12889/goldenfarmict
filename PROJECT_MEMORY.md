# PROJECT_MEMORY.md - GoldenFarm ICT Management System

> **Single Source of Truth** — Mọi thông tin quan trọng về dự án đều được tập hợp trong file này.
> AI Assistant PHẢI đọc file này trước khi thực hiện bất kỳ thay đổi nào.
> Cập nhật lần cuối: **2026-08-03**

---

## 1. Tổng quan Dự án & Cấu trúc (Architecture)

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

### 1.3 Project Structure

```
goldenfarm-ict-web/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── database.py        # DB init, schema (30 tables), migrations, indexes
│   │   │   ├── db.py              # DB abstraction layer
│   │   │   ├── auth.py            # SHA-256 hash, session token, seed_users
│   │   │   ├── events.py          # SSE pub/sub (async Queue)
│   │   │   └── session.py         # PostgreSQL connection configuration
│   │   ├── models.py              # SQLAlchemy ORM models (30 tables)
│   │   ├── routers/               # API endpoints (14 modules)
│   │   ├── utils/
│   │   │   ├── pdf_generator.py   # Salary PDF generation
│   │   │   └── ftp_utils.py       # FTP/SMB upload utility
│   ├── uploads/                   # File uploads (contracts, etc.)
│   └── main.py                    # FastAPI entry point + SSE endpoint
├── frontend/
│   ├── src/
│   │   ├── components/            # Reusable components
│   │   ├── pages/                 # Page components
│   │   ├── hooks/                 # Custom React hooks
│   │   ├── services/api.js        # Axios API client
│   │   ├── styles/                # CSS files
│   │   └── utils/                 # Utility functions
│   └── package.json
├── docker-compose.yml             # Docker Compose configuration
├── .env                           # Environment variables
├── PROJECT_MEMORY.md              # THIS FILE
└── README.md                      # Project overview
```

### 1.4 Role-Based Access Control (RBAC)

| Role | Mô tả | Xác định bởi |
|------|-------|-------------| 
| `admin` | Quản trị hệ thống | Phòng "Admin" hoặc `seed_users()` |
| `head` | Trưởng phòng | `departments.head_id → employees` |
| `user` | Người dùng thông thường | Mặc định |

**Ma trận quyền theo module (mặc định):**

| Module | admin/head | user |
|--------|-----------|------|
| **Dashboard** | Xem toàn bộ thống kê | Xem Kanban cá nhân |
| **Nhân viên** | CRUD toàn bộ | ❌ Không truy cập |
| **Thiết bị** | CRUD, cấp phát, thu hồi | ❌ Không truy cập |
| **Tickets** | Xem tất cả, filter, reply | Tạo ticket mới, xem ticket của mình |
| **Đặt lịch** | Quản lý tài nguyên | Đặt lịch, xem lịch |
| **Phiếu lương** | Xem tất cả, CRUD | Xem phiếu lương cá nhân |
| **Tài liệu** | Xem tất cả storage configs | Xem storage được phân quyền |
| **Công việc (Todos)** | Xem tất cả | Xem personal + department |
| **Phân quyền module** | CRUD | ❌ Không truy cập |

---

## 2. Cấu hình Storage (SMB, FTP, Google Drive) & Tối ưu Media

### 2.1 Storage Types

Hỗ trợ 3 loại storage: FTP, SMB (Windows Share), Google Drive (Service Account).

### 2.2 Storage Configuration

**SMB (Windows Share):**
```
Host: 10.0.0.x
Port: 445
Username: goldenfarm\\user
Password: ********
Remote Path: shared (tên share, không phải full path)
Domain: WORKGROUP
```

**FTP:**
```
Host: ftp.example.com
Port: 21
Username: user
Password: ********
Remote Path: /path/to/folder
```

**Google Drive:**
```
Type: gdrive
Remote Path: <Google Folder ID>
Credentials: Service Account JSON
```

### 2.3 File Permissions (Nextcloud-style)

- **Target types**: `EVERYONE` (tất cả nhân viên) hoặc `DEPARTMENT` (theo phòng ban)
- **Granular permissions matrix**:
  - `can_read` — Xem nội dung thư mục/tệp
  - `can_write` — Tạo tệp/thư mục mới
  - `can_edit` — Sửa nội dung tệp hiện có
  - `can_delete` — Xoá tệp/thư mục
  - `allow_download` — Cho phép tải xuống
  - `can_reshare` — Chia sẻ lại cho người khác
- **Expiration date**: Mỗi permission có thể đặt ngày hết hạn
- **Inheritance**: Quyền folder cha áp dụng cho folder con

### 2.4 Media Optimization (Recent Changes)

**Card Thumbnail CSS (Documents.css, SharedFolder.css):**
- Chiều cao giảm 20%: 90px (Documents), 80px (SharedFolder)
- `object-fit: contain` — hiển thị trọn vẹn ảnh không bị xén
- `background: #ffffff` — nền trắng cho thumbnail
- `border-radius: 6px` — bo tròn góc ảnh
- Padding 8-12px xung quanh khung chứa

**Google Drive Images:**
- Thumbnail URL: Sử dụng `entry.thumbnailLink` với `=s800` để nét hơn
- File ID: BẮT BUỘC đính kèm `&file_id=${encodeURIComponent(entry.id)}` cho backend proxy
- Lightbox: Đảm bảo URL chứa `file_id` parameter chuẩn xác

---

## 3. Module Lương (Salary & Slip Rules)

### 3.1 Salary Slip Generation Workflow

```
Admin: Upload Excel + Template DOCX
  ↓
Backend: Parse Excel → Generate PDFs → Store
  ↓
Employee: View PDF online / Download
```

### 3.2 API Endpoints

**Admin Endpoints (`/api/salary-slips/admin`):**
- `POST /admin/upload-salaries` — Upload Excel → lưu JSON vào `salaries` table
- `POST /admin/import-from-excel` — Import Excel → `salary_slips` table
- `POST /admin/generate-from-excel` — Upload Excel + Template → Generate PDFs
- `GET /admin/pdf-status/{job_id}` — Kiểm tra tiến trình generate
- `GET /admin/pdf-download/{job_id}` — Download ZIP
- `POST /admin/export-pdf` — Xuất PDF có mật khẩu
- `POST /admin/batch-export-pdf` — Xuất hàng loạt PDF → ZIP

**User Endpoints (`/api/salary`):**
- `POST /verify-and-view` — Xem phiếu lương JSON (cần password nếu có)
- `GET /available-months` — Danh sách tháng đã có phiếu
- `POST /export-pdf` — Tải PDF phiếu lương (có mật khẩu)

### 3.3 Quy tắc chốt lương (Import month cap)

- Lương tháng trước được trả vào ngày 5 tháng sau
- **Không thể import tháng hiện tại**
- Tháng tối đa chọn được luôn là **tháng trước tháng hiện tại**

### 3.4 Database Tables

- **salary_slips**: basic_salary, allowances, bonus, deductions, net_salary (quan hệ 1-N với employee)
- **salaries**: employee_code, month, password, data_json (lưu context JSON từ Excel)
- **salary_upload_logs**: Log mỗi lần upload Excel

---

## 4. Cấu hình OnlyOffice & File Viewer

### 4.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Client)                                            │
│  - Truy cập: http://10.0.0.9:8088                          │
│  - Load OnlyOffice JS: http://10.0.0.9:8080                │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────┴────────────────────────────────────────────┐
│  Docker Network: goldenfarm-network                          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Frontend (Nginx) - Port: 8088 → 80                  │  │
│  └──────────────┬───────────────────────────────────────┘  │
│                 │                                            │
│  ┌──────────────┴───────────────────────────────────────┐  │
│  │  Backend (FastAPI) - Port: 8000                      │  │
│  │  - Connect to: onlyoffice:80                         │  │
│  └──────────────┬────────────┬──────────────────────────┘  │
│                 │            │                              │
│  ┌──────────────┴─┐    ┌────┴─────────────────────────┐   │
│  │  PostgreSQL    │    │  OnlyOffice Document Server  │   │
│  │  Port: 5432    │    │  - Internal: onlyoffice:80   │   │
│  └────────────────┘    │  - External: 8080 → 80       │   │
│                        │  - JWT: MySuperSecret123456   │   │
│                        └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Environment Variables

```env
BACKEND_PUBLIC_URL=http://backend:8000
ONLYOFFICE_URL=http://onlyoffice:80
ONLYOFFICE_PUBLIC_URL=http://10.0.0.9:8080
ONLYOFFICE_SECRET=MySuperSecret123456
ONLYOFFICE_ENABLED=true
```

### 4.3 Supported File Types

| Extension | Type | Edit | View |
|-----------|------|------|------|
| `.docx`, `.doc` | Word | ✅ | ✅ |
| `.xlsx`, `.xls` | Excel | ✅ | ✅ |
| `.pptx`, `.ppt` | PowerPoint | ✅ | ✅ |
| `.odt`, `.ods`, `.odp` | OpenDocument | ✅ | ✅ |
| `.csv` | CSV | ✅ | ✅ |
| `.txt`, `.rtf` | Text | ✅ | ✅ |
| `.pdf` | PDF | ❌ | ✅ |

### 4.4 JWT Authentication

- Secret key: `MySuperSecret123456` (HS256)
- Download token: hết hạn sau 300 giây (5 phút)
- `can_edit` = `True` → mode `edit`; `False` → mode `view`
- `admin`/`head` luôn có `can_edit = True`

### 4.5 OnlyOffice Flow

1. User click file Office → Frontend gọi `GET /api/documents/onlyoffice/config`
2. Backend check `_check_folder_permission` (can_read) và `_check_can_edit` (can_edit)
3. Backend sinh JWT-signed editor config, tạo temporary download token (5 phút)
4. Frontend load DocsAPI từ ONLYOFFICE server, khởi tạo `DocEditor`
5. ONLYOFFICE server gọi `GET /api/documents/onlyoffice/download?token=` để lấy nội dung file
6. User chỉnh sửa → tự động lưu → ONLYOFFICE gửi webhook về `POST /api/documents/onlyoffice/callback`
7. Callback nhận file đã save → ghi đè lên storage cũ qua `_put_file_bytes()`
8. Backend publish SSE event `document_updated` để UI refresh

### 4.6 File Viewer Components

- **FileViewer.jsx**: Universal file viewer (image, PDF, text, video, audio)
- **OnlyOfficeViewer.jsx**: ONLYOFFICE document editor overlay
- **ShareDocument.jsx**: Share file/folder modal with QR code

---

## 5. Lịch sử Nhật ký & Sửa lỗi (Changelog & Debug Memory)

### 5.1 Recent Changes (2026-08-03)

#### Fix: Google Drive image/lightbox broken
- **Issue**: Thumbnail và lightbox bị vỡ khi browse Google Drive
- **Root cause**: Thiếu `file_id` parameter trong URL
- **Solution**: Thêm `buildThumbnailUrl` function với `file_id` parameter
- **Files**: `frontend/src/pages/Documents.jsx`

#### Fix: Card thumbnail CSS optimization
- **Issue**: Thumbnail quá to, tràn mép card
- **Solution**: 
  - Giảm chiều cao 20% (90px Documents, 80px SharedFolder)
  - `object-fit: contain` thay vì `cover`
  - `background: #ffffff`
  - Thêm padding 8-12px
- **Files**: `frontend/src/pages/Documents.css`, `frontend/src/components/SharedFolder.css`

#### Fix: Remove image badge (📷) from Document cards
- **Issue**: Badge làm giao diện không sạch
- **Solution**: Xoá `.doc-card-img-badge` element
- **Files**: `frontend/src/pages/Documents.jsx`

#### Fix: Share modal missing file info
- **Issue**: Share modal không hiển thị đủ thông tin file
- **Solution**: Thêm `formatSize`, `formatDate` và hiển thị file meta
- **Files**: `frontend/src/components/ShareDocument.jsx`

#### Fix: MP4 video playback
- **Issue**: Video MP4 không phát được
- **Solution**: Thêm `poster` attribute cho video element
- **Files**: `frontend/src/components/FileViewer.jsx`

### 5.2 PostgreSQL Migration (Version 2.0)

- **Removed SQLite support** - PostgreSQL 14+ là database duy nhất được hỗ trợ
- **Updated database architecture** - SQLAlchemy ORM với PostgreSQL optimization
- **Removed SQLite legacy code** - All SQLite-specific code removed from codebase
- **Files Changed**:
  - `backend/app/core/session.py` - PostgreSQL-only
  - `backend/app/core/database.py` - PostgreSQL schema initialization
  - `backend/app/core/db.py` - PostgreSQL-optimized
  - All routers updated to use PostgreSQL-compatible date/time syntax

### 5.3 OnlyOffice Integration Complete

- OnlyOffice container configured in docker-compose.yml (port 8080)
- Backend config: `BACKEND_PUBLIC_URL`, `ONLYOFFICE_URL`, `ONLYOFFICE_PUBLIC_URL`
- Test page created: `frontend/public/test-onlyoffice.html` — ALL TESTS PASS
- OnlyOfficeViewer.jsx with debug logs
- CSS in shared.css (`.oov-close-btn-floating`)

### 5.4 Salary Module Integration

- **Migrated from**: `web_simple` project
- **Integration Date**: December 2024
- **Features**:
  - Upload Excel + Template DOCX → Generate PDFs
  - Auto-save to database + storage
  - Password-encrypted PDFs
  - User self-service view
  - Admin bulk generation

---

## 6. AI Core Directives — MỆNH LỆNH TỐI THƯỢNG

> ⚠️ **CÁC MỆNH LỆNH SAU LÀ BẮT BUỘC. AI VI PHẠM SẼ BỊ REJECT.**

### D1 — ĐỌC KỶ tài liệu này
Trước khi viết bất kỳ API endpoint, component, hay business logic nào: **ĐỌC TOÀN BỘ** file `PROJECT_MEMORY.md`.

### D2 — KHÔNG phá vỡ luồng phân quyền
- Backend: kiểm tra role (`admin`/`head`/`user`) trong các endpoint nhạy cảm.
- Frontend: `AdminRoute` bảo vệ route (check both `admin` và `head`).

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

### D12 — Salary module dùng token verification riêng
Các endpoint salary dùng `require_admin()` với `verify_token()`.

### D13 — Date format DD/MM/YYYY
Database lưu ISO `yyyy-mm-dd`, UI hiển thị `DD/MM/YYYY` qua `formatDate()`.

### D14 — Software module dùng tab-based navigation
Mỗi category là một tab. Lazy load items theo tab active.

### D15 — Permissions module (3 tầng)
Thứ tự ưu tiên: user > department > role.

### D16 — ❌ CẤM TỰ Ý TẠO FILE `.md` MỚI
- ❌ KHÔNG tạo file: `SUMMARY_*.md`, `DEBUG_*.md`, `CHECKLIST_*.md`
- ✅ Mọi cập nhật PHẢI append vào `PROJECT_MEMORY.md` (Mục 5)

---

## 7. Quick Reference

### 7.1 Default Login

| Mã NV | Vai trò | Mật khẩu |
|-------|---------|----------|
| `admin` | admin | `admin` |
| `administrator` | admin | `administrator` |

### 7.2 Ports

| Service | Internal | External | Access URL |
|---------|----------|----------|------------|
| Frontend | 80 | 8088 | http://10.0.0.9:8088 |
| Backend | 8000 | 8000 | http://10.0.0.9:8000 |
| OnlyOffice | 80 | 8080 | http://10.0.0.9:8080 |
| PostgreSQL | 5432 | 5432 | 10.0.0.9:5432 |

### 7.3 Database (30 tables)

| Table | Records | Ghi chú |
|-------|---------|---------|
| `employees` | 354 | `employee_code` unique |
| `equipment` | 100 | `asset_code` (TS-XXXXX) |
| `licenses` | 216 | `license_key` UNIQUE |
| `tickets` | 126 | Yêu cầu hỗ trợ IT |
| `users` | 355 | employee_code + password_hash + role |
| `bookings` | 81 | Lịch đặt tài nguyên |
| `business_trips` | 21 | Đăng ký công tác |
| `workflow_templates` | 3 | Template quy trình |
| `departments` | 20 | Phòng ban |
| `storage_config` | 3 | Cấu hình storage |
| `salary_slips` | 2 | Phiếu lương |
| `todos` | 27 | Công việc |
| ... | ... | Xem đầy đủ trong `backend/app/models.py` |

### 7.4 SSE Events (22 events)

| Event | Khi nào |
|-------|---------|
| `new_ticket`, `update_ticket`, `delete_ticket` | Ticket CRUD |
| `booking_created`, `booking_updated` | Booking CRUD |
| `trip_created`, `trip_updated`, `trip_deleted` | Business Trip CRUD |
| `equipment_created`, `equipment_updated` | Equipment CRUD |
| `workflow_created`, `workflow_updated` | Workflow CRUD |
| `request_submitted`, `request_approved`, `request_rejected` | Approval flow |
| `document_updated` | ONLYOFFICE save |
| `todo_created`, `todo_updated`, `todo_deleted` | Todo CRUD |
| `tab_updated`, `software_updated` | Software CRUD |

---

**Last Updated**: 2026-08-03  
**Maintained by**: GoldenFarm ICT Team  
**Status**: ✅ Production Ready
