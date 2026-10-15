# GOLDENFARM ICT Management System

Hệ thống quản lý ICT nội bộ — Quản lý nhân viên, thiết bị, license phần mềm, ticket hỗ trợ IT, đặt lịch xe/phòng họp và chat nội bộ realtime.

## Tech Stack

| Tầng | Công nghệ |
|------|-----------|
| **Backend** | FastAPI (Python 3.11+) + PostgreSQL 16 |
| **Frontend** | React 19 + Vite 6 + React Router 7 |
| **HTTP Client** | Axios 1.7 |
| **Realtime** | Server-Sent Events (SSE) + WebSocket (Chat nội bộ) |
| **Icons** | lucide-react (50+ icons) |
| **CSS** | Thuần CSS (CSS Custom Properties — dark/light mode) + `shared.css` cho pattern dùng chung |
| **Storage** | SMB (`pysmb`), FTP (`ftplib`), Google Drive (`google-api-python-client`, `google-auth`) |
| **Office Editor** | ONLYOFFICE Document Server + `@onlyoffice/document-editor-react` |
| **Diagram Editor** | Draw.io (Diagrams.net) — iframe embed qua `jgraph/drawio` Docker image |

## Pull branch kiểm thử client

Branch tích hợp `15092026` chứa mã nguồn frontend, backend, tài liệu và tham chiếu Draw.io cần thiết để kiểm thử. `docker-drawio` là Git submodule, vì vậy client phải clone kèm submodule:

```bash
git clone --branch 15092026 --recurse-submodules https://github.com/Khoavila12889/goldenfarmict.git
cd goldenfarmict
```

Nếu repository đã được clone trước đó:

```bash
git fetch origin
git switch 15092026
git pull --ff-only origin 15092026
git submodule update --init --recursive
```

Sao chép `.env.example` thành `.env`, điền cấu hình của môi trường test rồi kiểm tra Compose mà không in secret:

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

