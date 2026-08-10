# PROJECT_MEMORY.md - GoldenFarm ICT Management System

> **Single Source of Truth** — Mọi thông tin quan trọng về dự án đều được tập hợp trong file này.
> AI Assistant PHẢI đọc file này trước khi thực hiện bất kỳ thay đổi nào.
> Cập nhật lần cuối: **2026-08-08**

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
- **Chat nội bộ** (Chat — WebSocket realtime, phòng 1-1/nhóm, ĐỘC LẬP với SSE)
- **Phân quyền truy cập module** (Permissions — user/role/department permission matrix)

### 1.2 Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 19 + Vite 6 | CSS thuần (CSS Variables) |
| Backend | FastAPI (Python 3.11+) | RESTful API |
| Database | PostgreSQL 16 | PostgreSQL server required (no SQLite) |
| ORM | SQLAlchemy | 30+ tables, no FK constraints |
| Realtime | Server-Sent Events (SSE) + WebSocket | SSE `/api/events` · Chat WS `/api/chat/ws` |
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
│   │   │   ├── database.py        # DB init, schema (33 tables), migrations, indexes
│   │   │   ├── db.py              # DB abstraction layer
│   │   │   ├── auth.py            # SHA-256 hash, session token, seed_users
│   │   │   ├── events.py          # SSE pub/sub (async Queue)
│   │   │   ├── chat_ws.py         # WebSocket ConnectionManager (chat nội bộ)
│   │   │   └── session.py         # PostgreSQL connection configuration
│   │   ├── models.py              # SQLAlchemy ORM models (33 tables — gồm 3 bảng chat)
│   │   ├── routers/               # API endpoints (15 modules, gồm chat.py)
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

## 5. Module Chat Nội bộ — Kiến trúc & Công nghệ (WebSocket)

### 5.1 Tổng quan

Chat Nội bộ là kênh nhắn tin realtime dành cho toàn bộ nhân viên. Nó hoạt động **ĐỘC LẬP hoàn toàn với hệ thống SSE** (`/api/events`) — realtime của chat dùng **WebSocket riêng** (`/api/chat/ws`), không dùng `publish_sync()`.

**Phân quyền theo vai trò (role-based) từ 2026-08-10:**
- **user**: tạo phòng 1-1/nhóm, chat; tự tham gia phòng phòng ban của mình; không quản lý phòng.
- **head (trưởng phòng)**: như user + quản lý (đổi tên/xoá) phòng **phòng ban của mình**; chủ nhóm quản lý nhóm mình tạo.
- **admin**: quản lý MỌI phòng (đổi tên, thêm/bớt thành viên group, xoá); tạo phòng phòng ban cho bất kỳ phòng ban nào.
- **group (chủ nhóm)**: `owner_code` lưu người tạo nhóm — chỉ chủ nhóm/admin mới thêm/bớt thành viên, đổi tên, xoá nhóm.

**Files liên quan:**

| Layer | File | Vai trò |
|-------|------|---------|
| Backend | `app/models.py` | 3 model mới: `ChatRoom`, `ChatRoomMember`, `ChatMessage` |
| Backend | `app/core/chat_ws.py` | `ConnectionManager` — quản lý kết nối theo `employee_code` |
| Backend | `app/routers/chat.py` | WS endpoint + REST (`/rooms`, `/messages/{room_id}`, `POST /rooms`) |
| Backend | `main.py` | `Base.metadata.create_all` tự tạo bảng chat khi startup |
| Frontend | `src/pages/Chat.jsx` | UI chat (danh sách phòng + cửa sổ chat + modal tạo phòng) |
| Frontend | `src/pages/Chat.css` | Styles (CSS class, tuân thủ D8) |
| Frontend | `src/services/api.js` | `getChatRooms()`, `getChatMessages()`, `createChatRoom()`, `chatWebSocketUrl()` |
| Docs | `docs/HDSD_Chat.md` + `frontend/src/docs/HDSD_Chat.md` | Hướng dẫn sử dụng (2 bản giống nhau — HelpPage import từ `frontend/src/docs`) |

### 5.2 Database (3 bảng mới)

