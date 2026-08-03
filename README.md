# GOLDENFARM ICT Management System

Hệ thống quản lý ICT nội bộ — Quản lý nhân viên, thiết bị, license phần mềm, ticket hỗ trợ IT và đặt lịch xe/phòng họp.

## Tech Stack

| Tầng | Công nghệ |
|------|-----------|
| **Backend** | FastAPI (Python 3.11+) + PostgreSQL 16 |
| **Frontend** | React 19 + Vite 6 + React Router 7 |
| **HTTP Client** | Axios 1.7 |
| **Realtime** | Server-Sent Events (SSE) |
| **Icons** | lucide-react (50+ icons) |
| **CSS** | Thuần CSS (CSS Custom Properties — dark/light mode) + `shared.css` cho pattern dùng chung |
| **Storage** | SMB (`pysmb`), FTP (`ftplib`), Google Drive (`google-api-python-client`, `google-auth`) |
| **Office Editor** | ONLYOFFICE Document Server + `@onlyoffice/document-editor-react` |

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
│                    │ PostgreSQL 16 │                               │
│                    │goldenfarmict│                              │
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
- **Online Office Editor**: Chỉnh sửa .docx/.xlsx/.pptx trực tuyến qua ONLYOFFICE Document Server (`office.goldenfarm.vn`)
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
- **Kanban Board 4 cột**: Cần làm, Đang xử lý, Chờ duyệt, Đã hoàn thành với hiệu ứng Glassmorphism hiện đại.
- **Phạm vi phân quyền (Scope)**: Switch giữa cá nhân (Personal Todos) và phòng ban (Department Shared Todos).
- **Phân công & Giao việc**: Phân công người chịu trách nhiệm, người tạo, hạn chót (Due Date), tags/nhãn và độ ưu tiên (Low, Medium, High, Urgent 🚨).
- **Hạn hoàn thành (Due Date)**: Chọn ngày bằng **calendar picker** (`type="date"`, không nhập tay, không cần giờ). Không thể đặt hạn **trước ngày hiện tại** — hiện cảnh báo ⚠️ và chặn lưu.
- **Subtask Checklist & Progress Bar**: Tạo các việc con (subtasks), đánh dấu hoàn thành trực quan với thanh phần trăm tiến độ (Progress %).
- **Cảnh báo quá hạn (Overdue Alert)**: Đánh dấu đỏ các công việc trễ hạn cần ưu tiên xử lý.
- **Quyền User**: Được tạo, chỉnh sửa, chuyển trạng thái công việc do mình tạo/được giao, và **xóa công việc do chính mình tạo** (frontend + backend enforce).
- **Realtime SSE Sync**: Tự động cập nhật Kanban realtime giữa các thành viên cùng phòng ban khi có thay đổi.


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
```

- **Local development**: Chạy PostgreSQL local rồi cấu hình `DATABASE_URL` trong `.env`
- **Docker deployment**: Không cần đổi gì — docker-compose tự gắn `DATABASE_URL` vào container backend

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

> Hệ thống sử dụng **PostgreSQL 16** duy nhất (service `db` trong docker-compose). Không còn hỗ trợ SQLite.

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
│   │   │   ├── OnlyOfficeViewer.jsx # ONLYOFFICE document editor overlay
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
│   │   │   ├── Documents.jsx      # Storage browser SMB/FTP/GDrive + ONLYOFFICE
│   │   │   ├── Todos.jsx, Todos.css # Kanban quản lý công việc
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
│   │   │   └── api.js             # Axios instance + 93+ API functions (all modules)
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
| `GET` | `/api/documents/onlyoffice/config` | Lấy editor config cho ONLYOFFICE (JWT-signed) |
| `GET` | `/api/documents/onlyoffice/download` | Stream file cho ONLYOFFICE Document Server (temporary JWT token) |
| `POST` | `/api/documents/onlyoffice/callback` | Webhook từ ONLYOFFICE — lưu file sau khi chỉnh sửa (status 2/6) |
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
| `GET` | `/api/shares/{token}/download` | Tải/xem file (`disposition=inline` chỉ cần quyền `view`; `disposition=attachment` cần quyền `download`) |
| `GET` | `/api/shares/{token}/archive` | Tải .zip toàn bộ thư mục (cần quyền `download`, giới hạn 200 file / 200MB, 413 nếu quá lớn) |
| `GET` | `/api/shares/{token}/onlyoffice/config` | Editor config ONLYOFFICE (folder share: kèm `file_path`/`file_id`/`file_name`) — trả `permissions` theo quyền share |
| `POST` | `/api/shares/{token}/callback` | Callback ONLYOFFICE — lưu ngược về kho khi share nội bộ có quyền `edit`, ngược lại bỏ qua |

## Database

**Database**: PostgreSQL 16 — kết nối qua `DATABASE_URL` (mặc định service `db` trong docker-compose)

### Tables

| Table | Records | Ghi chú |
|-------|---------|---------|
| `employees` | 354 | `employee_code` unique, `status` (active/inactive) |
| `equipment` | 100 | `asset_code` (TS-XXXXX), `lifecycle_status`, `storage` (in_stock/issued) |
| `licenses` | 216 | `license_key` UNIQUE, gán theo equipment_id |
| `lic_categories` | 4 | name, icon, order_index |
| `lic_items` | 0 | category_id, name, registered_date, expiration_date, contract_info |
| `equipment_history` | 1 | handover_date, return_date, old/new status, changed_by |
| `tickets` | 126 | Yêu cầu hỗ trợ IT |
| `users` | 355 | employee_code + password_hash + role |
| `user_permissions` | 10 | Permission module theo user |
| `resources` | 7 | Xe + Phòng họp, is_active |
| `bookings` | 81 | resource_id, book_date, start/end_time, status |
| `business_trips` | 21 | employee_code, destination, start/end_date, status |
| `workflow_templates` | 3 | name, icon, is_active |
| `workflow_steps` | 1 | template_id, step_order, approver_type/role/department_match |
| `approval_requests` | 1 | requester_code, status, current_step, total_steps |
| `approval_logs` | 0 | request_id, step_order, approver_code, action, comment |
| `departments` | 20 | name UNIQUE, head_id → employees.id |
| `storage_config` | 3 | Cấu hình storage SMB/FTP/GDrive |
| `storage_permissions` | 0 | Phân quyền thư mục storage |
| `document_shares` | 0 | Link chia sẻ file/folder — `item_type` ('file'/'folder'), `share_type` (ALL/DEPT/PUBLIC), `permissions` (comma list `view,download,edit`), `share_token` UNIQUE, `department_id`, `expires_at` |
| `salary_slips` | 2 | Phiếu lương (dạng cột) |
| `salaries` | 4 | Phiếu lương (dạng JSON), ON CONFLICT upsert |
| `salary_upload_logs` | 1 | Lịch sử upload Excel |
| `software_categories` | 4 | Danh mục phần mềm |
| `software_items` | 0 | Mục phần mềm |
| `todos` | 27 | Công việc theo phòng ban / cá nhân |
| `todo_subtasks` | 32 | Checklist con của todo |

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

## Maintenance

- **Backend logs**: Xem terminal chạy uvicorn
- **Frontend build**: `npm run build` → output `frontend/dist/`
- **DB reset**: Xoá volume `postgres-data` của docker-compose → backend tự seed lại khi khởi động
- **Realtime**: SSE qua `/api/events`, tự động update tickets, bookings, equipment, approvals
- **SSE filterRef**: Dùng `useRef` tránh reconnect khi filter thay đổi
- **Booking status update**: Cập nhật mỗi 30s qua `useCurrentTime` hook (vạch đỏ + trạng thái)