Không commit hoặc chuyển cho client các thư mục runtime `backend/uploads`, `backend/storage`, volume PostgreSQL hay file `.env`. Dữ liệu test phải được import/restore bằng quy trình riêng.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React 19)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │  Pages   │  │Components│  │  Hooks   │  │   Utils     │ │
│  │ Feature  │  │Shared UI │  │ Custom   │  │(booking +   │ │
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
                         │ WS   (/api/chat/ws) — chat nội bộ
┌────────────────────────┼────────────────────────────────────┐
│              Backend (FastAPI)                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │  Auth    │  │ Routers  │  │  Core    │  │   Utils     │ │
│  │ JWT-free │  │   APIs   │  │ DB/Events│  │ Seed/Import │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────────┘ │
│                         │                                    │
│                    ┌────┴────┐                               │
│                    │ PostgreSQL 16 │                               │
│                    │goldenfarmict│                              │
│                    └─────────┘                               │
└──────────────────────────────────────────────────────────────┘
```

## Kiến trúc kỹ thuật và luồng code toàn hệ thống

Phần này phản ánh code và schema đang chạy tại ngày 24/09/2026. Hệ thống là monolith tách frontend/backend: React gọi FastAPI qua `/api`; FastAPI dùng cả SQLAlchemy ORM lẫn helper raw SQL, lưu dữ liệu chính ở PostgreSQL và lưu file ở volume/bộ nhớ ngoài.

### Vòng đời một request

```text
Browser/APK
  → React Router kiểm tra phiên/route
  → api.js chọn base URL web hoặc server URL của APK
  → Nginx frontend
      ├─ /api/*         → FastAPI :8000
      ├─ /api/events    → SSE, tắt buffering
      ├─ /api/chat/ws   → WebSocket
      ├─ /onlyoffice/*  → ONLYOFFICE Document Server
      └─ /drawio/*      → Draw.io
  → FastAPI router
  → xác thực/phân quyền của endpoint
  → ORM SessionLocal hoặc helper raw SQL
  → PostgreSQL / filesystem / SMB / FTP / Google Drive
  → JSON, stream hoặc file response
  → React cập nhật state; SSE/WS cập nhật realtime khi có sự kiện
```

Frontend có ba lớp bảo vệ route: `ProtectedRoute` yêu cầu token, `AdminRoute` kiểm tra role/quyền module, `StrictAdminRoute` chỉ nhận admin. Đây là lớp UX; backend vẫn phải xác minh lại vì dữ liệu trong `sessionStorage` có thể bị sửa từ trình duyệt.

### Khởi động và dừng backend

`backend/main.py` thực hiện theo thứ tự:

1. Khởi tạo event loop SSE và runtime chat (WebSocket manager, hàng đợi persist, Redis bridge nếu cấu hình).
2. Chạy `Base.metadata.create_all(checkfirst=True)` cho bảng chưa tồn tại.
3. Seed role permission mặc định.
4. Chạy các `ALTER TABLE ... IF NOT EXISTS`, tạo index chat/công thức và bổ sung unique constraint tương thích dữ liệu cũ.
5. Khi shutdown, flush/dừng runtime chat.

Đây là migration tự quản trong startup, chưa dùng Alembic. `create_all()` chỉ tạo bảng, không tự thay đổi cột cũ; mọi thay đổi schema mới phải có migration tường minh và phải idempotent.

### Bản đồ module frontend–backend–database

| Module | Frontend chính | Router/service backend | Bảng dữ liệu chính | Luồng kỹ thuật |
|---|---|---|---|---|
| Đăng nhập/Hồ sơ/RBAC | `Login`, `Profile`, `Permissions`, `Layout` | `auth.py`, `core/auth.py` | `users`, `employees`, `user_permissions`, `role_permissions`, `department_permissions`, `departments` | Xác thực mật khẩu → identity hiệu lực → permission theo user/phòng ban/role → lưu session phía client |
| Dashboard | `Dashboard`, `AnnouncementsBox` | `dashboard.py`, một phần `forum.py` | Tổng hợp employee/equipment/ticket/booking/trip và `forum_posts` | Query KPI + dữ liệu user/head/admin; SSE làm mới khi module phát event |
| Nhân viên | `Employees` | `employees.py` | `employees`, `users`, liên kết ứng dụng tới equipment/license | CRUD/import tạo employee và account cùng transaction; gán trưởng phòng đồng bộ role |
| Thiết bị | `Equipment` | `equipment.py` | `equipment`, `equipment_history`, `employees` | Cấp phát/thu hồi/bàn giao; ghi history; import upsert theo asset code |
| License | `Licenses` | `licenses.py` | `licenses`, `lic_categories`, `lic_items`, `equipment` | Key theo thiết bị/nhân viên; danh mục license và file hợp đồng |
| Ticket | `Tickets` | `tickets.py` | `tickets`, `employees` | Tạo ticket → trạng thái/xử lý → tính vị trí queue → SSE |
| Booking | `BookingPage`, component/hook booking | `bookings.py` | `resources`, `bookings` | Chọn tài nguyên/ngày/giờ → xác thực người tạo → kiểm tra lịch → cập nhật trạng thái → SSE |
| Nghỉ phép/Công tác | `nghiphep`, booking dialogs/panel | `business_trips.py`, `approvals.py` | `business_trips`, `approval_requests`, workflow/log | Form tạo approval request; khi duyệt hết bước sẽ materialize sang business trip |
| Phê duyệt | `Approvals`, `WorkflowTemplates` | `approvals.py` | `workflow_templates`, `workflow_steps`, `approval_requests`, `approval_logs` | Draft → submit → từng approver theo role/cá nhân + phòng ban → approved/rejected/cancelled |
| Todos | `Todos` | `todos.py`, `comments.py`, `attachments.py`, `upload_service.py` | `todos`, `todo_subtasks`, `comments`, `attachments`, `notifications` | Lọc theo scope/quyền → CRUD/status/approve → comment/file/URL → notification/SSE |
| Tài liệu | `Documents`, viewer/share components | `documents.py`, `shares.py`, storage utils | `storage_config`, `storage_permissions`, `document_shares` | Resolve storage → kiểm tra quyền folder → browse/stream/upload → ONLYOFFICE/Draw.io hoặc share link |
| Chat | `Chat` | `chat.py`, `chat_*`, `chat_archive_service.py` | `chat_rooms`, `chat_room_members`, `chat_messages`, file chat | WS xác thực/member check → queue ghi DB theo batch → commit rồi broadcast; REST lịch sử cursor/quản lý phòng/backup |
| Forum/Thông báo | `AnnouncementsBox`, viewer PDF | `forum.py`, `pdf_pages.py` | `forum_posts`, `forum_replies`, file forum | Bài đăng theo target → reply/attachment → SSE; PDF có thể render theo trang |
| Phiếu lương | `SalarySlip`, `SalarySlipAdmin`, hooks | `salary_user.py`, `salary_slips.py`, PDF/Excel utils | `salaries`, `salary_slips`, `salary_upload_logs`, `employees`, `users` | Import Excel theo tháng → JSON/record → xem có password → xuất PDF/ZIP |
| Công thức/In nhà máy | `FormulaManagement`, `FactoryPrinting` | `formulas.py`, formula hooks, Windows print agent | `formula_recipes`, `formula_print_logs`, `formula_print_jobs`, file Excel/PDF và ảnh trang riêng tư | Nghiên cứu upload → backend chuyển PDF → nhà máy gửi lệnh in → agent Windows in qua spooler → ghi log và SSE |
| Phần mềm | phần quản trị liên quan | `software.py` | `software_categories`, `software_items` | CRUD danh mục/mục phần mềm và hợp đồng |
| Giám sát | `MonitorPage` | `monitor.py` | trạng thái runtime | Admin đọc tình trạng server/service |
| Backup | `AdminBackups`, backup UI trong Chat | `module_backups.py`, `module_backup_service.py`, `chat_archive_service.py` | ZIP + bảng thuộc module | Scan → chọn → manifest/ZIP → tùy chọn cleanup → upload/restore idempotent |

### Cơ sở dữ liệu

Schema PostgreSQL hiện có 40 bảng vật lý; 39 bảng thuộc model/nghiệp vụ hiện hành và `users_backup` là bảng lưu cũ không có ORM model. Các nhóm dữ liệu:

| Nhóm | Bảng |
|---|---|
| Nhân sự/tài khoản | `employees`, `users`, `departments` |
| Tài sản/license/phần mềm | `equipment`, `equipment_history`, `licenses`, `lic_categories`, `lic_items`, `software_categories`, `software_items` |
| Hỗ trợ/công việc | `tickets`, `todos`, `todo_subtasks`, `comments`, `attachments`, `notifications` |
| Lịch/phê duyệt | `resources`, `bookings`, `business_trips`, `workflow_templates`, `workflow_steps`, `approval_requests`, `approval_logs` |
| Lương | `salaries`, `salary_slips`, `salary_upload_logs` |
| Tài liệu | `storage_config`, `storage_permissions`, `document_shares` |
| Chat/forum | `chat_rooms`, `chat_room_members`, `chat_messages`, `forum_posts`, `forum_replies` |
| Công thức | `formula_recipes`, `formula_print_logs`, `formula_print_jobs` |
| Phân quyền | `user_permissions`, `role_permissions`, `department_permissions` |

Database thực tế chỉ có 7 foreign key: bốn FK của chat và ba FK của công thức. Chat room/member/message dùng `CASCADE` hoặc `SET NULL`; formula log dùng cascade theo recipe. Các quan hệ còn lại như employee–equipment, todo–children, booking–resource, workflow–step/request/log và storage–permission/share được giữ bằng ID/code nhưng kiểm soát ở code ứng dụng.

Hệ quả kỹ thuật:

- Xóa dữ liệu phải theo đúng thứ tự ở service/router; database không tự bảo vệ toàn bộ orphan record.
- `employee_code` là khóa nghiệp vụ xuyên module nhưng phần lớn không có FK.
- Nhiều trường ngày/giờ là `String`, nên format ISO phải được giữ nhất quán để lọc/sắp xếp đúng.
- Index tập trung ở employee code, trạng thái, module permission, chat room/time và formula search. Các cột join không có index cần được đo bằng `EXPLAIN ANALYZE` trước khi bổ sung.
- Số dòng từ `pg_stat_user_tables` chỉ là thống kê ước lượng và có thể cũ; không dùng thay cho `COUNT(*)` khi đối soát backup.

### Xác thực và phân quyền

- Mật khẩu mới dùng Argon2; hash SHA-256 cũ được kiểm tra rồi nâng cấp sang Argon2 sau login thành công.
- Token phiên hiện là SHA-256 rút gọn từ `employee_code:role:SESSION_SALT`; không phải JWT, không lưu server-side và không có hạn dùng/revoke riêng.
- Role hiệu lực lấy từ database; nhân viên được gán `departments.head_id` có thể được nâng thành `head`.
- Quyền module hợp nhất từ role, department và override user; menu dựa trên quyền hiệu lực tải từ backend.
- Chat, Todos, attachment/comment, formula, salary và backup mới có xác minh session tương đối rõ. Một số router cũ vẫn chỉ nhận `user_role`, `user_code` từ query/body hoặc chưa bắt buộc token cho mọi thao tác.

### Realtime và file/storage

- SSE `/api/events` là bus trong process, phát các sự kiện ticket/booking/trip/todo/approval và heartbeat 20 giây. Nếu chạy nhiều backend worker, SSE hiện chưa có broker dùng chung.
- Chat WebSocket hỗ trợ nhiều tab/user, heartbeat, sweep socket chết và giới hạn gửi đồng thời. Tin nhắn chỉ được broadcast sau khi queue ghi PostgreSQL theo batch đã commit; lỗi ghi được trả về client. Redis Pub/Sub chỉ bật khi có `CHAT_REDIS_URL`.
- Upload Todo/Chat/Forum nằm trong `backend/uploads`; backup ZIP nằm trong `backend/storage`; các thư mục này được bind mount để tồn tại qua recreate container.
- Documents không lưu nội dung file trong PostgreSQL: database giữ cấu hình/quyền/share, còn byte file ở SMB, FTP hoặc Google Drive. ONLYOFFICE và Draw.io được reverse proxy cùng origin qua Nginx.

### Đánh giá kỹ thuật toàn hệ thống

| Mức | Phát hiện | Hướng xử lý |
|---|---|---|
| P0 bảo mật | Token xác định, salt hard-code, không hết hạn; nhiều endpoint cũ chưa xác thực backend thống nhất | Chuyển sang session ngẫu nhiên có expiry/revoke hoặc JWT ký bằng secret môi trường; dependency xác thực chung cho mọi router |
| P0 bảo mật | Luồng reset bằng mã NV + email cá nhân không có OTP; một số API tin `user_role/user_code` client gửi | Bắt buộc phiên/OTP, luôn resolve identity từ token, không tin role/body/query |
| P1 dữ liệu | Chỉ 7 FK cho 39 bảng, phần lớn quan hệ do code giữ | Lập migration bổ sung FK/index theo từng module sau khi quét orphan; không thêm hàng loạt trực tiếp trên production |
| P1 dữ liệu | Ngày/giờ và JSON chủ yếu lưu `String/Text` | Chuyển dần sang `DATE/TIMESTAMP/TIME/JSONB` bằng migration có kiểm tra dữ liệu lỗi |
| P1 vận hành | Migration nằm trong startup và lỗi có xu hướng fail-soft | Dùng Alembic, version schema, backup trước migration và fail startup khi migration bắt buộc thất bại |
| P1 bảo mật | `storage_config.password` và ZIP Nhân viên là dữ liệu nhạy cảm | Mã hóa secret at rest, tách key khỏi DB, hạn chế quyền và mã hóa backup ngoại vi |
| P2 kiến trúc | Router trộn validation, SQL và nghiệp vụ; dùng song song ORM/raw SQL | Tách schema/service/repository, chuẩn hóa transaction và response/error contract |
| P2 realtime | Chat đã commit trước broadcast; còn thiếu outbox và retry client idempotent; SSE chỉ trong một process | Nghiệm thu staging, bổ sung recovery/outbox khi cần scale |
| P2 hiệu năng | Frontend bundle lớn và nhiều page import tĩnh; một số danh sách chưa phân trang server | Lazy route/code splitting, pagination, debounce và đo query chậm trước khi tạo index |
| P2 chất lượng | Test tích hợp còn thiên về thao tác thủ công | Thêm pytest/API tests, restore fixtures, frontend tests và CI migration/build |

Ưu tiên triển khai hợp lý: chuẩn hóa xác thực backend → backup toàn hệ thống và migration framework → bổ sung constraint/index theo dữ liệu thật → test CI → background job cho tác vụ ZIP/PDF/Excel lớn.

## Nâng cấp Chat hướng tới 500 người dùng — 15/10/2026

Bản sửa có commit trước xác nhận gửi, queue giới hạn, lịch sử cursor, truy vấn danh sách phòng theo lô, chống tạo trùng phòng cá nhân, nhóm tối đa 500 thành viên và URL tệp có chữ ký. Đã bổ sung kiểm thử cô lập và công cụ nghiệm thu tải staging. **Chưa deploy hoặc chứng nhận 500 kết nối thực tế.**

Xem [thiết kế, kiểm thử, giới hạn và quy trình triển khai Chat](docs/CHAT_PRODUCTION.md). Mục này thay thế mô tả luồng optimistic cũ của Chat; các mục toàn hệ thống còn lại giữ phạm vi riêng.

## Features

### 🗄️ Backup dữ liệu theo module (admin)

- Trang `/admin/backups` dành riêng cho role `admin`, truy cập từ menu **Backup dữ liệu**.
- Scan theo khoảng ngày, xem dữ liệu liên quan, chọn từng bản ghi hoặc chọn tất cả trước khi tạo ZIP.
- Hỗ trợ `Todos`, `Booking` và `Nhân viên`; Todos/Booking có snapshot hoặc backup+dọn, Nhân viên chỉ snapshot an toàn.
- Có danh sách ZIP trên server, tải xuống, upload lại, restore idempotent và xóa bản backup.
- File Todo được kiểm tra CRC, kích thước và SHA-256; giao diện cảnh báo attachment bị thiếu tại thời điểm backup.

### 📊 Dashboard
- **Giao diện mới** (`frontend/src/pages/dashboard.css`, class `d-*`): layout **NEXUS CORE ERP** — hàng **5 thẻ KPI** (Tổng NV, Thiết bị, Ticket chờ xử lý, Lịch đặt hôm nay, **NV xin nghỉ/công tác**), nội dung chính **65/35** (Thông báo nội bộ + Ticket theo trạng thái), khu sự kiện dạng lưới. **Click vào thẻ số liệu** mở modal xem chi tiết danh sách (cuộn khi nhiều).
- **Admin**:
  - 5 thẻ KPI thống kê tổng quan (Tổng NV, Thiết bị quản lý, Ticket chờ xử lý, Lịch đặt hôm nay, **NV xin nghỉ/công tác**). Click thẻ **Lịch đặt hôm nay** / **NV xin nghỉ/công tác** → modal chi tiết.
  - Khung thông báo nội bộ (AnnouncementsBox).
  - Bảng Ticket theo trạng thái (chờ xử lý, đang xử lý, đã xử lý, đã hủy) pill tags, bấm mở rộng xem danh sách ticket.
  - **🧳 Nhân viên đi công tác hôm nay**: Widget danh sách NV đang công tác hôm nay, điểm đến, thời gian (bấm "Xem tất cả" mở modal).
- **User / Trưởng phòng**:
  - **Đơn chờ duyệt** (trưởng phòng): widget **🗂️ Đơn chờ duyệt** + nút Duyệt/Từ chối.
  - **Trạng thái đơn của tôi**: widget **📋 Trạng thái đơn của tôi** (nghỉ phép/công tác — chờ duyệt / đã duyệt / bị từ chối).
  - **NV phòng đang xin nghỉ/công tác** (trưởng phòng): liệt kê nhân viên phòng mình đang xin, click "Xem tất cả".
  - Lịch đặt của user, ticket cá nhân, queue position, thông báo nội bộ.
- **Định dạng ngày**: hiển thị `dd/mm/yyyy` toàn dashboard.
- **User**: Kanban ticket cá nhân, lịch đặt của user, queue position trong hàng đợi ticket, thông báo nội bộ.

### 👥 Quản lý nhân viên (admin)
- Bảng + filter phòng ban + tìm kiếm realtime
- Panel chi tiết inline-edit
- Modal thêm/sửa
- Cascade: xoá NV → thu hồi thiết bị về kho, giữ lại ticket/booking (set NULL)
- **Import CSV**: Hỗ trợ import hàng loạt qua file CSV, tự động tạo tài khoản đăng nhập (`users`) cho nhân viên mới với mật khẩu mặc định (mã NV) đã được mã hóa Argon2
- **Tự động tạo tài khoản**: Khi thêm nhân viên mới (form hoặc import CSV), hệ thống tự động khởi tạo tài khoản trong bảng `users` với role `user`, `is_first_login=True`, đồng bộ trong cùng 1 database transaction

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
- **Bàn giao (Handover)**: thiết bị đang sử dụng có nút **Bàn giao** → mở ô tìm nhân viên mới → gọi `PUT /equipment/{id}/transfer` (đóng lịch sử cũ, gán NV mới). Thiết bị trong kho dùng **Cấp phát** (`/allocate`).
- **Thu hồi về kho** (giữ nguyên API)
- **Lịch sử bàn giao** (handover/return date) với timeline UI
- **Density**: 3 mức (compact/normal/comfortable), lưu vào localStorage
- **Column visibility**: Toggle cột, lưu vào localStorage
- **Keyboard**: Escape đóng menu/modal
- License gán theo thiết bị
- **Export/Import Excel (xlsx)**: Xuất toàn bộ danh sách thiết bị ra file Excel (cột: Mã nhân viên, Tên nhân viên, Bộ phận, Mã thiết bị, Loại thiết bị, Thông số thiết bị, Windows OS, Sức khỏe, Ngày cấp, Ngày bàn giao, Ngày thu hồi, Mô tả, Ghi chú, License, License Key, Hạn dùng license, Kích hoạt) và nhập lại từ file Excel (nhận diện header tiếng Việt, upsert theo mã tài sản, tự xử lý license gắn theo thiết bị)

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

**Tích hợp Đăng ký Nghỉ phép / Công tác (Booking module):**
- Đăng ký nghỉ phép (tab **Nghỉ phép / Việc**) và đăng ký công tác (tab **Công tác**) nay đi qua **cùng kênh duyệt** này thay vì tạo thẳng lịch.
- Quy trình duyệt được **tự chọn tự động** theo loại:
  - Nghỉ phép → template có tên chứa `nghỉ` / `phép` / `leave`.
  - Công tác → template có tên chứa `công tác` / `trip` / `business`.
  - Không tìm thấy → dùng template active đầu tiên (fallback). Nếu không có workflow active, form báo lỗi hướng dẫn liên hệ quản trị viên.
- Trạng thái phiếu của user: `Nháp` → `Chờ duyệt` → `Đang duyệt` → `Đã duyệt` / `Bị từ chối`.

**Dashboard — widget duyệt & trạng thái:**
- **Trưởng phòng (role `head`)**: widget **🗂️ Đơn chờ duyệt** ngay trên Dashboard — hiển thị đơn nghỉ phép/công tác của phòng ban mình và nút **✅ Duyệt / ❌ Từ chối**. Chỉ người đúng chức vụ + cùng phòng ban với người gửi mới thấy/duyệt được.
- **Mọi user**: widget **📋 Trạng thái đơn của tôi** — xem trạng thái duyệt của các đơn mình đã gửi (`chờ duyệt / đã duyệt / bị từ chối / nháp / hủy`).
- **SSE realtime + Toast:**
  - Có đơn mới gửi → **trưởng phòng** nhận toast "📥 Đơn mới chờ duyệt" và list tự cập nhật.
  - Đơn được duyệt/từ chối → **user sở hữu đơn** nhận toast "✅ đã được duyệt" / "❌ bị từ chối", trạng thái đơn cập nhật realtime (không cần refresh).
  - Sau khi trưởng phòng duyệt xong, `loadData` chạy lại để dashboard lịch hôm nay cập nhật.

**Lưu trữ sau khi duyệt:**
- Khi phiếu đạt trạng thái **`approved`** (hết tất cả bước duyệt), backend **tự ghi vào bảng `business_trips`** (status `active`) để lịch nghỉ phép/công tác hiển thị trên Dashboard "Nhân viên đi công tác / nghỉ hôm nay" và booking page.
- Gắn `business_trips.approval_request_id` để tránh trùng lặp khi đơn được tạo lại (idempotent).
- Nếu phiếu **từ chối/huỷ** → không ghi vào `business_trips`.

> **⚠️ Cần cấu hình trước:** Hệ duyệt dựa trên `workflow_templates` + `workflow_steps`.
> 1. Phải có ≥ 1 workflow active (admin tạo ở trang **Workflow Templates**). Nếu chỉ muốn nghỉ phép, đặt tên chứa `nghỉ phép` để tự ưu tiên.
> 2. Bước duyệt cần cấu hình `approver_type='role'`, `approver_value` = đúng **chức danh (position)** của trưởng phòng (VD `Trưởng phòng`), bật `department_match` (cùng phòng ban).
> 3. Sau khi thêm cột mới (`business_trips.approval_request_id`) cần khởi động lại backend để migration chạy: `docker compose restart backend`.

### 🛠️ Công cụ vẽ sơ đồ (Draw.io — `/tools/drawio`)
- **Workspace Layout**: Toolbar + canvas area, giao diện giống phần mềm độc lập nhúng trong web
- **Toolbar**: Icon PenTool + tiêu đề, input tên bản vẽ (mặc định `Ban_ve_moi_1`), nút "Tải xuống XML" và "Lưu lên hệ thống"
- **Tích hợp Draw.io**: Nhúng iframe Draw.io (Diagrams.net) qua Docker image `jgraph/drawio`, load/save qua `postMessage`
- **Hỗ trợ 2 chế độ**: Standalone (tools page, lưu local) và Documents (lưu lên SMB/FTP/GDrive)
- **File extension**: `.drawio` và `.xml` — mở trực tiếp bằng DrawioViewer trong Documents

### 💰 Quản lý phiếu lương (Salary Slip)

- **Admin — 3 Tab UI** (`SalarySlipAdmin.jsx`):
  1. **Nhân viên (Employees)**: Search typeahead (tìm theo mã/tên NV) → chọn kết quả → form chỉnh sửa. Chỉ hiển thị NV đã có phiếu lương trong tháng đang chọn. Các field chia theo section: Thông tin NV, Mức lương & Công, Thu nhập (A), Khấu trừ (B) & Thực nhận, Theo dõi phép năm & Giờ tích lũy, Ghi chú. Nút Lưu (save JSON), Xuất PDF (có password), Xóa.
  2. **Import Excel**: Giao diện 3 bước — (1) chọn tháng import bằng **bộ chọn tháng** (nút ◀ ▶ + Custom Month Picker popup lưới T1–T12), (2) chọn file .xlsx/.xls, (3) nút Import (ghi rõ tháng). Tự động parse cột lương/thuế/phép → lưu JSON vào `salaries` → tạo user + employee record nếu chưa có. Hỗ trợ ghi đè nếu tháng đã tồn tại (có cảnh báo).
  3. **Lịch sử (History)**: Danh sách các lần upload Excel (tháng, filename, số NV, người upload, thời gian).
- **Quy tắc chốt lương (Import month cap)**: Lương tháng trước được trả vào ngày 5 tháng sau (VD: 5/9 trả lương tháng 8) → **không thể import tháng hiện tại**, tháng tối đa chọn được luôn là **tháng trước tháng hiện tại** (khóa trong lịch, có ghi chú hướng dẫn dưới bộ chọn tháng).
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
- **Export/Import Excel (xlsx)**: Xuất danh sách license ra file Excel (cột: Mã nhân viên, Tên nhân viên, Bộ phận, Mã thiết bị, Loại thiết bị, S/N, License Key, Product, Kích hoạt, Hết hạn, Ghi chú, ID thiết bị) và nhập lại từ file Excel — upsert theo `equipment_id + license_key`, tự tìm thiết bị qua `asset_code`/`S/N` nếu thiếu ID
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
- **Online Office Editor**: Chỉnh sửa .docx/.xlsx/.pptx trực tuyến qua ONLYOFFICE Document Server (DocsAPI load qua frontend nginx proxy `/onlyoffice`, same-origin, không phụ thuộc external proxy)
- **Draw.io Editor**: Vẽ sơ đồ trực tuyến (.drawio/.xml) qua Draw.io (Diagrams.net) — iframe embed, load/save qua postMessage
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
- **Export/Import Config**: Lưu cấu hình storage dưới dạng file JSON, import lại sau
- **🔗 Chia sẻ link (File & Thư mục)**: Mỗi file hoặc thư mục có thể tạo **link chia sẻ** với 3 hình thức — **Tất cả nhân viên** (ALL), **Theo phòng ban** (DEPT), **Công khai / Link** (PUBLIC), kèm **quyền truy cập** (Xem / Tải xuống / Chỉnh sửa). Link dùng chung một Modal "Chia sẻ", hiển thị URL + **QR code**, nút **Sao chép** (hoạt động cả trên mạng LAN HTTP nhờ fallback `document.execCommand`), đặt **ngày hết hạn** tùy chọn, và danh sách **chia sẻ hiện tại** để **thu hồi**.
- **📂 Chia sẻ thư mục (Share Folder)**: Khi chia sẻ một **thư mục**, khách mở link sẽ thấy giao diện duyệt thư mục (Grid/List) thay vì ONLYOFFICE — gồm **breadcrumb bị chặn ở thư mục gốc** (không thể đi ra ngoài phạm vi chia sẻ), tải từng file, hoặc **nén .zip toàn bộ thư mục** (chỉ khi thư mục nhỏ — giới hạn mặc định 200 file / 200MB). Khi bấm vào một file con, trình xem mở **toàn màn hình (full-screen overlay) giống hệt trình xem ONLYOFFICE của module nội bộ** — editor ONLYOFFICE / ảnh / PDF chiếm trọn viewport, thanh công cụ gồm nút **Quay lại thư mục**, **Tải xuống** và **Đóng** (hoặc phím **Esc**) để trở về danh sách. Mọi request phía backend đều **tái xác thực vị trí** (path-prefix cho SMB/FTP, duyệt `parents` cho Google Drive) nên khách không thể thoát khỏi thư mục được chia sẻ.
- **🔐 Quyền chia sẻ**: mỗi link lưu danh sách quyền `view,download,edit` — `view` luôn bật (xem online), `download` bật/tắt nút Tải xuống và `.zip` (backend chặn HTTP 403), `edit` chỉ cho link nội bộ (ALL/DEPT) mở ONLYOFFICE ở chế độ sửa và **lưu ngược về kho**; link PUBLIC luôn **view-only**.
  ### ✅ Quản lý Công việc & Todos (User & Phòng ban)
- **Kanban Board**: Cần làm, Đang xử lý, Đã hoàn thành, Đã hủy; cột **Chờ duyệt** chỉ hiện khi phòng ban của người xem áp dụng cơ chế chờ duyệt (với Admin không thuộc phòng ban nào: hiện nếu có phòng ban áp dụng). Công việc phòng ban có `is_dept_approved = 0` nằm trong cột này đến khi được duyệt. Danh sách có thể gom theo người nhận hoặc trạng thái.
- **Phạm vi phân quyền (Scope)**: Switch giữa cá nhân (Personal Todos) và phòng ban (Department Shared Todos).
- **Chờ duyệt theo phòng ban**: Vào **Phân quyền → Phân quyền Module**, chọn **Phòng ban**, bật công tắc **Công việc — Cơ chế Chờ duyệt** rồi lưu. Mặc định mọi phòng ban đều tắt; quyền theo vai trò hoặc cá nhân không bật được cơ chế này.
- **Khi tạo công việc**: Việc cá nhân luôn có `is_dept_approved = 1`. Việc phòng ban có `is_dept_approved = 0` khi phòng ban đích yêu cầu chờ duyệt và cần Trưởng phòng/Admin phê duyệt; nếu tắt thì lưu `is_dept_approved = 1` ngay. Sửa nội dung công việc không tự đưa việc đã duyệt về trạng thái chờ; chuyển phạm vi hoặc phòng ban sẽ tính lại theo chính sách nơi đến.
- **Hiển thị khi tắt chờ duyệt**: Mọi người thuộc phòng ban đã tắt (kể cả Trưởng phòng/Admin thuộc phòng ban đó) không thấy cột Kanban **Chờ duyệt**; công việc cũ có `status = review` vẫn hiện dưới **Cần làm** để không thất lạc. Không thể chuyển thủ công công việc của phòng ban này sang `review`. Thay đổi cấu hình chỉ quyết định việc tạo mới hoặc việc chuyển phạm vi/phòng ban, không tự phê duyệt hàng loạt công việc cũ.
- **Phân công & Giao việc**: Phân công người chịu trách nhiệm, người tạo, hạn chót (Due Date), tags/nhãn và độ ưu tiên (Low, Medium, High, Urgent 🚨).
- **Hạn hoàn thành (Due Date)**: Chọn ngày bằng **calendar picker** (`type="date"`, không nhập tay, không cần giờ). Không thể đặt hạn **trước ngày hiện tại** — hiện cảnh báo ⚠️ và chặn lưu.
- **Subtask Checklist & Progress Bar**: Tạo các việc con (subtasks), đánh dấu hoàn thành trực quan với thanh phần trăm tiến độ (Progress %).
- **Cảnh báo quá hạn (Overdue Alert)**: Đánh dấu đỏ các công việc trễ hạn cần ưu tiên xử lý.
- **Quyền User**: Được tạo, chỉnh sửa, chuyển trạng thái công việc do mình tạo/được giao, và **xóa công việc do chính mình tạo** (frontend + backend enforce).
- **Realtime SSE Sync**: Tự động cập nhật Kanban realtime giữa các thành viên cùng phòng ban khi có thay đổi.
- **Xác thực linh hoạt**: Người dùng có thể tạo todos ngay cả khi chưa có trong bảng `users` (tự động gán role mặc định `user`) — không chặn workflow do thiếu bản ghi user.
- **Tối ưu hiệu suất**: Giảm truy vấn database không cần thiết, khởi tạo biến rõ ràng, logic phân quyền dễ bảo trì.

### 💬 Chat Nội bộ (WebSocket — ĐỘC LẬP với SSE)

- **Realtime 2 chiều**: Nhắn tin trực tuyến qua WebSocket `WS /api/chat/ws` — hoạt động **độc lập** với hệ thống SSE `/api/events`.
- **Xác thực qua query param**: WebSocket không gửi được Header Authorization → đọc `token` + `employee_code` từ query string, xác minh bằng `verify_token()` trong `app/core/auth` (D6 — không hard-code user id). Token sai → đóng kết nối ngay với close code **1008**.
- **Direct & Group**: Phòng chat `direct` (1-1, không cần tên) hoặc `group` (theo tên nhóm); thành viên quản lý qua bảng `chat_room_members` (UNIQUE room_id + employee_code).
- **Lưu tin nhắn**: Mỗi tin nhắn được lưu vào `chat_messages` qua **SQLAlchemy ORM** trước khi broadcast tới mọi thành viên phòng.
- **History**: REST `GET /api/chat/messages/{room_id}` phân trang `limit`/`offset`, kèm tên người gửi (LEFT JOIN `employees`), chỉ thành viên phòng mới xem được.
- **Quản lý backup (admin)**: Chọn **phòng ban** (`department`), chat **nhóm** (`group`) và/hoặc chat **1:1** (`direct`), chọn khoảng ngày, bấm **Xem trước**, rồi chọn cụ thể từng tên phòng ban/nhóm/user cần backup. Chỉ cho phép backup đến hết ngày hôm qua; mỗi lần tối đa 367 ngày. ZIP đã được xác minh mới được dùng để dọn đúng tin nhắn của các phòng đã chọn, còn phòng và thành viên vẫn được giữ lại.
- **Lưu trữ/khôi phục backup**: Tên file lấy theo các phòng thực sự được backup, ví dụ `bk_01-08-2026_den_31-08-2026_nhan-su_khoa.zip` (tự thêm `_2`, `_3` nếu trùng). Tên được bỏ dấu và thay ký tự không hợp lệ bằng `-`; nhiều phòng ngăn bằng `_`. Admin có thể tải ZIP về PC, xóa bản trên VPS, tải lại ZIP tối đa 50 MB và khôi phục; message ID đã tồn tại được bỏ qua để tránh trùng dữ liệu.
- **ConnectionManager** (`core/chat_ws.py`): Quản lý kết nối theo `employee_code` (hỗ trợ multi-tab), tự dọn socket chết, broadcast theo danh sách thành viên phòng.
- **Cascade (D3)**: Xoá User → tin nhắn giữ nguyên, `sender_id` set NULL (`ondelete="SET NULL"`); xoá phòng chat → cascade xoá tin nhắn + thành viên.

### 📅 Đặt lịch, Công tác & Nghỉ phép — Scheduler Grid & Timeline
- **3 Tab quản lý**:
  - **📅 Đặt lịch**: Trục dọc time slots 07:00→19:00 (bước 30 phút), trục ngang resources (Xe, Phòng họp). Hỗ trợ Drag & Drop, Resize, Context Menu, vạch thời gian thực, overlap detection, dark mode.
  - **🧳 Công tác**: Timeline Gantt chart theo tháng, thống kê trạng thái (Tổng số, Đang công tác, Sắp diễn ra, Đã kết thúc, Đã hủy), đăng ký lịch công tác (điểm đến, mục đích, ngày đi - về, ghi chú).
  - **🏖️ Nghỉ phép / Việc**: Quản lý lịch nghỉ phép / nghỉ việc riêng cá nhân và phòng ban, hiển thị trực quan theo dạng lịch timeline.
- **🏖️ Module Nghỉ phép riêng (`/nghiphep`)**: Nghỉ phép được **tách thành module độc lập** (`frontend/src/pages/nghiphep.jsx`) thay vì nằm trong booking — gồm đăng ký đơn nghỉ phép + danh sách đơn & trạng thái duyệt của chính mình. Module nằm trong **hệ thống phân quyền** (module key `nghiphep`, mặc định bật cho mọi role, bật/tắt được ở trang Phân quyền). Form đăng ký hỗ trợ nghỉ **Cả ngày / Buổi sáng / Buổi chiều / Theo giờ** (từ giờ → đến giờ, lưu `session='hourly'`, `start_time`, `end_time`, `hours`).
- **Phân loại Công tác / Nghỉ phép bằng cột `type`**: bảng `business_trips` có thêm cột `type` (`business_trip` | `leave`) để tách rõ. Tab **Công tác** chỉ hiển thị `type='business_trip'`; nghỉ phép sau khi duyệt ghi vào `business_trips` với `type='leave'`. Dashboard phân loại `trips_today` / `leaves_today` theo cột này.
- **Booking Block**: Block màu chiếm đúng khung giờ, hiển thị title + tên NV + giờ
- **Drag & Drop**: Kéo thả booking sang resource/giờ khác
- **Resize**: Kéo handle dưới block để thay đổi thời gian kết thúc
- **Context Menu**: Chuột phải → Chỉnh sửa / Kết thúc / Hủy
- **Keyboard shortcuts**: `Ctrl+N` (tạo mới booking / công tác / nghỉ phép tương ứng theo tab đang chọn), `F5` (làm mới), `Esc` (đóng), `Ctrl+E` (sửa)
- **Dark mode**: Toggle sáng/tối, lưu preference vào sessionStorage
- **Responsive**: Desktop (grid đầy đủ), Mobile (drawer filter, grid cuộn)
- **Real-time**: SSE cập nhật booking realtime
- **Vạch thời gian thực**: Đường đỏ chỉ giờ hiện tại trên grid (cập nhật 30s)
- **3 trạng thái active cùng ngày**:
  - 🟡 **Sắp diễn ra** (`start_time` chưa đến) — dashed border, không drag/resize/finish
  - 🟢 **Đang sử dụng** — đang trong khung giờ
  - ⏰ **Đã hết giờ** (`end_time` đã qua) — opacity thấp, gạch ngang title
- **Overlap detection**: Client-side (gọi API check) + Server-side (SQL)
- **Quản lý tài nguyên (Admin)**: Thêm/xoá tài nguyên (Xe 🚗, Phòng họp 🏢), hiển thị số lượt đặt.

### 🔗 Quy trình User Chia sẻ Link (File & Thư mục)

**Bước 1 — Mở modal chia sẻ**
- Vào **Tài liệu** → hover thẻ **File** hoặc **Thư mục** → nhấn icon **Chia sẻ** (🔗).
- Hoặc chuột phải vào file/thư mục → chọn **Chia sẻ** / **Chia sẻ thư mục**.

**Bước 2 — Chọn đối tượng**

| Hình thức | Ai truy cập được |
|-----------|------------------|
| **Tất cả nhân viên** (ALL) | Mọi user nội bộ đã đăng nhập |
| **Theo phòng ban** (DEPT) | User thuộc phòng ban đã chọn |
| **Công khai / Link** (PUBLIC) | Bất kỳ ai giữ link, **không cần đăng nhập** |

- (Tùy chọn) Chọn **Ngày hết hạn** — để trống nghĩa là không hết hạn.

**Bước 2b — Chọn quyền truy cập** (mặc định: **Xem + Tải xuống**)
| Quyền | Ý nghĩa |
|-------|---------|
| **Xem** (view) | Luôn bật — mở/xem trực tuyến qua ONLYOFFICE/preview |
| **Tải xuống** (download) | Tải file / nén thư mục `.zip` |
| **Chỉnh sửa** (edit) | Mở ONLYOFFICE ở chế độ **edit** + lưu ngược về kho — **chỉ áp dụng** cho link nội bộ (ALL/DEPT); link **PUBLIC luôn chỉ xem** (quyền này bị ẩn) |

**Bước 3 — Tạo & chia sẻ link**
- Nhấn **"Tạo link chia sẻ"** → hệ thống sinh `share_token` ngẫu nhiên (32 byte entropy cao).
- Copy link bằng nút **Sao chép** (hoạt động cả trên HTTP/LAN nhờ fallback) hoặc quét **QR code**.
- Link có dạng: `http://<host>/s/<token>`.

**Bước 4 — Quản lý & thu hồi**
- Phần **"Chia sẻ hiện tại"** trong modal liệt kê các link đang hoạt động + trạng thái hết hạn + **chip quyền** (Xem / Tải xuống / Chỉnh sửa).
- Nhấn icon **Thu hồi** để vô hiệu link ngay lập tức (chỉ người tạo hoặc admin/head).

**Khách truy cập link**
- **Link file**: mở **ONLYOFFICE** (docx/xlsx/pptx/pdf…) chế độ xem (view-only), hoặc xem ảnh/PDF, hoặc tải xuống.
- **Link thư mục**: hiển thị **Grid/List** các file & thư mục con. Breadcrumb chỉ cho **đi sâu** vào thư mục con, **không thể thoát lên trên thư mục gốc** đã chia sẻ. Mở file con qua **ONLYOFFICE/preview**, tải từng file, hoặc **nén .zip toàn bộ thư mục** (chỉ khi đủ nhỏ — mặc định ≤ 200 file / 200MB).
- Link **PUBLIC** không cần đăng nhập; link **ALL/DEPT** yêu cầu đăng nhập nội bộ.
- Link **hết hạn** tự động chặn truy cập (HTTP 403).
- Nếu link **không có quyền "Tải xuống"**: các nút Tải xuống / `.zip` bị ẩn, endpoint download chặn với HTTP 403 (xem online không bị ảnh hưởng).
- Nếu link **có quyền "Chỉnh sửa"**: ONLYOFFICE mở ở chế độ edit và lưu ngược về kho; ngược lại view-only (PUBLIC luôn view-only).

**Bảo mật**
- `share_token` entropy cao 32 byte, chỉ dùng trong URL công khai; không lộ thông tin đường dẫn storage.
- Backend **tái kiểm tra `expires_at`** trên mọi request (info/contents/download/archive/onlyoffice).
- Với thư mục: mỗi request `contents/download/archive` đều **xác thực lại vị trí** — `_path_within` (SMB/FTP — chống path traversal bằng `normpath`) hoặc `_gdrive_folder_within` (duyệt chuỗi `parents` cho Google Drive).
- Quyền **kế thừa**: file bên trong thư mục được chia sẻ tự động được phép mở qua ONLYOFFICE bằng token của link thư mục đó.
- Phân biệt **preview vs download**: endpoint `/download` mặc định trả `Content-Disposition: inline` (chỉ cần quyền `view` — dùng cho xem ảnh/PDF và ONLYOFFICE tải file server-to-server); khi có `?disposition=attachment` mới yêu cầu quyền `download`.

**Cơ chế xem file trong Share Folder (ONLYOFFICE)**
1. Khách bấm vào file con → frontend gọi `GET /api/shares/{folder_token}/onlyoffice/config?file_path=...&file_id=...&file_name=...`.
2. Backend xác thực file con **nằm trong thư mục được share** (`_resolve_folder_target`) rồi sinh `document.url` là **absolute URL** trỏ vào endpoint tải file con:
   ```
   {BACKEND_PUBLIC_URL}/api/shares/{folder_token}/download?token=<signed>&file_path=...&file_id=...&file_name=...
   ```
   → file con được **định danh tường minh** bằng query param (không chỉ nằm trong signed token), nên Document Server fetch được với mọi `share_type` (PUBLIC/ALL/DEPT).
3. OnlyOffice Document Server tải file **server-to-server** qua URL đó (không cần cookie phiên — dùng signed token).
4. `GET /api/shares/{folder_token}/download` xác thực: share chưa hết hạn → (ALL/DEPT) session hợp lệ **hoặc** signed token đúng `share_token` chưa hết hạn; PUBLIC mở tự do. Sau đó giải quyết file con từ query param hoặc payload signed token, **tái kiểm tra vị trí** (`_path_within` cho SMB/FTP chống path traversal / `_gdrive_folder_within` duyệt `parents` cho Google Drive) rồi mới stream nội dung.
- `disposition=inline` (mặc định) chỉ cần quyền `view` — dùng cho xem ảnh/PDF và OnlyOffice fetch file; `disposition=attachment` (nút **Tải xuống**) cần quyền `download`, backend trả 403 nếu thiếu.
- Điểm đồng bộ với **Share File**: luồng chỉ khác ở chỗ file con phải định danh thêm `file_path`/`file_id`/`file_name` và được chặn ngoài phạm vi thư mục gốc; mọi bước xác thực/stream giống hệt file chia sẻ đơn lẻ.

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

## 🎯 Onboarding Tour (Hướng dẫn người dùng mới)

Hệ thống tích hợp **driver.js** để tạo tour hướng dẫn tương tác, tự động highlight từng menu trên Sidebar khi user đăng nhập lần đầu.

### Cách hoạt động

1. **Tự động kích hoạt**: Khi user đăng nhập lần đầu, tour tự động chạy sau ~1.2s. Sidebar mở ra → driver.js highlight lần lượt Topbar → từng menu (theo quyền RBAC) → Footer.
2. **Lưu trạng thái**: `localStorage.setItem('has_seen_onboarding_tour', 'true')` sau khi tour khởi chạy → lần sau không tự động chạy nữa.
3. **Xem lại tour**: Nhấn nút **"Xem lại hướng dẫn"** (icon 🔄) ở cuối Sidebar để kích hoạt lại bất cứ lúc nào.
4. **Tương tác trong tour**: Người dùng có thể **click trực tiếp vào menu** đang được highlight để truy cập trang đó mà không cần đóng tour.

### Cấu hình (dành cho Developer)

**Chỉ hiển thị tour cho một số module nhất định:**

Mở `frontend/src/components/Layout.jsx`, thêm prop `enabledIcons`:

```jsx
const { startTour } = useOnboardingTour({
  navItems,
  setIsSidebarOpen,
  enabledIcons: ['salary'],         // ← chỉ show tour cho Phiếu lương
  // enabledIcons: ['dashboard', 'todos', 'salary'],  // hoặc nhiều module
  // Bỏ qua prop (undefined) → show tất cả
})
```

**Danh sách icon name** (giá trị `icon` trong `allNavItems` tại `Layout.jsx`):

| Icon | Module |
|------|--------|
| `dashboard` | Dashboard |
| `todos` | Công việc (Todos) |
| `employees` | Nhân viên |
| `equipment` | Thiết bị |
| `licenses` | License Keys |
| `tickets` | Tickets |
| `approvals` | Phê duyệt |
| `workflows` | Quy trình |
| `bookings` | Lịch |
| `documents` | Tài liệu |
| `drawioTools` | Vẽ sơ đồ (Draw.io) |
| `salary` | Phiếu lương |
| `salaryAdmin` | Quản lý lương |
| `permissions` | Phân quyền |
| `help` | Trợ giúp |

**Tuỳ chỉnh nội dung popover** cho từng module:

Mở `frontend/src/hooks/useOnboardingTour.js`, sửa object `tourLabels`:

```js
const tourLabels = {
  salary: 'Xem Phiếu Lương',
  dashboard: 'Tổng quan hệ thống',
  todos: 'Quản lý công việc',
  // thêm các module khác ...
}
```

### Công nghệ sử dụng

- **driver.js** ^1.3+ — thư viện highlight & popover tour
- **lucide-react** — icon nút "Xem lại hướng dẫn" (`RefreshCw`)

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
# Local PC (Development): Dùng PostgreSQL
DATABASE_URL=postgresql://goldenfarm:your_strong_password@localhost:5432/goldenfarmict

# VPS/Docker (Production): Dùng service `db` trong docker-compose
# DATABASE_URL=postgresql://goldenfarm:your_strong_password@db:5432/goldenfarmict

# Draw.io (Diagrams.net) — cần khi deploy Docker
DRAWIO_PORT=8091
DRAWIO_PUBLIC_URL=http://10.0.0.9:8091
```

- **Local development**: Chạy PostgreSQL local rồi cấu hình `DATABASE_URL` trong `.env`
- **Docker deployment**: Không cần đổi gì — docker-compose tự gắn `DATABASE_URL` vào container backend
- **Draw.io**: Cần cấu hình `DRAWIO_PUBLIC_URL` trong `.env` (VD: `http://10.0.0.9:8091`) và `VITE_DRAWIO_PUBLIC_URL` trong `frontend/.env`

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
# Lần đầu / khi có thay đổi frontend
docker compose up -d --build

# Chỉ đổi code backend (backend/app được bind-mount → KHÔNG cần build lại)
docker compose restart backend

# Chỉ đổi frontend hoặc frontend/nginx.conf
docker compose build frontend && docker compose up -d frontend
```

| Service | Container port | Host port (mặc định) | Biến `.env` |
|---------|---------------|----------------------|-------------|
| Frontend (nginx) | 80 | 8088 | `FRONTEND_PORT` |
| Backend (FastAPI) | 8000 | 8000 | `BACKEND_PORT` |
| OnlyOffice DS | 80 | 8090 | `ONLYOFFICE_PORT` |
| Draw.io | 8080 | 8091 | `DRAWIO_PORT` |
| PostgreSQL 16 | 5432 | 5432 | `POSTGRES_PORT` |

> Hệ thống sử dụng **PostgreSQL 16** duy nhất (service `db` trong docker-compose). Không còn hỗ trợ SQLite.

> Chi tiết deploy production + chẩn đoán lỗi: xem **[🚀 Deploy & Bảo trì Server](#-deploy--bảo-trì-server)**.

## Hybrid Authentication (Argon2id + SHA-256)

Hệ thống hỗ trợ **đa thuật toán mã hóa** để tương thích với dữ liệu user cũ:

| Thuật toán | Đối tượng | Cơ chế |
|-----------|-----------|--------|
| **Argon2id** (mặc định) | User mới tạo (seed, import, form) | `argon2-cffi PasswordHasher.hash()` — bảo mật cao, salt tự động |
| **SHA-256** (legacy) | User cũ từ phiên bản trước | Xác thực bằng `_hash_sha256()`, tự động **upgrade** lên Argon2 sau lần đăng nhập đầu tiên |

### Import Users từ Nextcloud

Để import user từ file `oc_users.csv` (Nextcloud export), dùng lệnh SQL trực tiếp lên PostgreSQL, hoặc liên hệ admin IT để xử lý bằng script thủ công.

## Tài khoản mặc định

| Mã NV | Vai trò | Mật khẩu |
|-------|---------|----------|
| `admin` | admin | `admin` |
| `administrator` | admin | `administrator` |

Hệ thống đã bao gồm 355 user thật từ Nextcloud (`oc_users.csv`). Tài khoản mặc định được seed tự động khi backend khởi động.

## Project Structure

```
goldenfarm-ict-web/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── session.py         # Engine, SessionLocal, Base
│   │   │   ├── db.py              # Helper raw SQL fetch/execute/insert
│   │   │   ├── database.py        # DB init/compatibility helpers
│   │   │   ├── auth.py            # Argon2, session token, effective identity
│   │   │   ├── events.py          # SSE event bus (async generator)
│   │   │   ├── chat_ws.py         # WebSocket Connection Manager
│   │   │   ├── chat_persist.py    # Queue batch ghi message
│   │   │   └── chat_redis.py      # Redis bridge tùy chọn
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py            # Login, password, profile, user/permission admin
│   │   │   ├── employees.py       # CRUD NV + departments + cascade delete
│   │   │   ├── departments.py     # Department CRUD
│   │   │   ├── equipment.py       # CRUD + transfer/revoke/allocate + history + import Excel
│   │   │   ├── tickets.py         # CRUD + queue position + SSE events
│   │   │   ├── bookings.py        # CRUD + resources + dates + overlap
│   │   │   ├── business_trips.py  # CRUD + role-based filtering
│   │   │   ├── dashboard.py       # GET /api/dashboard/stats
│   │   │   ├── licenses.py        # Keys + categories/items + bulk/scan + contract upload + import Excel
│   │   │   ├── software.py        # Software categories/items + contract upload
│   │   │   ├── approvals.py       # Workflows + steps + requests + approve/reject + SSE
│   │   │   ├── todos.py           # Todo CRUD/scope/status/subtask
│   │   │   ├── comments.py        # Comment Todo
│   │   │   ├── attachments.py     # File/URL Todo
│   │   │   ├── documents.py       # Storage CRUD + browse/download + permissions
│   │   │   ├── shares.py          # Public/internal document shares
│   │   │   ├── salary_slips.py    # Admin salary CRUD + Excel + PDF (single/batch)
│   │   │   ├── salary_user.py     # Employee salary view + PDF download
│   │   │   ├── chat.py            # WebSocket + rooms/messages/archive REST
│   │   │   ├── forum.py           # Post/reply/attachment
│   │   │   ├── formulas.py        # Công thức và in nhà máy
│   │   │   ├── module_backups.py  # API backup Todos/Booking/Nhân viên
│   │   │   └── monitor.py         # Trạng thái hệ thống
│   │   ├── services/
│   │   │   ├── chat_archive_service.py
│   │   │   ├── module_backup_service.py
│   │   │   ├── upload_service.py
│   │   │   └── pdf_pages.py
│   │   ├── utils/
│   │   │   ├── pdf_generator.py    # Salary slip PDF generation
│   │   │   └── ftp_utils.py        # FTP/SMB upload utility
│   ├── main.py                    # FastAPI entry point + SSE endpoint
│   ├── requirements.txt
│   └── run.bat
├── frontend/
│   ├── src/
│   │   ├── main.jsx               # Entry point (BrowserRouter + React.StrictMode)
│   │   ├── App.jsx                # Routing + ProtectedRoute / AdminRoute guards
│   │   ├── components/
│   │   │   ├── OnlyOfficeViewer.jsx # ONLYOFFICE editor overlay (timeout 25s, retry, dim-check, same-origin DocsAPI)
│   │   │   └── DrawioViewer.jsx    # Draw.io diagram editor (iframe embed, 2 modes)
│   │   ├── pages/
│   │   │   ├── Login.jsx          # Đăng nhập (employee_code + password/email)
│   │   │   ├── Dashboard.jsx      # Admin tổng quan / User cá nhân
│   │   │   ├── Employees.jsx      # CRUD nhân viên (cascade equipment)
│   │   │   ├── Equipment.jsx      # Enterprise UI: 4 stats, sticky toolbar, sortable grid, 3-dot menu, detail drawer, form modal — lucide-react
│   │   │   ├── Licenses.jsx       # Keys + categories/items + bulk import + scan
│   │   │   ├── Tickets.jsx        # User kanban / Admin filter+reply
│   │   │   ├── Approvals.jsx      # Approval requests: tạo phiếu, duyệt/từ chối, timeline logs
│   │   │   ├── WorkflowTemplates.jsx # Quản lý quy trình phê duyệt & bước duyệt
│   │   │   ├── Documents.jsx      # Storage browser SMB/FTP/GDrive + ONLYOFFICE + Draw.io
│   │   │   ├── ToolsDrawio.jsx    # Draw.io workspace (toolbar + iframe embed)
│   │   │   ├── Todos.jsx, Todos.css # Kanban quản lý công việc
│   │   │   ├── Chat.jsx           # Chat realtime + archive admin
│   │   │   ├── AdminBackups.jsx   # Backup dữ liệu theo module
│   │   │   ├── FormulaManagement.jsx
│   │   │   ├── FactoryPrinting.jsx
│   │   │   ├── Permissions.jsx    # Phân quyền 3 tab: Module + Documents (Nextcloud-style) + Roles + RBAC 3-Tier
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
│   │   │   └── api.js             # Axios instance + API client của các module
│   │   ├── styles/
│   │   │   ├── booking.css        # Booking module styles (~960 dòng, CSS vars)
│   │   │   ├── Documents.css      # Document storage styles (revamped: cards, tabs, OO overlay)
│   │   │   ├── Login.css          # Login page styles
│   │   │   ├── Profile.css        # Profile page styles
│   │   │   ├── SalarySlip.css     # Salary slip styles
│   │   │   ├── Todos.css          # Kanban board styles
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
| `POST` | `/api/auth/login` | Đăng nhập (employee_code hoặc email) — trả về `permissions` merged 3-tier |
| `POST` | `/api/auth/change-password` | Đổi mật khẩu |
| `GET` | `/api/auth/profile` | Lấy profile cá nhân |
| `PUT` | `/api/auth/profile` | Cập nhật profile (full_name, phone, personal_email) |
| `POST` | `/api/auth/forgot-password` | Quên mật khẩu → lấy email gợi ý |
| `POST` | `/api/auth/verify-reset` | Reset mật khẩu qua personal_email |
| `POST` | `/api/auth/admin-reset-password` | Reset mật khẩu người khác (admin/head hoặc user được cấp quyền `password-reset`) |
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
| `POST` | `/api/employees` | Thêm mới (tự động tạo tài khoản `users`) |
| `POST` | `/api/employees/import` | Import hàng loạt (CSV) — bulk upsert employees + auto-create users, trả về thống kê chi tiết |
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
| `POST` | `/api/equipment/import` | Import Excel (xlsx) — upsert thiết bị theo `asset_code`, tự xử lý license + history |
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
| `POST` | `/api/licenses/import` | Import Excel (xlsx) — upsert license theo `equipment_id + license_key`, tự tìm thiết bị qua `asset_code`/`S/N` |
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
| `PUT` | `/api/requests/{id}/approve` | Phê duyệt bước hiện tại (duyệt xong → ghi vào `business_trips` nếu là đơn nghỉ phép/công tác) |
| `PUT` | `/api/requests/{id}/reject` | Từ chối phiếu |

### System
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/events` | SSE global event stream |
| `GET` | `/api/health` | Health check |

### Chat Nội bộ (`/api/chat`)
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `WS` | `/api/chat/ws?token=...&employee_code=...` | WebSocket realtime — xác thực token session, đóng code **1008** nếu sai; nhận & lưu tin nhắn qua SQLAlchemy rồi broadcast tới mọi thành viên phòng |
| `GET` | `/api/chat/rooms` | Danh sách phòng chat của user đang đăng nhập (kèm `member_codes`, `last_message`) |
| `GET` | `/api/chat/messages/{room_id}` | Lịch sử tin nhắn của phòng (`limit` 1–200 mặc định 50, `offset`) — chỉ thành viên phòng |
| `POST` | `/api/chat/rooms` | Tạo phòng chat (direct/group) — tự thêm user đang đăng nhập làm thành viên |
| `POST` | `/api/chat/archives/preview` | Admin xem trước số phòng/tin theo khoảng ngày, loại `department`/`group`/`direct` và danh sách `room_ids`; không thay đổi dữ liệu |
| `POST` | `/api/chat/archives` | Admin tạo ZIP đã kiểm tra rồi dọn các tin nhắn đã backup; giữ nguyên phòng/thành viên |
| `GET` | `/api/chat/archives` | Admin xem danh sách backup đang lưu trên server, gồm tên phòng chat |
| `POST` | `/api/chat/archives/upload` | Admin tải ZIP backup từ PC lên server (tối đa 50 MB) và kiểm tra định dạng/an toàn |
| `GET` | `/api/chat/archives/{filename}/download` | Admin tải ZIP backup về PC |
| `DELETE` | `/api/chat/archives/{filename}` | Admin xóa ZIP khỏi server sau khi đã lưu ngoại vi |
| `POST` | `/api/chat/archives/restore` | Admin khôi phục phòng, thành viên, tin nhắn và tệp đính kèm; tự bỏ qua tin đã tồn tại |

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
| `GET` | `/api/documents/onlyoffice/config` | Lấy editor config cho ONLYOFFICE (JWT-signed) |
| `GET` | `/api/documents/onlyoffice/download` | Stream file cho ONLYOFFICE Document Server (temporary JWT token) |
| `POST` | `/api/documents/onlyoffice/callback` | Webhook từ ONLYOFFICE — lưu file sau khi chỉnh sửa (status 2/6) |
| `GET` | `/api/documents/drawio/load` | Đọc nội dung XML file .drawio từ storage (SMB/FTP/GDrive) |
| `PUT` | `/api/documents/drawio/save` | Ghi nội dung XML từ Draw.io editor về storage |
| `GET` | `/api/documents/departments` | Danh sách phòng ban (cho dropdown) |
| `GET` | `/api/documents/permissions/{config_id}` | Danh sách phân quyền (granular fields) |
| `POST` | `/api/documents/permissions` | Thêm phân quyền (legacy) |
| `POST` | `/api/documents/permissions/share` | Tạo/Cập nhật granular permission (EVERYONE/DEPARTMENT) |
| `PUT` | `/api/documents/permissions/{perm_id}` | Cập nhật granular permissions (từng field) |
| `DELETE` | `/api/documents/permissions/{perm_id}` | Xoá phân quyền |

### Chia sẻ link (Documents — `/api/documents/shares`, `/api/shares`)
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/documents/shares` | Danh sách link chia sẻ của một item (`config_id`, `file_path`) |
| `POST` | `/api/documents/shares` | Tạo link chia sẻ (file/folder, `item_type`, `share_type`, `department_id`, `expires_at`, `permissions`) |
| `DELETE` | `/api/documents/shares/{id}` | Thu hồi link chia sẻ |
| `GET` | `/api/shares/{token}/info` | Thông tin link (tên, `item_type`, `share_type`, `permissions`, hết hạn) — công khai |
| `GET` | `/api/shares/{token}/contents` | Danh sách file/thư mục con của link **thư mục** (`path` = vị trí hiện tại, tái xác thực phạm vi) |
| `GET` | `/api/shares/{token}/download` | Tải/xem file — folder share chỉ định file con bằng `file_path`/`file_id`/`file_name` (được xác thực nằm trong thư mục share); `disposition=inline` chỉ cần quyền `view`, `disposition=attachment` cần quyền `download` |
| `GET` | `/api/shares/{token}/archive` | Tải .zip toàn bộ thư mục (cần quyền `download`, giới hạn 200 file / 200MB, 413 nếu quá lớn) |
| `GET` | `/api/shares/{token}/onlyoffice/config` | Editor config ONLYOFFICE (folder share: kèm `file_path`/`file_id`/`file_name`) — `document.url` trỏ tuyệt đối vào `/download` kèm token thư mục + định danh file con; trả `permissions` theo quyền share |
| `POST` | `/api/shares/{token}/callback` | Callback ONLYOFFICE — lưu ngược về kho khi share nội bộ có quyền `edit`, ngược lại bỏ qua |

## Database

**Database**: PostgreSQL 16 — kết nối qua `DATABASE_URL` (mặc định service `db` trong docker-compose)

### Tables

Schema có 40 bảng vật lý. Danh sách đầy đủ được nhóm tại [Cơ sở dữ liệu](#cơ-sở-dữ-liệu); không ghi số record cố định vì dữ liệu production thay đổi liên tục và thống kê PostgreSQL có thể trễ.

Các khóa chính đặc biệt:

- Phần lớn bảng dùng `id SERIAL/INTEGER`.
- `employees.employee_code` và `users.employee_code` là khóa nghiệp vụ unique.
- `salaries` dùng khóa ghép `(employee_code, month)`.
- `chat_rooms.id` và `chat_messages.id` là UUID dạng `String(36)`.
- Các bảng permission có unique constraint theo đối tượng + module.
- `chat_room_members` unique theo `(room_id, employee_code)`.

`users_backup` tồn tại trong database nhưng không có ORM model và không thuộc runtime hiện tại; không xóa nếu chưa backup và xác nhận mục đích lịch sử.

## Quy trình công nghệ: In Công Thức

### Luồng upload và phát lệnh in

1. **Bộ phận nghiên cứu upload công thức** trong `FormulaManagement`. Backend kiểm tra session, quyền module, định dạng và mã công thức; thông tin công thức được lưu ở `formula_recipes`, còn file gốc ở storage riêng của backend. Không cấp URL tải file cho giao diện nhà máy.
2. **Backend chuẩn hóa tài liệu.** PDF được dùng làm nguồn in; Excel được chuyển sang PDF qua LibreOffice. Khi có lệnh in, backend dùng PyMuPDF raster hóa PDF thành các trang PNG ở `FORMULA_PRINT_DPI` (mặc định 300, tối đa 400 DPI). Ảnh trang nằm trong cache riêng tư dưới storage backend, không được phục vụ như file tĩnh.
3. **Nhân viên sản xuất tìm công thức và bấm In.** Trình duyệt chỉ gửi ID công thức và mã trạm (`factory-main` mặc định) để tạo `formula_print_jobs`, sau đó hỏi trạng thái lệnh. Trình duyệt không nhận PDF hoặc ảnh trang và không tạo nút tải/lưu.
4. **Print agent trên PC nối với máy in** polling lệnh theo trạm. Agent xác thực bằng `FORMULA_PRINT_AGENT_KEY`, lấy từng ảnh qua endpoint chỉ dành cho agent, giữ ảnh trong bộ nhớ và gửi đến máy in Windows mặc định qua driver/spooler. Agent báo `completed` khi spooler nhận lệnh hoặc `failed` kèm lỗi; backend ghi `formula_print_logs` khi spooler nhận lệnh.
5. **Theo dõi trạng thái.** Giao diện hiển thị đang chờ, đang in hoặc lỗi. Lệnh chờ hết hạn sau 120 giây nếu agent không nhận. Bảng `formula_print_jobs` được ORM tạo khi backend khởi động; thay đổi này không sửa/xóa dữ liệu bảng hiện có.

### Bảo mật và giới hạn vận hành

- Chỉ user có quyền `factory-printing` được gửi lệnh và xem trạng thái theo quy tắc phân quyền; agent dùng secret riêng ở backend và PC, không đưa secret vào frontend hoặc repository.
- Endpoint ảnh đặt `no-store`; endpoint cũ `/{recipe_id}/print-stream` trả HTTP 410 để browser không còn lấy PDF theo luồng in cũ.
- Agent không tạo file PDF/PNG cho user, nhưng Windows spooler có thể giữ dữ liệu tạm trong lúc xử lý. Trạng thái `completed` xác nhận driver/spooler đã nhận lệnh, không xác nhận giấy đã ra khay.
- Backend cần có `FORMULA_PRINT_AGENT_KEY` và PC máy in cần chạy agent thì chức năng mới nhận lệnh. Hướng dẫn cài đặt: [Windows print agent](tools/formula-print-agent/README.md); hướng dẫn người dùng: [In Công Thức](docs/HDSD_InCongThuc.md).

### Indexes

Các nhóm index đã xác minh trong schema đang chạy:

- Identity: employee/user code, username, employee status.
- Nghiệp vụ: equipment asset/status, license product/expiry, ticket status/priority/code, booking status, trip employee/department/status.
- Todos: scope, department, creator, assignee, status và `todo_id` ở bảng con.
- RBAC/share: target + module, storage target và các trường document share.
- Chat: room/type/member/sender, pinned, `created_at` và composite `(room_id, created_at)`.
- Formula: recipe code/name/active, print log theo recipe/user.

Không giả định index từ tên cột. Trước khi thêm index cần lấy query thật, chạy `EXPLAIN (ANALYZE, BUFFERS)` trên bản sao dữ liệu và kiểm tra chi phí ghi. Các join ứng dụng như `equipment.employee_id`, `bookings.resource_id`, `workflow_steps.template_id` cần được đánh giá theo tải thực tế.

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

---

## 💬 Chat Nội bộ — Chi tiết kỹ thuật (WebSocket)

> Chat realtime hoạt động **ĐỘC LẬP với SSE** (`/api/events`) — dùng WebSocket riêng `/api/chat/ws`, không dùng `publish_sync()`.

### Luồng dữ liệu

```
Browser (Chat.jsx)
  ├─ REST: GET /api/chat/rooms · GET /api/chat/messages/{room_id}?limit&offset · POST /api/chat/rooms
  └─ WS:   ws://<host>/api/chat/ws?token=...&employee_code=...
       │
Backend
  ├─ routers/chat.py      — xác thực token (sai → close 1008) → lưu ChatMessage (SQLAlchemy ORM) → broadcast
  ├─ core/chat_ws.py      — ConnectionManager: Dict[employee_code, Set[WebSocket]] (multi-tab, asyncio.Lock)
  └─ PostgreSQL: chat_rooms / chat_room_members / chat_messages
```

### Frontend `Chat.jsx`

`frontend/src/pages/Chat.jsx` là màn hình điều phối toàn bộ chat nội bộ:

- **Danh sách phòng**: chia ba nhóm `department`, `group`, `direct`; tên chat 1-1 được ghép từ tên nhân viên, phòng nhóm/phòng ban dùng `room.name`.
- **Realtime**: quản lý WebSocket, heartbeat, reconnect, trạng thái online và đồng bộ tin nhắn mới theo phòng.
- **Lịch sử**: tải trang đầu và phân trang tin cũ; quản lý tin ghim, preview/tải attachment và refresh phòng đang mở.
- **Quản lý phòng**: tạo phòng, đổi tên, thêm/bớt thành viên, xóa phòng theo quyền admin/trưởng phòng/chủ nhóm.
- **Attachment**: nhận ảnh `jpg/jpeg/png/webp` và tài liệu `pdf/doc/docx/xlsx`, tối đa 10 MB mỗi file; backend lưu tại `backend/uploads/chat`.
- **Backup UI (admin)**: chọn kỳ, loại `department/group/direct`, xem trước, chọn từng tên phòng hoặc chọn tất cả, sau đó gửi `room_ids` để backend chỉ backup/dọn đúng phạm vi.
- **Tối ưu state backup**: `useMemo` tính loại phòng, khoảng ngày, phòng đã chọn và tổng tin; handler dùng chung reset preview/chọn phòng giúp tránh tính toán và cập nhật lặp trong render.
- **Upload backup**: gửi `FormData` với `multipart/form-data`; lỗi FastAPI dạng chuỗi hoặc danh sách validation đều được chuẩn hóa thành text để không làm React crash/trắng trang.

### Luồng backup attachment

1. Backend truy vấn tin của đúng `room_ids`, khoảng ngày và loại phòng đã chọn.
2. `manifest.json` lưu phòng, thành viên, tin nhắn và metadata attachment; file vật lý được đặt trong `attachments/` của ZIP.
3. ZIP được `testzip()` xác minh trước khi xóa tin. File attachment chỉ bị xóa khỏi vùng hoạt động khi không còn tin nào khác tham chiếu tới file đó.
4. Tên ZIP lấy từ tên phòng thực sự có dữ liệu, ví dụ `bk_01-08-2026_den_31-08-2026_nhan-su_khoa.zip`; tên dài được rút gọn kèm hash.
5. Khi upload, backend kiểm tra ZIP, phiên bản manifest, chống path traversal, giới hạn 50 MB file nén và 2 GB dữ liệu giải nén.
6. Restore bỏ qua message ID đã tồn tại, tạo lại phòng còn thiếu, phục hồi attachment chưa có và rollback cả DB/file nếu gặp lỗi.

Checklist kiểm thử tích hợp attachment đã dùng: tạo tin demo PNG + XLSX → preview → backup/dọn → kiểm tra byte trong ZIP → xóa ZIP server → upload lại → restore → đối chiếu SHA-256, nội dung workbook và số tin/file.

### Công nghệ

- **WS**: Starlette/FastAPI `@router.websocket`, prefix `/api/chat`.
- **Xác thực WS**: token + employee_code trong **query param** (WS không gửi header) → `verify_token()` từ `app/core/auth.py` (D6 — không hard-code user id).
- **DB**: 3 bảng mới (FK thật sự — ngoại lệ của quy tắc "no FK"):
  - `chat_rooms`: id UUID, `type` (direct/group), `name` nullable, `created_at`
  - `chat_room_members`: `room_id` + `employee_code` (UNIQUE)
  - `chat_messages`: `sender_id` FK `users.employee_code` **`ondelete="SET NULL"`** (D3 — xoá user giữ tin nhắn), `room_id` FK **CASCADE**
- **Lưu trước, gửi sau**: tin nhắn insert vào DB trước khi broadcast; mọi thành viên phòng (kể cả người gửi) nhận qua WS echo → frontend không append tay.
- **Reconnect**: `Chat.jsx` tự kết nối lại sau 3s khi socket đóng; hiển thị trạng thái Trực tuyến / Đang kết nối.
- **Proxy WS**: dev — vite `ws: true` cho `/api` → `127.0.0.1:8080`; prod — `frontend/nginx.conf` đã có `Upgrade` + `Connection: upgrade`.
- **Không thêm dependency**: chỉ FastAPI + SQLAlchemy + PostgreSQL (D10).

### Bảo trì

- **Bảng mới** tự tạo qua `Base.metadata.create_all()` ở startup (`backend/main.py`) — thêm **cột** mới thì dùng `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` trong `on_startup` (D4).
- **Dữ liệu backup**: ZIP được lưu tại `backend/storage/chat-archives` và bind-mount vào `/app/storage` trong container backend. Không sửa nội dung ZIP sau khi tải về; nên tải về PC và kiểm tra xong trước khi xóa bản trên VPS.
- **Phạm vi backup**: Hỗ trợ `department`, `group` và `direct`; chỉ các phòng admin đánh dấu trong danh sách xem trước mới được backup/dọn. Mốc ngày được tính theo múi giờ `Asia/Ho_Chi_Minh`.
- **Kiểm tra sau deploy**: `docker compose ps`, `curl -fsS http://localhost:8000/api/health` và đăng nhập admin để chạy **Xem trước** riêng từng loại 1:1/nhóm trước khi thực hiện backup thật.
- **Thêm endpoint**: theo pattern `routers/chat.py` (`SessionLocal` + try/finally, trả `{"status":"success","data":...}`).
- **Xoá User**: không được `DELETE FROM chat_messages WHERE sender_id=...` — FK SET NULL đã xử lý (D3).
- **HDSD**: `docs/HDSD_Chat.md` (mirror `frontend/src/docs/HDSD_Chat.md`) + đăng ký trong `HelpPage.jsx`.
- **Menu**: `Layout.jsx` (`allNavItems`, `iconMap`, `MODULE_MAP`, `hasModuleAccess`).

---

## 🗄️ Admin Backup dữ liệu module

Trang `/admin/backups` quản lý backup logic độc lập cho `Todos`, `Booking` và `Nhân viên`. Menu **Backup dữ liệu** chỉ hiện với role `admin`; frontend dùng `StrictAdminRoute`, còn mọi API xác minh session và role tại backend. ZIP runtime nằm tại `backend/storage/module-backups` và được loại khỏi Git.

### Thành phần thay đổi

| Tầng | File | Vai trò |
|---|---|---|
| Backend | `backend/app/services/module_backup_service.py` | Scan, manifest/ZIP, kiểm tra file, cleanup và restore |
| Backend | `backend/app/routers/module_backups.py` | API admin và validate upload `.zip` |
| Backend | `backend/main.py` | Đăng ký router backup module |
| Frontend | `frontend/src/pages/AdminBackups.jsx` | Scan/chọn/snapshot/dọn/upload/restore |
| Frontend | `frontend/src/pages/AdminBackups.css` | Layout responsive và trạng thái cảnh báo |
| Frontend | `frontend/src/services/api.js` | Client API và download dạng blob |
| Frontend | `frontend/src/App.jsx` | Route với `StrictAdminRoute` |
| Frontend | `frontend/src/components/Layout.jsx` | Menu admin **Backup dữ liệu** |
| Vận hành | `.gitignore` | Bỏ qua ZIP runtime của module backup |

### Quy trình scan và backup

```text
Admin chọn module + khoảng ngày
  → POST /api/admin/module-backups/scan
  → chọn từng record / chọn tất cả
  → tạo manifest + gom record liên quan + file vật lý
  → tạo ZIP tạm → testzip()
  → đổi tên ZIP chính thức
  → nếu bật Dọn: xóa record trong transaction, sau commit mới xóa file vật lý
```

- Khoảng ngày dùng `YYYY-MM-DD`, bao gồm cả hai đầu và tối đa 10 năm.
- Trường scan là `todos.created_at`, `bookings.book_date`, `employees.created_at`. Nhân viên có ngày tạo rỗng/null vẫn được đưa vào kết quả để không bỏ sót dữ liệu cũ.
- Khi có `record_ids`, backend backup đúng danh sách admin đã chọn; kỳ ngày vẫn được ghi vào manifest để truy vết.
- **Snapshot**: chỉ tạo ZIP, dữ liệu đang hoạt động không đổi.
- **Backup và dọn**: hỗ trợ Todos và Booking; chỉ chạy sau khi ZIP đã được kiểm tra.
- **Nhân viên**: chỉ snapshot, backend từ chối `cleanup=true` vì nhân viên liên kết với tài khoản, thiết bị, ticket, booking, lương và phân quyền.
- **Upload**: chỉ nhận `.zip`, tối đa 100 MB; dữ liệu giải nén tối đa 3 GB; kiểm tra CRC, manifest/version, path traversal, kích thước và SHA-256 từng file đính kèm. File lớn được kiểm tra/restore theo luồng 1 MB để không nạp toàn bộ vào RAM.
- **Restore idempotent**: ID hoặc `employee_code` đã tồn tại sẽ được bỏ qua; không ghi đè dữ liệu mới hơn.
- **An toàn cleanup**: record được khóa trong transaction; ZIP không bị xóa nếu database đã commit nhưng bước dọn file vật lý gặp lỗi. File Todo dùng chung chỉ bị xóa khi không còn attachment nào tham chiếu.

### Tên file và cấu trúc ZIP

```text
bk_YYYYMMDD_YYYYMMDD_todos.zip
bk_YYYYMMDD_YYYYMMDD_booking.zip
bk_YYYYMMDD_YYYYMMDD_nhan-vien.zip
```

Nếu trùng tên, hệ thống thêm `_2`, `_3`, ... và không ghi đè file cũ. ZIP có cấu trúc:

```text
manifest.json                 # version, module, kỳ, records, related, files, missing_files
attachments/<stored-name>    # attachment vật lý của Todos
```

Mỗi phần tử `files` lưu `path`, `size`, `sha256`. `missing_files` ghi attachment có record trong database nhưng mất file vật lý; danh sách server và giao diện hiển thị số file thiếu.

### Ma trận dữ liệu theo module

| Module | Record chính | Dữ liệu liên quan trong ZIP | Chính sách dọn |
|---|---|---|---|
| Todos | `todos` | `todo_subtasks`, `comments`, `notifications`, `attachments`, file trong `backend/uploads/todos` | Được phép; xóa con trước cha, file sau commit |
| Booking | `bookings` | `resources` được tham chiếu | Chỉ xóa booking; không xóa resource |
| Nhân viên | `employees` | `users` (gồm password hash), `user_permissions` | Không cho dọn tự động; ZIP phải được bảo vệ như dữ liệu nhạy cảm |

### Quan hệ cơ sở dữ liệu

Nhiều quan hệ nghiệp vụ chưa được ràng buộc hoàn toàn bằng foreign key PostgreSQL, nên service truy vấn rõ từng bảng thay vì chỉ dựa vào database cascade:

- `Todo.id` → `todo_subtasks.todo_id`, `comments.todo_id`, `notifications.todo_id`, `attachments.todo_id`.
- `Booking.resource_id` → `resources.id`; cleanup chỉ xóa booking và giữ resource dùng chung.
- `Employee.employee_code` → `users.employee_code`, `user_permissions.employee_code`; mã nhân viên còn được thiết bị, ticket, booking, lương và các module nghiệp vụ khác tham chiếu.

Restore dùng ID tường minh có thể làm sequence PostgreSQL thấp hơn ID lớn nhất, vì vậy service đồng bộ sequence của mọi bảng đã chạm trước khi commit.

### Restore database

1. Đọc và xác minh `manifest.json`.
2. Booking khôi phục resource còn thiếu trước booking.
3. Todos khôi phục record cha trước subtasks/comments/attachments/notifications, sau đó chép file chưa tồn tại.
4. Nhân viên khôi phục theo `employee_code`, sau đó bổ sung user và permission còn thiếu; permission kiểm tra cặp `(employee_code, module)` để tránh vi phạm unique constraint.
5. Nếu lỗi, transaction rollback và các file vừa chép được xóa.
6. Sau restore, sequence PostgreSQL được đồng bộ theo ID lớn nhất để lần tạo record kế tiếp không đụng khóa chính.

> Backup module là backup logic có chọn lọc để admin vận hành, không thay thế backup toàn bộ PostgreSQL (`pg_dump`) và volume upload theo lịch. Riêng Nhân viên hiện snapshot hồ sơ, tài khoản và phân quyền; thiết bị, ticket, booking, lương và các bảng nghiệp vụ khác vẫn phải được bảo vệ bằng backup database toàn hệ thống.

### API admin

| Method | Endpoint | Chức năng |
|---|---|---|
| `POST` | `/api/admin/module-backups/scan` | Scan record theo module và khoảng ngày |
| `POST` | `/api/admin/module-backups` | Tạo snapshot hoặc backup+dọn các `record_ids` |
| `GET` | `/api/admin/module-backups` | Liệt kê ZIP trên server |
| `POST` | `/api/admin/module-backups/upload` | Upload và kiểm tra ZIP |
| `POST` | `/api/admin/module-backups/restore` | Restore idempotent |
| `GET` | `/api/admin/module-backups/{filename}/download` | Tải ZIP |
| `DELETE` | `/api/admin/module-backups/{filename}` | Xóa ZIP khỏi server |

### Quy trình vận hành khuyến nghị

1. Chọn module và kỳ, bấm **Scan dữ liệu**; đối chiếu record và dữ liệu liên quan.
2. Tạo **snapshot** trước; kiểm tra tên ZIP, số record, số file và cảnh báo file thiếu.
3. Tải ZIP ra nơi lưu trữ ngoài VPS. Không sửa manifest hoặc nội dung ZIP.
4. Chỉ bật **Dọn dữ liệu** sau khi snapshot đã được kiểm tra; không cleanup Nhân viên.
5. Khi cần phục hồi, upload ZIP, xác nhận ZIP hợp lệ trong danh sách rồi bấm **Khôi phục**.
6. Kiểm tra lại module. Restore lần hai phải bỏ qua record đã có, không nhân đôi dữ liệu.

### Kiểm thử và trạng thái xác minh — 24/09/2026

- Fixture tạm bao phủ Todo với subtask/comment/notification/attachment/file, Booking với resource và Nhân viên với account/permission.
- Đã kiểm tra restore idempotent, nội dung/file sau restore và dọn fixture thử nghiệm.
- Frontend production build thành công; backend/frontend đã recreate, health endpoint trả `200`.
- API danh sách không có session trả `401`; dữ liệu không phải ZIP bị từ chối bằng lỗi nghiệp vụ, không làm trắng trang.
- Scan chỉ đọc tại thời điểm kiểm tra: Todos `53`, Booking `0`, Nhân viên `378`. Đây là snapshot kiểm thử, không phải số cố định.

### Đánh giá và giới hạn

| Hạng mục | Đánh giá | Nhận xét |
|---|---|---|
| Phân quyền | Tốt | Chặn ở menu, route frontend và API backend; backend là lớp quyết định cuối |
| Toàn vẹn ZIP | Tốt | File tạm + CRC; attachment có size/SHA-256; upload chống path traversal |
| Cleanup | Khá an toàn | Khóa record, xóa con trước cha, giữ file còn tham chiếu và giữ ZIP sau DB commit |
| Restore | Tốt cho phục hồi chọn lọc | Idempotent, rollback khi lỗi, dọn file vừa chép và đồng bộ sequence |
| Nhân viên | Chưa phải snapshot toàn hệ sinh thái | Chỉ hồ sơ/account/permission; không gồm thiết bị, ticket, lương; cấm cleanup |
| Dữ liệu lớn | Phù hợp quy mô vừa | Job đồng bộ; upload tối đa 100 MB, dữ liệu giải nén tối đa 3 GB |
| Disaster recovery | Chưa thay thế backup hệ thống | Vẫn cần `pg_dump`, backup volume upload và kiểm thử restore độc lập |

Rủi ro và hướng nâng cấp:

- ZIP Nhân viên chứa password hash và dữ liệu cá nhân; phải mã hóa hoặc khoanh quyền ở nơi lưu ngoài VPS.
- Kỳ/file rất lớn nên chuyển sang background job có tiến độ và audit log.
- Chưa có retention tự động, ZIP encryption, chữ ký số, lịch chạy định kỳ hoặc object storage.
- Record tồn tại được bỏ qua hoàn toàn để tránh ghi đè dữ liệu mới hơn; hệ thống chưa merge phiên bản.
- Nên đưa bộ fixture vào CI; kiểm thử tích hợp hiện được chạy thủ công trên Docker.

Checklist triển khai: scan trước; tạo snapshot trước cleanup; tải ZIP ngoại vi; kiểm tra record/file; sau đó mới cân nhắc dọn.

### Kiến trúc backup mục tiêu

Hệ thống backup được phát triển theo ba lớp độc lập. Không dùng backup module thay cho backup thảm họa và không dùng bản sao volume PostgreSQL đang chạy thay cho công cụ backup nhất quán.

| Lớp | Mục tiêu | Phạm vi | Công cụ định hướng |
|---|---|---|---|
| Backup toàn hệ thống | Khôi phục khi hỏng VPS, database hoặc triển khai lỗi | PostgreSQL, uploads, storage, metadata phiên bản và cấu hình cần thiết | `pg_dump -Fc` trước; pgBackRest + WAL/PITR khi vận hành ổn định |
| Backup dữ liệu ứng dụng | Tạo một recovery set có thể kiểm tra và di chuyển | Database dump + file vật lý + manifest + checksum | Background job của ứng dụng phối hợp công cụ hệ thống |
| Backup theo module | Khôi phục chọn lọc record nghiệp vụ | Record chính, record phụ thuộc và attachment của từng module | Module adapter trong backend |

Luồng tổng quát mục tiêu:

```text
Schedule hoặc admin yêu cầu
  → tạo backup_job
  → khóa chống chạy trùng
  → collect dữ liệu bằng adapter/công cụ tương ứng
  → ghi artifact tạm
  → checksum + kiểm tra cấu trúc
  → publish artifact bằng atomic rename
  → sao chép off-site
  → verify bản sao
  → cập nhật catalog + audit + thông báo
```

Backup chỉ được xem là **đạt** khi artifact đọc được, checksum đúng và có kết quả verify. Với backup quan trọng, cần có ít nhất một bản ngoài VPS và một lần restore thử thành công.

### Quy ước ngày giờ và tên file

- Người dùng luôn nhìn thấy ngày theo `dd/mm/yyyy`, giờ theo `HH:mm:ss`, múi giờ `Asia/Ho_Chi_Minh`.
- API và database tiếp tục trao đổi ngày theo ISO `YYYY-MM-DD`; không đổi payload sang `dd/mm/yyyy` vì dễ gây lỗi locale và sắp xếp.
- Tên file dùng `dd-mm-yyyy` vì dấu `/` là ký tự phân cách đường dẫn.
- `created_at` trong manifest nên dùng ISO 8601 có offset, ví dụ `2026-09-25T23:00:00+07:00`.
- Tên file phải có timestamp hoặc backup ID để tránh phụ thuộc hậu tố `_2`, `_3` khi có nhiều job đồng thời.

Quy ước tên mục tiêu:

```text
backup-tong_25-09-2026_23-00-00_<backup-id>.dump
backup-todos_01-09-2026_den_25-09-2026_<backup-id>.zip
backup-nhan-vien_25-09-2026_14-30-22_<backup-id>.zip
```

> Trạng thái hiện tại: code đang tạo tên `bk_YYYYMMDD_YYYYMMDD_<module>.zip`. Đây là việc cần migrate có tương thích ngược; reader/restore phải tiếp tục nhận file tên cũ.

### Recovery set toàn hệ thống

Một lần backup tổng nên tạo catalog cho một recovery set thay vì chỉ tạo một file dump rời:

```text
full_25-09-2026_23-00-00_<backup-id>/
├── database.dump                 # pg_dump custom format
├── globals.sql                   # pg_dumpall --globals-only
├── uploads.tar.zst               # backend/uploads
├── app-storage.tar.zst           # dữ liệu ứng dụng cần phục hồi
├── manifest.json
├── checksums.sha256
└── restore-instructions.txt
```

`manifest.json` tối thiểu phải ghi:

- `format`, `format_version`, `backup_id`, loại backup và trạng thái;
- thời điểm bắt đầu/kết thúc, timezone, người hoặc schedule khởi tạo;
- phiên bản PostgreSQL, phiên bản ứng dụng/Git commit và schema version;
- danh sách artifact, kích thước, SHA-256, mã hóa và nơi lưu;
- số bảng/record kiểm tra, cảnh báo file thiếu và kết quả verify;
- backup cha đối với incremental/differential;
- thời điểm hết hạn theo retention và cờ giữ lâu dài.

Không đưa `.env`, khóa mã hóa hoặc secret thô vào recovery set. Cấu hình cần thiết phải được lọc secret hoặc lưu bằng secret manager riêng. Không sao chép nóng trực tiếp volume `postgres-data`; giai đoạn đầu dùng `pg_dump -Fc`, sau đó triển khai pgBackRest và WAL archive để có Point-in-Time Recovery.

### Thiết kế adapter cho backup module

Khi thêm module mới, không tiếp tục mở rộng chuỗi `if module == ...` trong một service lớn. Mỗi module nên có adapter riêng và đăng ký trong registry:

```text
backend/app/backups/
├── registry.py
├── contracts.py
├── services/
│   ├── job_service.py
│   ├── artifact_service.py
│   ├── verification_service.py
│   └── restore_service.py
└── adapters/
    ├── todos.py
    ├── bookings.py
    ├── employees.py
    ├── chat.py
    └── equipment.py
```

Mỗi adapter phải khai báo rõ:

| Thuộc tính | Ý nghĩa |
|---|---|
| `module_key`, `format_version` | Định danh và phiên bản định dạng độc lập |
| `root_model`, `identity_key` | Bảng chính và khóa dùng khi restore |
| `date_field`, `timezone` | Trường lọc kỳ và quy tắc thời gian |
| `dependencies` | Bảng cha/con, thứ tự export và restore |
| `file_collectors` | Cách tìm file vật lý và chống trùng tên |
| `cleanup_policy` | Cấm, cho phép có điều kiện hoặc cần hai bước duyệt |
| `conflict_policy` | `skip-tree`, `clone` hoặc `overwrite` |
| `sensitive_fields` | Dữ liệu phải mã hóa, che hoặc loại bỏ |
| `verify()` | Kiểm tra record, quan hệ, file và checksum |

Thứ tự mở rộng khuyến nghị:

1. Hoàn thiện Nhân viên với thiết bị, ticket, booking, lương và các tham chiếu theo `employee_code`.
2. Hợp nhất Chat archive vào backup registry dùng chung nhưng giữ tương thích API/file cũ.
3. Thiết bị + license + equipment history.
4. Ticket, công tác/nghỉ phép, approval và workflow.
5. Salary, formula/print log, forum và document share metadata.

### Catalog và trạng thái job

Không nên dùng thao tác scan thư mục ZIP làm nguồn dữ liệu chính lâu dài. File là artifact; catalog trong database là nguồn cho tìm kiếm, audit, retention và monitoring. Các bảng định hướng:

| Bảng | Vai trò |
|---|---|
| `backup_jobs` | Yêu cầu, loại, module, tiến độ, trạng thái và lỗi |
| `backup_artifacts` | File/repository object, size, checksum, encryption và location |
| `backup_schedules` | Cron, timezone, loại backup và trạng thái bật/tắt |
| `backup_policies` | Retention, số bản sao, yêu cầu off-site/immutable |
| `backup_destinations` | Local, S3-compatible, SFTP hoặc repository chuyên dụng |
| `backup_restore_tests` | Lịch sử restore thử và kết quả đối soát |
| `backup_audit_logs` | Ai tạo, tải, verify, restore, purge hoặc xóa artifact |

Vòng đời chuẩn của job:

```text
queued → running → verifying → copying_offsite → success
                    └──────────────→ warning
queued/running/verifying/copying_offsite → failed hoặc cancelled
```

Các thao tác nặng phải chạy bằng background worker, không giữ HTTP request đến khi hoàn tất. Trên VPS dùng chung chỉ cho một job backup/restore nặng do ứng dụng khởi tạo chạy tại một thời điểm; job cần lock có TTL, heartbeat và khả năng nhận diện job bị treo.

### Tách backup, restore và purge

`cleanup` hiện đang chạy trong cùng yêu cầu tạo backup. Kiến trúc mục tiêu phải tách thành các hành động độc lập:

```text
Backup → verify local → copy off-site → verify off-site
       → đánh dấu protected → chờ thời gian an toàn/duyệt
       → tạo purge job riêng
```

Không cho purge khi có một trong các điều kiện:

- artifact chưa verify hoặc checksum sai;
- có `missing_files`;
- chưa đủ số bản sao theo policy;
- chưa có bản off-site bắt buộc;
- đang có restore/backup khác trên cùng phạm vi;
- chưa hết thời gian an toàn hoặc thiếu phê duyệt.

Restore phải chọn rõ chiến lược xung đột:

- `skip-tree`: nếu record cha đã tồn tại thì bỏ qua toàn bộ cây, an toàn mặc định;
- `clone`: cấp ID mới và remap toàn bộ khóa liên quan;
- `overwrite`: chỉ dùng khi được cấp quyền đặc biệt và đã tạo pre-restore backup.

Không trộn record con từ backup vào record cha hiện hành nếu chưa có quy tắc merge cụ thể. Chỉ giải nén/restore entry được khai báo trong manifest; mọi entry thừa phải bị từ chối. Restore production phải có preview, xác nhận phạm vi, audit và bước kiểm tra hậu restore.

### Bảo mật và toàn vẹn

- Mã hóa repository hoặc artifact chứa hồ sơ nhân viên, password hash, lương và dữ liệu cá nhân.
- Khóa mã hóa không lưu cùng artifact, không ghi vào manifest/log và phải có bản sao quản trị an toàn.
- SHA-256 cho từng artifact/file; ký manifest hoặc dùng authenticated encryption để phát hiện manifest bị thay đổi.
- Chống ZIP bomb bằng cả tổng dung lượng, số entry, kích thước từng entry và tỷ lệ nén.
- Từ chối absolute path, `..`, symlink, hardlink, device file và tên trùng sau khi chuẩn hóa.
- File restore phải ghi tạm, checksum lại rồi atomic rename; không ghi đè file hiện có ngoài policy.
- Quyền backend là lớp quyết định cuối; frontend chỉ hỗ trợ trải nghiệm, không phải ranh giới bảo mật.
- Audit log không được chứa secret, password hash hoặc toàn bộ payload backup.

### Retention, off-site và mục tiêu phục hồi

Policy khởi điểm, cần điều chỉnh sau khi đo kích thước database và WAL thực tế:

| Loại | Lịch | Retention gợi ý |
|---|---|---|
| Logical full database | Hằng ngày ngoài giờ cao điểm | 14 bản ngày |
| Full tuần | Mỗi tuần | 8 tuần |
| Full tháng | Cuối tháng | 12 tháng |
| Module snapshot thủ công | Theo nhu cầu | 90 ngày hoặc gắn `keep` |
| WAL/PITR | Liên tục khi triển khai pgBackRest | Recovery window 7–14 ngày |

Mục tiêu ban đầu:

- RPO backup logic: tối đa 24 giờ.
- RPO khi có WAL/PITR: 15 phút hoặc thấp hơn theo tốc độ archive.
- RTO phải được đo bằng restore drill, không ước lượng chỉ từ thời gian tạo backup.
- Ít nhất một bản nằm ngoài VPS; production và backup không được cùng một failure domain duy nhất.
- Retention phải hiểu dependency của full/differential/incremental và WAL; không xóa file đơn lẻ bằng tuổi file.

### API mục tiêu

API hiện tại tiếp tục hoạt động trong thời gian migrate. API job mới nên dùng resource-oriented endpoints:

| Method | Endpoint | Chức năng |
|---|---|---|
| `POST` | `/api/admin/backups/jobs` | Tạo full hoặc module backup job |
| `GET` | `/api/admin/backups/jobs` | Tìm kiếm lịch sử job |
| `GET` | `/api/admin/backups/jobs/{id}` | Tiến độ, log an toàn và artifact |
| `POST` | `/api/admin/backups/jobs/{id}/cancel` | Hủy job nếu trạng thái cho phép |
| `POST` | `/api/admin/backups/{id}/verify` | Verify lại local/off-site artifact |
| `POST` | `/api/admin/backups/{id}/restore-plan` | Preview kế hoạch và xung đột restore |
| `POST` | `/api/admin/backups/{id}/restore` | Tạo restore job sau xác nhận |
| `POST` | `/api/admin/backups/{id}/purge-plan` | Preview dữ liệu đủ điều kiện dọn |
| `POST` | `/api/admin/backups/{id}/purge` | Tạo purge job riêng |
| `GET/PUT` | `/api/admin/backups/policies` | Xem/cập nhật schedule và retention |

Endpoint tạo job trả `202 Accepted` cùng `job_id`; frontend poll hoặc dùng SSE để cập nhật tiến độ. Error response cần có `error_code`, thông báo an toàn và correlation ID để tra log.

### Giao diện quản trị mục tiêu

Trang `/admin/backups` nên được tách thành bốn tab:

1. **Tổng quan**: backup gần nhất, RPO/RTO, dung lượng, cảnh báo, off-site và restore test gần nhất.
2. **Toàn hệ thống**: tạo full backup, lịch chạy, retention, trạng thái WAL/PITR.
3. **Theo module**: scan, preview dependency/dung lượng, chọn record và tạo snapshot.
4. **Lịch sử & phục hồi**: lọc job, verify, tải xuống, lập restore plan và xem audit.

Nút purge không đặt cạnh nút tạo snapshot. Các hành động restore, purge và xóa artifact phải hiển thị phạm vi ảnh hưởng, yêu cầu xác nhận rõ ràng và vô hiệu hóa khi policy chưa đạt.

### Lộ trình triển khai

#### Giai đoạn 0 — Chuẩn hóa nền tảng

- [ ] Chốt RPO, RTO, retention và nơi lưu off-site với người vận hành.
- [ ] Chuẩn hóa hiển thị `dd/mm/yyyy`, tên file `dd-mm-yyyy`, giữ API ISO.
- [ ] Thêm `backup_id`, format version và timestamp có timezone vào manifest.
- [ ] Kiểm tra checksum manifest/toàn artifact và từ chối ZIP entry không khai báo.
- [ ] Tách backup khỏi purge; mặc định `skip-tree` khi restore xung đột.
- [ ] Chuyển kiểm thử fixture thủ công thành pytest/CI.

**Điều kiện hoàn thành:** file cũ vẫn restore được; backup mới verify được; không thể purge artifact chưa đạt policy.

#### Giai đoạn 1 — Backup tổng có thể phục hồi

- [ ] Tạo `pg_dump -Fc` và `pg_dumpall --globals-only` theo lịch.
- [ ] Đóng gói `backend/uploads` và phần `backend/storage` cần phục hồi.
- [ ] Tạo recovery-set manifest và checksum.
- [ ] Thêm catalog job/artifact/audit và cảnh báo thất bại.
- [ ] Sao chép ít nhất một bản ra ngoài VPS.
- [ ] Viết runbook và restore thử vào PostgreSQL/container tạm.

**Điều kiện hoàn thành:** một recovery set có thể dựng hệ thống tạm, đăng nhập và đối soát dữ liệu/file quan trọng.

#### Giai đoạn 2 — Job engine và module adapter

- [ ] Background worker, lock, heartbeat, progress và retry có giới hạn.
- [ ] Tách service hiện tại thành registry + adapter.
- [ ] Bổ sung module theo thứ tự ưu tiên phía trên.
- [ ] Restore plan, conflict report và audit đầy đủ.
- [ ] Retention theo catalog; reconcile catalog với repository.

**Điều kiện hoàn thành:** HTTP không bị giữ bởi tác vụ dài; job chạy lại an toàn; mỗi module có test export/verify/restore/idempotency.

#### Giai đoạn 3 — Disaster recovery chuyên nghiệp

- [ ] Triển khai pgBackRest repository mã hóa.
- [ ] WAL archive và Point-in-Time Recovery.
- [ ] Object storage/S3-compatible hoặc backup host riêng.
- [ ] Immutable retention/object lock nếu hạ tầng hỗ trợ.
- [ ] Restore drill tự động định kỳ và dashboard RPO/RTO.
- [ ] Cân nhắc backup từ standby khi tải production tăng.

**Điều kiện hoàn thành:** restore được tới thời điểm chỉ định trong recovery window và có bằng chứng restore drill định kỳ.

### Checklist thêm hoặc sửa module

Mỗi pull request liên quan backup phải trả lời đủ các mục sau:

- [ ] Phạm vi bảng chính, bảng liên quan và file vật lý đã được liệt kê.
- [ ] Thứ tự export/restore phù hợp dependency và foreign key.
- [ ] Trường ngày, timezone và record ngày rỗng đã có quy tắc.
- [ ] Khóa định danh và chiến lược conflict đã rõ.
- [ ] Dữ liệu nhạy cảm được mã hóa/loại bỏ phù hợp.
- [ ] Manifest có version và reader tương thích file cũ.
- [ ] ZIP/archive validation bao phủ traversal, symlink, entry thừa và zip bomb.
- [ ] Test bao phủ backup, verify, restore, chạy restore lần hai và rollback khi lỗi.
- [ ] Sequence/identity được đồng bộ sau restore nếu dùng ID tường minh.
- [ ] File thiếu, file trùng tên và file đang được module khác tham chiếu đã được xử lý.
- [ ] Không cho purge nếu verify/off-site/policy chưa đạt.
- [ ] README, API client và giao diện được cập nhật cùng thay đổi.

### Runbook kiểm thử và bảo trì

Kiểm thử tối thiểu cho mỗi release có thay đổi backup:

1. Tạo fixture tạm gồm record cha, record con, Unicode tiếng Việt và file nhị phân.
2. Tạo backup, kiểm tra manifest, số record/file và SHA-256.
3. Verify artifact độc lập với bước tạo.
4. Restore vào database/thư mục tạm, không restore thẳng production khi kiểm thử.
5. Đối soát khóa, quan hệ, byte file và nghiệp vụ đăng nhập/truy cập.
6. Restore lần hai để xác minh conflict policy/idempotency.
7. Làm hỏng có chủ đích một artifact trong fixture để chắc chắn verify từ chối.
8. Xác minh rollback không để record/file mồ côi.
9. Ghi thời gian backup/restore, CPU, RAM, disk I/O và kích thước để theo dõi xu hướng.
10. Xóa fixture bằng quy trình kiểm thử đã định nghĩa, không dùng lệnh xóa rộng trên volume production.

Bảo trì định kỳ:

- Hằng ngày: kiểm tra job thất bại, tuổi backup gần nhất, dung lượng và off-site lag.
- Hằng tuần: verify mẫu một backup và kiểm tra retention không xóa chuỗi còn phụ thuộc.
- Hằng tháng: restore drill recovery set đầy đủ vào môi trường cô lập.
- Hằng quý: rà soát quyền admin, khóa mã hóa, RPO/RTO, dung lượng và runbook sự cố.
- Khi đổi schema: tăng format version khi cần, thêm migration reader và fixture tương thích ngược trước khi deploy.

### Nguyên tắc maintain lâu dài

- Backup format là API lâu dài: không thay đổi âm thầm cấu trúc manifest hoặc ý nghĩa field.
- Writer mới có thể thay đổi, nhưng reader phải hỗ trợ các version còn trong retention window.
- Không gọi shell bằng chuỗi ghép từ input người dùng; dùng argv cố định và secret qua file/secret store.
- Không lưu toàn bộ log stdout có thể chứa thông tin nhạy cảm; chuẩn hóa error code.
- Không tối ưu dựa trên số record giả định; đo dung lượng, WAL và thời gian restore thực tế.
- Không đánh dấu `success` chỉ vì process exit `0`; phải chạy verify và ghi bằng chứng.
- Không xóa backup thủ công khỏi repository chuyên dụng; mọi expire đi qua retention engine và audit.
- Mọi thay đổi phá vỡ restore phải có migration hoặc tuyên bố version hết hỗ trợ kèm thời hạn rõ ràng.

---

## 🛡️ RBAC Permission System (3-Tier)

Hệ thống phân quyền module sử dụng mô hình **3-Tier Role-Based Access Control với User Overrides**.

### Kiến trúc

```
Effective Permission = Role_Perm || Department_Perm || Individual_Override_Perm
```

| Tier | Target | Bảng CSDL | Mô tả |
|------|--------|-----------|-------|
| **Tier 1** | Vai trò (`admin`, `head`, `user`) | `role_permissions` | Quyền mặc định theo role |
| **Tier 2** | Phòng ban (`IT`, `HR`, ...) | `department_permissions` | Quyền áp dụng cho toàn bộ phòng ban |
| **Tier 3** | Cá nhân (từng user) | `user_permissions` | Ghi đè riêng cho từng người |

### Cơ chế kế thừa

1. Hệ thống tra cứu quyền theo thứ tự: **User Override > Department > Role**
2. Nếu user có override (Tier 3), giá trị đó được dùng ngay lập tức
3. Nếu không có override, hệ thống kiểm tra department permissions (Tier 2)
4. Nếu department cũng không có quyền cho module đó, dùng role permissions (Tier 1)
5. Nếu cả 3 tier đều không có → mặc định là không có quyền

Riêng module `todos.requires_approval` là **chính sách của phòng ban đích**: backend chỉ đọc `department_permissions`; không có bản ghi hoặc cả `can_view`/`can_edit` đều bằng 0 thì cơ chế tắt. Quyền trong `role_permissions` và `user_permissions` không kích hoạt cơ chế này. API `GET /api/todos` trả `permissions.approval_by_department` cho gợi ý khi tạo việc và `permissions.review_by_department`/`permissions.requires_department_approval` cho cột Kanban. Backend quyết định `is_dept_approved` khi lưu; phòng ban tắt thì mọi vai trò tạo việc được duyệt thẳng.

### API Endpoints

| Method | Endpoint | Mục đích |
|--------|----------|----------|
| `GET` | `/api/auth/permissions/role/{role}` | Lấy quyền của vai trò |
| `PUT` | `/api/auth/permissions/role/{role}` | Cập nhật quyền cho vai trò |
| `GET` | `/api/auth/permissions/department/{department}` | Lấy quyền của phòng ban |
| `PUT` | `/api/auth/permissions/department/{department}` | Cập nhật quyền cho phòng ban |
| `GET` | `/api/auth/permissions/{employee_code}` | Lấy quyền tổng hợp (merged role + dept + user) |
| `PUT` | `/api/auth/permissions/{employee_code}` | Lưu override cho cá nhân |

### Frontend — ModulePermissionsTab

- **Left sidebar**: 3 accordion sections — **Vai trò**, **Phòng ban**, **Cá nhân**
- **Right panel**: Permission checkboxes cho module đã chọn
- **Individual view**: Hiển thị nguồn gốc quyền (inherited từ role/dept) và overrides
- Có thể bulk-update toàn bộ một role hoặc department chỉ với 1 click Save

### Luồng UI

1. Mở tab "Phân quyền Module"
2. Chọn **Vai trò** → chỉnh sửa quyền mặc định cho Admin/Head/Nhân viên → Save
3. Hoặc chọn **Phòng ban** → chỉnh sửa quyền cho cả phòng → Save
4. Hoặc chọn **Cá nhân** → tìm user → chỉnh sửa override → Save

### Luồng áp dụng quyền (Frontend → Backend)

1. **Login**: `POST /api/auth/login` trả về `permissions` object (merged 3-tier) → lưu vào `sessionStorage`
2. **Sidebar**: `Layout.jsx` — `hasModuleAccess()` đọc `user_permissions` từ sessionStorage/API, không fallback về role static
3. **Route Guard**: `App.jsx` — `AdminRoute` check `role` trước, nếu không phải admin/head thì check `user_permissions[requiredModule]?.can_view`
4. **Refresh**: Layout gọi `GET /api/auth/permissions` khi mount, sync vào `sessionStorage` để dùng ngay lần sau
5. **Debug log**: Backend ghi `[RBAC] effective permissions for {code}` mỗi khi merge

## 🚀 Deploy & Bảo trì Server

Phần này là **sổ tay vận hành**: đọc trước khi deploy lên VPS hoặc khi OnlyOffice /
module Documents bị lỗi. Mọi lệnh dưới đây chạy từ thư mục gốc project.

### 1. Biến môi trường (`.env` ở thư mục gốc)

| Biến | Giá trị production | Ý nghĩa |
|------|--------------------|---------|
| `VPS_IP` | `10.0.0.114` | IP nội bộ VPS |
| `APP_ENV` | `production` | |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | — | DB, **đổi mật khẩu thật khi deploy** |
| `CORS_ORIGINS` | `https://noibo.canhdongvang.vn,http://localhost:5173` | |
| `ONLYOFFICE_URL` | `http://onlyoffice:80` | Backend → DS (DNS nội bộ Docker) |
| `ONLYOFFICE_PUBLIC_URL` | `/onlyoffice` | Browser load DocsAPI — **để relative** |
| `ONLYOFFICE_BACKEND_URL` | *(bỏ trống)* | DS → backend. Trống thì mặc định `http://backend:8000` |
| `ONLYOFFICE_SECRET` | — | JWT HS256, **phải khớp** secret trong DS |
| `ONLYOFFICE_ENABLED` | `true` | |
| `DRAWIO_PUBLIC_URL` | `https://noibo.canhdongvang.vn/drawio` | |

`frontend/.env`:

```env
# BẮT BUỘC để trống ở CẢ local lẫn production → web dùng đường dẫn tương đối /api
VITE_API_URL=
```

> ⚠️ Nếu nhúng `VITE_API_URL=https://domain/api` vào build, mọi request SSE/WebSocket
> sẽ đi thẳng tới host đó → Chrome cảnh báo *Private Network Access* và báo lỗi
> *Mixed Content* khi trang chạy HTTPS.

### 2. Quy trình deploy lên VPS

```bash
cd /home/goldenfarmict
git pull

# 1) Kiểm tra .env production (VITE_API_URL phải TRỐNG, mật khẩu DB đã đổi)
cat .env frontend/.env

# 2) Build + khởi động
docker compose up -d --build

# 3) Kiểm tra
docker compose ps                                   # tất cả phải healthy
curl -s http://127.0.0.1:8000/api/health            # backend
curl -sI http://127.0.0.1:8088/health               # frontend nginx
curl -s http://127.0.0.1:8088/onlyoffice/healthcheck # DS qua proxy → "true"
```

**Khi nào cần build lại cái gì:**

| Thay đổi | Lệnh |
|----------|------|
| `backend/app/**`, `backend/main.py` | `docker compose restart backend` *(code được bind-mount)* |
| `frontend/src/**` | `docker compose build frontend && docker compose up -d frontend` |
| `frontend/nginx.conf` | `docker compose build frontend && docker compose up -d frontend` |
| `docker-compose.yml`, `.env` | `docker compose up -d` |
| `backend/requirements.txt` | `docker compose build backend && docker compose up -d backend` |

> Hot-patch nginx khẩn cấp (không rebuild):
> `docker cp frontend/nginx.conf goldenfarm-frontend:/etc/nginx/conf.d/default.conf && docker exec goldenfarm-frontend nginx -t && docker exec goldenfarm-frontend nginx -s reload`
> — **phải rebuild lại sau đó**, nếu không lần `up -d` kế tiếp sẽ mất bản vá.

### 3. OnlyOffice reverse proxy — 3 điều kiện BẮT BUỘC

OnlyOffice Document Server (DS) dựng URL redirect tuyệt đối theo công thức
`$the_scheme://$the_host$the_prefix/<version>/web-apps/...`
(xem `/etc/nginx/includes/http-common.conf` **bên trong** container DS).
Nghĩa là `frontend/nginx.conf` phải gửi đúng 3 thứ:

```nginx
location /onlyoffice/ {
    proxy_pass http://onlyoffice:80/;          # có "/" cuối → cắt prefix /onlyoffice
    proxy_http_version 1.1;

    proxy_set_header Host $oo_host;            # 1) PHẢI có PORT — dùng $http_host, KHÔNG dùng $host
    proxy_set_header X-Forwarded-Host $oo_host;
    proxy_set_header X-Forwarded-Proto $oo_scheme;  # 2) tôn trọng proxy HTTPS phía trước (NPM/Cloudflare)
    proxy_set_header X-Forwarded-Prefix /onlyoffice; # 3) DS tự chèn prefix vào mọi URL nó sinh ra

    proxy_set_header Upgrade $http_upgrade;    # websocket đồng tác giả (co-authoring)
    proxy_set_header Connection $oo_connection;
    proxy_buffering off;
}
```

`$oo_host` / `$oo_scheme` / `$oo_connection` là các `map` khai báo ở đầu
`frontend/nginx.conf` (file này được nạp trong khối `http` nên `map` hợp lệ).

**Vì sao không được dùng `proxy_set_header Host $host;`**

`$host` của nginx **luôn bỏ port**. DS sẽ sinh
`Location: http://localhost/onlyoffice/9.4.0-xxx/web-apps/...` → browser gọi cổng 80 →
không có gì lắng nghe → **iframe editor không bao giờ load → trang trắng**.
Đây chính là lỗi đã gặp và đã sửa.

**Vì sao không được dùng `proxy_redirect` để vá prefix**

Cách cũ `proxy_redirect ~^http://[^/]+/(.+)$ /onlyoffice/$1;` chỉ sửa được path,
không sửa được phần `scheme://host` đã mất port. Khi đã gửi `X-Forwarded-Prefix`
thì **phải bỏ** `proxy_redirect` đó, nếu không sẽ bị nhân đôi prefix
(`/onlyoffice/onlyoffice/...`).

**Các location phụ bắt buộc phải giữ** — DS sinh URL file tạm ở cả hai dạng:

- `location /cache/` và `location /onlyoffice/cache/` → tải file đã convert, có `secure_link` (md5 + expires). **Không được `proxy_buffering on`** ở đây.
- `location ~ ^/[0-9]+\.[0-9]+\.[0-9]+-[a-f0-9]+/` → fallback cho URL versioned không có prefix.

### 4. Luồng OnlyOffice & điểm gãy thường gặp

```
Browser ──1. GET /api/documents/onlyoffice/config──► Backend
        ◄── config + JWT token + _docsApiUrl=/onlyoffice/.../api.js
Browser ──2. GET /onlyoffice/web-apps/.../api.js──► nginx frontend ──► DS
Browser ──3. new DocsAPI.DocEditor() → iframe /onlyoffice/<version>/web-apps/...
DS      ──4. GET  {BACKEND_PUBLIC_URL}/api/documents/onlyoffice/download?token=…──► Backend ──► SMB/FTP/GDrive
DS      ──5. POST {BACKEND_PUBLIC_URL}/api/documents/onlyoffice/callback (status 2/6)──► Backend → ghi ngược storage
```

| Bước gãy | Biểu hiện | Nguyên nhân / cách sửa |
|----------|-----------|------------------------|
| 1 | Popup đỏ "No permission…" / 403 | `storage_permissions` chưa cấp `can_read` cho folder cha |
| 2 | "Không thể tải ONLYOFFICE API" | nginx thiếu `location /onlyoffice/`, hoặc `ONLYOFFICE_ENABLED=false` |
| 3 | **Trang trắng, không lỗi** | `Location` thiếu port → xem mục 3 |
| 4 | DS log `ECONNREFUSED` | `BACKEND_PUBLIC_URL` trỏ về frontend thay vì `http://backend:8000` |
| 4 | DS log `Download failed` 502 | Backend không đọc được SMB/FTP (sai share name, firewall, pysmb) |
| 5 | Sửa xong không lưu | `callbackUrl` sai host, hoặc `_put_file_bytes` thiếu quyền ghi |

### 5. Chẩn đoán lỗi (copy-paste được ngay)

```bash
# ── Container & env ────────────────────────────────────────────
docker compose ps
docker exec goldenfarm-backend printenv BACKEND_PUBLIC_URL ONLYOFFICE_URL \
       ONLYOFFICE_PUBLIC_URL ONLYOFFICE_ENABLED APP_ENV

# ── DS có gọi được backend không? (chạy TỪ container DS) ───────
docker exec goldenfarm-onlyoffice curl -sS -o /dev/null -w '%{http_code}\n' \
       http://backend:8000/api/health            # kỳ vọng 200

# ── Backend có đọc được SMB không? ──────────────────────────────
docker exec goldenfarm-backend python -c "import socket;s=socket.socket();s.settimeout(6);\
print('SMB connect_ex =', s.connect_ex(('10.0.0.90',445)))"    # kỳ vọng 0

# ── Redirect của DS có đúng host:port + prefix không? ───────────
curl -sSI -o /dev/null -D - http://localhost:8088/onlyoffice/web-apps/apps/spreadsheeteditor/main/index.html
#   ĐÚNG : Location: http://localhost:8088/onlyoffice/9.4.0-<tag>/web-apps/...
#   SAI  : Location: http://localhost/onlyoffice/...        ← thiếu port
#   SAI  : Location: http://localhost/9.4.0-.../web-apps/... ← thiếu prefix

# Giả lập truy cập qua NPM/HTTPS (production)
curl -sS -o /dev/null -D - -H 'X-Forwarded-Host: noibo.canhdongvang.vn' \
     -H 'X-Forwarded-Proto: https' \
     http://localhost:8088/onlyoffice/web-apps/apps/documenteditor/main/index.html \
  | grep -i '^location'
#   kỳ vọng: https://noibo.canhdongvang.vn/onlyoffice/9.4.0-<tag>/...

# ── Log ─────────────────────────────────────────────────────────
docker compose logs -f --tail=100 backend
docker exec goldenfarm-onlyoffice tail -n 100 /var/log/onlyoffice/documentserver/docservice/out.log
docker exec goldenfarm-onlyoffice tail -n 100 /var/log/onlyoffice/documentserver/converter/out.log
docker exec goldenfarm-onlyoffice tail -n 100 /var/log/onlyoffice/documentserver/nginx.error.log
docker exec goldenfarm-frontend  tail -n 100 /var/log/nginx/api-error.log

# ── Script chẩn đoán tổng hợp ───────────────────────────────────
node debug-onlyoffice.js
```

**Vị trí log cần nhớ**

| Log | Đường dẫn |
|-----|-----------|
| Backend | `docker compose logs backend` (và `backend/logs/`) |
| DS — lỗi tải file / callback | `/var/log/onlyoffice/documentserver/docservice/out.log` |
| DS — lỗi convert (.doc/.xls → OOXML) | `/var/log/onlyoffice/documentserver/converter/out.log` |
| DS — nginx (thiếu file, secure_link 403) | `/var/log/onlyoffice/documentserver/nginx.error.log` |
| Frontend nginx | `/var/log/nginx/api-access.log`, `/var/log/nginx/api-error.log` |

### 6. Những bẫy đã gặp (đọc để khỏi mất thời gian)

1. **Port 8090 trên máy dev Windows bị một `nginx.exe` chạy trên host chiếm.**
   `netstat -ano | findstr :8090` sẽ thấy cả `com.docker.backend` (0.0.0.0:8090)
   lẫn `nginx.exe` (127.0.0.1:8090). Windows ưu tiên binding cụ thể hơn →
   `http://localhost:8090/...` đi vào nginx của host và trả **404**, dù container DS vẫn khoẻ.
   Vì vậy `vite.config.js` proxy `/onlyoffice` tới **nginx của container frontend**
   (`http://127.0.0.1:8088`) chứ không tới DS trực tiếp — dev và prod dùng chung một cấu hình.
2. **`BACKEND_PUBLIC_URL` mà để trống** thì backend suy ra từ header `Host` của browser
   → ra URL của *frontend* → DS gọi ngược về frontend và báo `ECONNREFUSED`.
   Backend đã log cảnh báo `[ONLYOFFICE] BACKEND_PUBLIC_URL chưa được cấu hình…`; thấy dòng này là phải sửa `.env`.
3. **DS đổi `cache_tag` sau mỗi lần restart** (`9.4.0-1a84804b…` → `9.4.0-48bcd1b6…`).
   Trình duyệt cache URL cũ sẽ 404. Ép reload cứng (Ctrl+F5) sau khi restart DS.
4. **Thêm cột mới vào model SQLAlchemy** thì phải thêm luôn vào `columns_to_add`
   trong `backend/app/core/database.py` → `_add_missing_columns()`, kèm
   `ALTER TABLE … ADD COLUMN IF NOT EXISTS` nếu có file migration chạy tay.
   Không làm vậy production sẽ crash `column "X" does not exist`.
5. **`docker compose up -d` không tự refresh port mapping** khi `.env` đổi port.
   Phải `docker compose down && docker compose up -d`.
6. **Đường dẫn SMB**: `storage_config.remote_path` là **tên share** (`3.TÀI LIỆU THAM KHẢO`),
   không phải đường dẫn đầy đủ. Backend nối `share` + `file_path` và đổi `/` → `\`.

### 7. Dev local (không dùng Docker cho frontend)

```bash
docker compose up -d            # db + backend + onlyoffice + drawio
cd frontend && npm run dev      # http://localhost:5173
```

Vite proxy (cấu hình trong `frontend/vite.config.js`, override bằng biến môi trường):

| Path | Mặc định | Biến override |
|------|----------|---------------|
| `/api` | `http://127.0.0.1:8000` | `VITE_DEV_API_TARGET` |
| `/onlyoffice` | `http://127.0.0.1:8088` | `VITE_DEV_ONLYOFFICE_TARGET` |

Proxy `/onlyoffice` đặt `changeOrigin: false` để DS nhìn thấy `Host: localhost:5173`
và sinh redirect về đúng cổng của Vite → iframe editor vẫn same-origin.

## Maintenance

- **Backend logs**: Xem terminal chạy uvicorn
- **Frontend build**: `npm run build` → output `frontend/dist/`
- **DB reset**: Xoá volume `postgres-data` của docker-compose → backend tự seed lại khi khởi động
- **Realtime**: SSE qua `/api/events`, tự động update tickets, bookings, equipment, approvals
- **Chat nội bộ**: WebSocket qua `/api/chat/ws` — độc lập với SSE, xác thực bằng `token` + `employee_code` trong query param.
  - Sử dụng cấu trúc `Dict[str, Set[ConnectionMeta]]` tối ưu tra cứu đa tab (Multi-tab support).
  - Khắc phục `unhashable type` bằng cách set `eq=False` cho `@dataclass ConnectionMeta`.
  - Hỗ trợ broadcast song song với `asyncio.gather` để tránh block event loop.
  - Nghiệm thu tải staging bằng `tools/chat_load_test.py` với 500 tài khoản test riêng; xem `docs/CHAT_PRODUCTION.md`.
  - Để scale-out multi-worker: Sử dụng Redis Pub/Sub kết hợp hàm hook `set_cluster_publish`.
- **SSE filterRef**: Dùng `useRef` tránh reconnect khi filter thay đổi
- **Booking status update**: Cập nhật mỗi 30s qua `useCurrentTime` hook (vạch đỏ + trạng thái)