| Bảng | Cột quan trọng | FK / ondelete |
|------|----------------|---------------|
| `chat_rooms` | `id` UUID (String 36), `type` (`direct`/`group`/`department`), `name` (nullable — direct để NULL, group/department là tên), `department` (phòng ban — chỉ type=department), `owner_code` (người tạo nhóm — quản lý group), `created_at` DateTime | — |
| `chat_room_members` | `room_id`, `employee_code` (UNIQUE `room_id`+`employee_code`) | `room_id` → `chat_rooms.id` **CASCADE** · `employee_code` → `users.employee_code` CASCADE |
| `chat_messages` | `id` UUID, `room_id`, `sender_id` (nullable), `content` Text, `attachment_url` (nullable), `is_pinned` (1=đang ghim), `pinned_by`, `pinned_at`, `created_at` DateTime | `room_id` → `chat_rooms.id` **CASCADE** · `sender_id` → `users.employee_code` **SET NULL** (D3) |

> ⚠️ **D3**: Xoá User → tin nhắn KHÔNG bị xoá, `sender_id` tự chuyển NULL nhờ FK `ondelete="SET NULL"`. Xoá phòng → cascade xoá tin nhắn + thành viên.

### 5.3 Luồng dữ liệu (Data Flow)

```
Browser (Chat.jsx)
  ├─ REST:  GET  /api/chat/rooms                      → danh sách phòng của user
  │         GET  /api/chat/messages/{room_id}?limit&offset  → lịch sử (phân trang)
  │         POST /api/chat/rooms                      → tạo phòng direct/group
  └─ WS:    ws://<host>/api/chat/ws?token=...&employee_code=...
       │
Backend (FastAPI)
  ├─ routers/chat.py
  │    ├─ xác thực: verify_token(employee_code, token, role) — sai → close(1008)
  │    ├─ nhận JSON {room_id, content, attachment_url}
  │    ├─ kiểm tra thành viên → lưu ChatMessage qua SQLAlchemy ORM
  │    └─ manager.broadcast_to_room(payload, _room_member_codes(room_id))
  ├─ core/chat_ws.py  → send_json tới mọi WebSocket của từng employee_code
  └─ PostgreSQL (chat_rooms / chat_room_members / chat_messages)
```

### 5.4 Công nghệ & Quyết định thiết kế

- **WebSocket**: dùng Starlette (qua FastAPI) `@router.websocket` — prefix `/api/chat` → WS path `/api/chat/ws`.
- **Xác thực WS**: WebSocket không gửi Header Authorization → đọc `token` + `employee_code` từ **query param** (D6 — không hard-code), xác minh bằng `verify_token()` trong `app/core/auth.py`. Token sai → `websocket.close(code=1008)` ngay lập tức.
- **ConnectionManager** (`chat_ws.py`): `Dict[str, Set[WebSocket]]` — lưu theo `employee_code`, hỗ trợ **multi-tab**; dùng `asyncio.Lock` chống race; tự dọn socket chết khi gửi lỗi; `broadcast_to_room(message, list_employee_codes)`.
- **Lưu trước, gửi sau**: tin nhắn được insert vào `chat_messages` (ORM) **trước** khi broadcast — mọi thành viên phòng (kể cả người gửi) nhận qua WS echo, nên frontend không cần append tay.
- **Frontend reconnect**: `Chat.jsx` tự kết nối lại sau 3s khi socket đóng; trạng thái hiển thị "Trực tuyến / Đang kết nối".
- **Proxy**: dev — `vite.config.js` `ws: true` cho `/api` → `127.0.0.1:8080`; prod — `frontend/nginx.conf` đã có `proxy_set_header Upgrade $http_upgrade` + `Connection "upgrade"`.
- **Không thêm dependency**: chỉ dùng FastAPI + SQLAlchemy + PostgreSQL sẵn có (tuân thủ D10).

### 5.5 API Endpoints (prefix `/api/chat`)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `WS` | `/api/chat/ws?token=...&employee_code=...` | Realtime — xác thực token, close 1008 nếu sai; nhận & lưu tin nhắn, broadcast tới mọi thành viên phòng |
| `GET` | `/api/chat/rooms` | Phòng chat của user đang đăng nhập (headers `X-User-*`) — tự tạo phòng phòng ban nếu chưa có; trả `department`, `owner_code`, `can_manage` |
| `GET` | `/api/chat/messages/{room_id}` | Lịch sử tin nhắn (`limit` 1–200 mặc định 50, `offset`) — chỉ thành viên phòng (403 nếu không phải) |
| `POST` | `/api/chat/rooms` | Tạo phòng (`type` direct/group/department, `name` cho group, `department` cho phòng ban, `member_codes`) — tự thêm user đăng nhập làm thành viên; phòng ban chỉ admin/head |
| `GET` | `/api/chat/rooms/{room_id}/members` | Danh sách thành viên kèm `is_owner` — phòng ban lấy động theo `employees.department` |
| `PUT` | `/api/chat/rooms/{room_id}` | Đổi tên phòng group/department — chỉ ai có `can_manage` |
| `DELETE` | `/api/chat/rooms/{room_id}` | Xoá phòng (cascade tin nhắn + thành viên) — chỉ ai có `can_manage` |
| `POST` | `/api/chat/rooms/{room_id}/members` | Thêm thành viên vào nhóm (body `{employee_codes}`) — chỉ chủ nhóm/admin |
| `DELETE` | `/api/chat/rooms/{room_id}/members/{employee_code}` | Xoá thành viên khỏi nhóm (không xoá được chủ nhóm) — chỉ chủ nhóm/admin |
| `GET` | `/api/chat/rooms/{room_id}/pinned` | Danh sách tin nhắn đang ghim (mới ghim trước, tối đa 50) |
| `PUT` | `/api/chat/messages/{message_id}/pin` | Ghim tin nhắn (thành viên phòng đều ghim được) — broadcast `{event:"pin_updated", pinned:[...]}` qua WS |
| `DELETE` | `/api/chat/messages/{message_id}/pin` | Bỏ ghim — chỉ người ghim hoặc người quản lý phòng; broadcast `pin_updated` |

**Headers REST**: `X-User-Code`, `X-User-Role`, `X-User-Dept`, `X-User-Token` (qua `verify_session`). Người dùng WS dùng `_normalize_user()` để thống nhất `employee_code`/`role`/`department`.

**Thành viên phòng ban**: KHÔNG lưu trong `chat_room_members` — tính động qua `employees.department == chat_rooms.department` (`_is_room_member`, `_department_member_codes`), nhân viên mới vào phòng ban tự có quyền truy cập, nghỉ việc (đổi phòng) tự bị tách khỏi phòng phòng ban cũ.

### 5.6 Bảo trì (Maintenance)

- **Bảng mới**: tự tạo qua `Base.metadata.create_all(bind=engine)` ở startup (`main.py`) — không cần migration tay cho bảng mới. Khi **thêm cột** vào bảng chat đã tồn tại → thêm `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` trong `on_startup` của `main.py` (tuân thủ D4).
- **Thêm endpoint mới**: follow pattern `routers/chat.py` — dùng `SessionLocal` + try/finally, trả `{"status": "success", "data": ...}`.
- **Xoá User**: FK `sender_id ... ondelete="SET NULL"` đã lo cascade, nhưng nếu handler xoá user chạy raw SQL, đảm bảo **không** thêm `DELETE FROM chat_messages WHERE sender_id=...` (D3).
- **Hướng dẫn user**: sửa `docs/HDSD_Chat.md` (và mirror `frontend/src/docs/HDSD_Chat.md`) + `HelpPage.jsx` (import + GUIDES entry).
- **Menu**: thêm/bớt quyền menu chat ở `Layout.jsx` (`allNavItems`, `iconMap`, `MODULE_MAP`, `hasModuleAccess`).

---

## 6. Lịch sử Nhật ký & Sửa lỗi (Changelog & Debug Memory)

### 6.1 Recent Changes (2026-08-08) — Module Chat Nội bộ (WebSocket)

#### Feature: Chat Nội bộ (Internal Chat)
- **Backend**: 3 model mới (`ChatRoom`, `ChatRoomMember`, `ChatMessage`) trong `models.py` — `sender_id` FK `ondelete="SET NULL"` (D3); `ConnectionManager` trong `core/chat_ws.py`; router `routers/chat.py` (WS `/api/chat/ws` + REST rooms/messages) đã đăng ký trong `main.py`.
- **Frontend**: trang `Chat.jsx` / `Chat.css`, route `/chat` trong `App.jsx`, menu "Chat" trong `Layout.jsx`, service functions trong `api.js`.
- **Docs**: `docs/HDSD_Chat.md` + `frontend/src/docs/HDSD_Chat.md` (Hướng dẫn sử dụng), thêm vào `HelpPage.jsx`, README.md.
- **Chi tiết kiến trúc**: xem Section 5 — Module Chat Nội bộ.

### 6.1b Recent Changes (2026-08-10) — Phân quyền Chat (admin / trưởng phòng / phòng ban / nhóm)

#### Feature: Phân quyền Chat theo vai trò + Phòng ban
- **Backend**: `chat_rooms` thêm cột `department`, `owner_code` (migration trong `main.py`); `chat.py` thêm: loại phòng `department`, `_normalize_user()`, `_is_room_member()`/`_department_member_codes()` (thành viên phòng ban tính động theo `employees.department`), `_ensure_department_room()` (tự tạo phòng phòng ban khi mở Chat), `_can_manage_room()`; endpoints mới: `GET/PUT/DELETE /rooms/{room_id}` + `GET/POST /rooms/{id}/members` + `DELETE /rooms/{id}/members/{code}`.
- **Frontend**: `Chat.jsx` viết lại logic theo vai trò (`user`/`head`/`admin` + chủ nhóm) — modal quản lý phòng (thành viên + cài đặt + xoá), tab tạo phòng phòng ban (admin chọn phòng ban, head cố định phòng ban mình), nhóm phòng theo mục "Phòng ban / Nhóm / Nhắn riêng"; `api.js` thêm 5 hàm chat mới; `Chat.css` thêm styles quản lý phòng.
- **Docs**: `docs/HDSD_Chat.md` + mirror `frontend/src/docs/HDSD_Chat.md` cập nhật bảng phân quyền.
- **Chi tiết kiến trúc**: xem Section 5 — Module Chat Nội bộ.

### 6.1c Recent Changes (2026-08-10) — Ghim tin nhắn quan trọng

#### Feature: Pin tin nhắn lên header box chat
- **Backend**: `chat_messages` thêm cột `is_pinned`/`pinned_by`/`pinned_at` (migration `main.py`); endpoints `GET /rooms/{room_id}/pinned`, `PUT/DELETE /messages/{id}/pin`; sau khi ghim/bỏ ghim broadcast WS `{event:"pin_updated", room_id, pinned:[...]}` để cập nhật realtime cho mọi client.
- **Frontend**: `Chat.jsx` — thanh ghim dưới header (hiện tối đa 3 tin, dư thì nút **"+n nữa"** mở modal danh sách ghim), nút **📌 ghim/bỏ ghim** trên từng tin nhắn (hover), xử lý sự kiện WS `pin_updated`; `api.js` thêm `getChatPinnedMessages/pinChatMessage/unpinChatMessage`; `Chat.css` thêm styles thanh ghim.
- **Quy tắc**: mọi thành viên phòng ghim được; chỉ người ghim hoặc người quản lý phòng (`_can_manage_room`) mới bỏ ghim.
- **Docs**: `docs/HDSD_Chat.md` + mirror — Bước 4: Ghim tin nhắn quan trọng.

### 6.2 Recent Changes (2026-08-03)

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

### 6.3 PostgreSQL Migration (Version 2.0)

- **Removed SQLite support** - PostgreSQL 14+ là database duy nhất được hỗ trợ
- **Updated database architecture** - SQLAlchemy ORM với PostgreSQL optimization
- **Removed SQLite legacy code** - All SQLite-specific code removed from codebase
- **Files Changed**:
  - `backend/app/core/session.py` - PostgreSQL-only
  - `backend/app/core/database.py` - PostgreSQL schema initialization
  - `backend/app/core/db.py` - PostgreSQL-optimized
  - All routers updated to use PostgreSQL-compatible date/time syntax

### 6.4 OnlyOffice Integration Complete

- OnlyOffice container configured in docker-compose.yml (port 8080)
- Backend config: `BACKEND_PUBLIC_URL`, `ONLYOFFICE_URL`, `ONLYOFFICE_PUBLIC_URL`
- Test page created: `frontend/public/test-onlyoffice.html` — ALL TESTS PASS
- OnlyOfficeViewer.jsx with debug logs
- CSS in shared.css (`.oov-close-btn-floating`)

### 6.5 Salary Module Integration

- **Migrated from**: `web_simple` project
- **Integration Date**: December 2024
- **Features**:
  - Upload Excel + Template DOCX → Generate PDFs
  - Auto-save to database + storage
  - Password-encrypted PDFs
  - User self-service view
  - Admin bulk generation

---

## 7. AI Core Directives — MỆNH LỆNH TỐI THƯỢNG

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
- ✅ Mọi cập nhật PHẢI append vào `PROJECT_MEMORY.md` (Mục 6 — Changelog)

---

## 8. Quick Reference

### 8.1 Default Login

| Mã NV | Vai trò | Mật khẩu |
|-------|---------|----------|
| `admin` | admin | `admin` |
| `administrator` | admin | `administrator` |

### 8.2 Ports

| Service | Internal | External | Access URL |
|---------|----------|----------|------------|
| Frontend | 80 | 8088 | http://10.0.0.9:8088 |
| Backend | 8000 | 8000 | http://10.0.0.9:8000 |
| OnlyOffice | 80 | 8080 | http://10.0.0.9:8080 |
| PostgreSQL | 5432 | 5432 | 10.0.0.9:5432 |

### 8.3 Database (33 tables)

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
| `chat_rooms` | 0 | Phòng chat (id UUID, type direct/group) |
| `chat_room_members` | 0 | Thành viên phòng chat (UNIQUE room_id+employee_code) |
| `chat_messages` | 0 | Tin nhắn chat (sender_id FK users — SET NULL khi xoá user) |
| ... | ... | Xem đầy đủ trong `backend/app/models.py` |

### 8.4 SSE Events (22 events)

> Chat Nội bộ **KHÔNG** dùng SSE — dùng WebSocket `/api/chat/ws` (xem Section 5).

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

## 9. Realtime Chat & WebSocket Maintenance

### 9.1 Cơ chế ConnectionManager (chat_ws.py)
- **Tối ưu RAM:** Sử dụng `dict` để map `employee_code` với danh sách các connection `ConnectionMeta`. `ConnectionMeta` là một `@dataclass(slots=True, eq=False)` sử dụng object identity hash (khắc phục lỗi unhashable).
- **Tránh block Event Loop:** Sử dụng `asyncio.gather` thay vì gửi tin nhắn đồng bộ trong vòng lặp. Điều này giúp không làm trễ event loop với số lượng tin nhắn và người dùng lớn.
- **Xử lý ngắt kết nối (Dead connections):** Tự động phát hiện rớt mạng đột ngột (half-open) thông qua ping/pong và `sweep_loop`. Dọn dẹp connection đúng cách không rác bộ nhớ.
- **Tính năng Multi-tab:** Cho phép 1 user (1 `employee_code`) kết nối từ nhiều tab.

### 9.2 Hướng dẫn Test & Mở rộng (Scale-out)
- **Test tải:** Script test tải nằm tại `ws_load_test.py`. Khi test chạy mô phỏng >100 client cùng lúc thì nên dùng chung `token` và `employee_code=admin` để bypass bước xác thực (tránh lỗi 403 Forbidden).
- **Scale-out (Nhiều uvicorn workers):**
  - Hiện tại WebSocket Manager lưu state trực tiếp trên RAM (trong scope của worker hiện tại).
  - Nếu deploy với nhiều worker (như `--workers 4`), các user kết nối vào worker khác nhau sẽ không nhìn thấy nhau.
  - **Giải pháp nâng cấp sau này:** Áp dụng mô hình Publish/Subscribe sử dụng **Redis Pub/Sub**. Mỗi worker sẽ publish các tin nhắn nhận được lên Redis và lắng nghe (subscribe) các tin nhắn từ worker khác để gửi đi cho các kết nối cục bộ của mình (đã có hook `set_cluster_publish`).

---

**Last Updated**: 2026-08-10  
**Maintained by**: GoldenFarm ICT Team  
**Status**: ✅ Production Ready
