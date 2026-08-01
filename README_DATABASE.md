# README_DATABASE — GoldenFarm ICT Management System

> Cập nhật: 2026-07-29 | Phiên bản: 3.0 (PostgreSQL-only)

---

## 1. Cấu hình kết nối (`.env`)

File `.env` tại thư mục gốc dự án:

```env
# Local development (backend chạy trực tiếp trên PC):
DATABASE_URL=postgresql://goldenfarm:your_password@localhost:5432/goldenfarmict

# Production (Docker Compose):
# DATABASE_URL=postgresql://goldenfarm:your_strong_password@db:5432/goldenfarmict

# Secret cho session token
SESSION_SALT=your_session_salt_here
```

### PostgreSQL Connection String Format:
```
postgresql://username:password@host:port/database_name
```

---

## 2. Khởi tạo Database

### Local Development:
```bash
# 1. Cài PostgreSQL 14+
# 2. Tạo database và user
createdb goldenfarmict
psql -c "CREATE USER goldenfarm WITH PASSWORD 'your_password';"
psql -c "GRANT ALL PRIVILEGES ON DATABASE goldenfarmict TO goldenfarm;"

# 3. Set DATABASE_URL trong .env
# 4. Start backend → schema tự tạo qua SQLAlchemy
```

### Docker Deployment:
- Docker Compose tự tạo PostgreSQL service
- Database: `goldenfarmict`
- User: `goldenfarm`
- Password: cấu hình trong `docker-compose.yml`
- Host: `db` (Docker network name)

---

## 3. Kiến trúc ORM

| File | Vai trò |
|------|---------|
| `backend/app/core/session.py` | PostgreSQL engine + SessionLocal (SQLAlchemy) |
| `backend/app/core/db.py` | Abstraction layer: `fetchall`, `fetchone`, `execute`, `insert` |
| `backend/app/core/database.py` | Schema initialization (PostgreSQL syntax), migrations |
| `backend/app/models.py` | SQLAlchemy ORM models — 30+ tables |

### Schema Creation (Auto):
```python
Base.metadata.create_all(bind=engine)
```
Chạy tự động khi backend khởi động. Không cần chạy migration thủ công.

---

## 4. Danh sách bảng đầy đủ (30 tables)

### 4.1 Nhân sự & Tài khoản

| Bảng | Các cột chính | Ghi chú |
|------|--------------|---------|
| `employees` | id, full_name, department, position, employee_code, phone, email, personal_email, handover_date, status, notes, created_at, updated_at | status: active/inactive |
| `users` | id, employee_code (UNIQUE), password_hash, role, created_at, updated_at | role: admin/head/user |
| `departments` | id, name (UNIQUE), head_id → employees.id, description, created_at | head_id logic FK (no constraint) |
| `user_permissions` | id, employee_code, module, can_view, can_edit — UNIQUE(employee_code, module) | Phân quyền theo user |
| `role_permissions` | id, role, module, can_view, can_edit — UNIQUE(role, module) | Phân quyền theo role |
| `department_permissions` | id, department, module, can_view, can_edit — UNIQUE(department, module) | Phân quyền theo phòng ban |

### 4.2 Thiết bị & License

| Bảng | Các cột chính | Ghi chú |
|------|--------------|---------|
| `equipment` | id, employee_id, equipment_type, specs, os_info, serial_number, asset_code, status, lifecycle_status, purchase_date, purchase_cost, issued_date, notes | asset_code tự sinh `TS-{seq:05d}` |
| `licenses` | id, equipment_id, license_key, product_name, activated, expiry_date, notes | license_key không UNIQUE ràng buộc DB |
| `equipment_history` | id, equipment_id, employee_code, employee_name, handover_date, return_date, old_status, new_status, changed_by | Lịch sử bàn giao/thu hồi |

### 4.3 Hỗ trợ & Đặt lịch

| Bảng | Các cột chính | Ghi chú |
|------|--------------|---------|
| `tickets` | id, employee_id, full_name, department, title, description, priority, status, resolution, admin_notes, employee_code | status: Cho xu ly / Dang xu ly / Da xu ly / Da huy |
| `resources` | id, type (car/meeting_room), name, description, is_active | Tài nguyên đặt lịch |
| `bookings` | id, resource_id, title, employee_id, full_name, department, book_date, start_time, end_time, status, notes, completed_at | status: active/finished |
| `business_trips` | id, employee_code, full_name, department, destination, purpose, start_date, end_date, status, notes, completed_at | Soft-delete: status=cancelled |

### 4.4 Phê duyệt & Quy trình

| Bảng | Các cột chính | Ghi chú |
|------|--------------|---------|
| `workflow_templates` | id, name, description, icon, is_active | Template quy trình |
| `workflow_steps` | id, template_id, step_order, approver_type, approver_value, department_match, can_edit | approver_type: role/specific |
| `approval_requests` | id, template_id, title, description, requester_code, requester_name, requester_dept, status, current_step, total_steps, metadata_json | status: draft/pending/approved/rejected/cancelled |
| `approval_logs` | id, request_id, step_order, approver_code, approver_name, action, comment, created_at | Lịch sử từng bước duyệt |

### 4.5 Lương & Phiếu lương

| Bảng | Các cột chính | Ghi chú |
|------|--------------|---------|
| `salary_slips` | id, employee_code, month, basic_salary, allowances, bonus, deductions, net_salary, notes, created_by, updated_by — UNIQUE(employee_code, month) | Phiếu lương cơ bản |
| `salaries` | employee_code (PK), month (PK), password, data_json, created_at, updated_at | JSON đầy đủ từ Excel |
| `salary_upload_logs` | id, month, filename, uploaded_by, uploaded_by_name, record_count, created_at | Log import Excel |

### 4.6 Tài liệu & Storage

| Bảng | Các cột chính | Ghi chú |
|------|--------------|---------|
| `storage_config` | id, name, type (ftp/smb/gdrive), host, port, username, password, remote_path, domain, is_active | Cấu hình storage |
| `storage_permissions` | id, storage_id, folder_path, role, employee_code, department, permission, target_type (EVERYONE/DEPARTMENT), can_read, can_write, can_edit, can_delete, allow_download, can_reshare, expires_at | Phân quyền Nextcloud-style |

### 4.7 Phần mềm & License Tổ chức

| Bảng | Các cột chính | Ghi chú |
|------|--------------|---------|
| `software_categories` | id, name, icon_name, order_index | Tab phân loại phần mềm |
| `software_items` | id, category_id, name, registered_date, expiration_date, contract_info, notes, created_at, updated_at | Danh sách phần mềm/license tổ chức |
| `lic_categories` | id, name, icon, sort_order | Danh mục license tổ chức |
| `lic_items` | id, category_id, name, registered_date, expiry_date, notes, contract_file, created_at, updated_at | License item |

### 4.8 Công việc (Todos)

| Bảng | Các cột chính | Ghi chú |
|------|--------------|---------|
| `todos` | id, title, description, scope (personal/department/all), department, creator_code, creator_name, assignee_code, assignee_name, status, priority, due_date, tags | status: todo/in_progress/review/done |
| `todo_subtasks` | id, todo_id, title, is_completed, sort_order, created_at | Checklist subtasks |

---

## 5. Quy tắc quan trọng

### 5.1 KHÔNG dùng FOREIGN KEY constraint
Dự án cố tình **không sử dụng FK constraints** ở DB. Toàn bộ tính toàn vẹn xử lý ở application layer.

### 5.2 Cascade delete (application layer)

| Hành động | Xử lý |
|-----------|-------|
| Xoá nhân viên | Tickets → set employee_id=NULL, full_name=''; Bookings → set employee_id=NULL; Equipment → thu hồi kho; History → đánh dấu return_date |
| Xoá workflow template | DELETE workflow_steps trước |
| Xoá resource | Chỉ khi COUNT(bookings) = 0 |
| Xoá storage config | DELETE storage_permissions trước |
| Thu hồi/Bàn giao thiết bị | Đóng history cũ (return_date), tạo history mới |
| Xoá software_categories | Chỉ khi COUNT(software_items) = 0 |
| Xoá todo | DELETE todo_subtasks trước |

### 5.3 Schema migration
- Chỉ thêm column qua `ALTER TABLE` trong `database.py` (có `try/except`)
- KHÔNG xoá column — đánh dấu deprecated
- Mọi migration phải backward-compatible

---

## 6. Data Types (PostgreSQL)

| PostgreSQL | Notes |
|------------|-------|
| `SERIAL` / `Integer autoincrement` | Auto-increment |
| `TEXT` / `String` | String |
| `DOUBLE PRECISION` / `Float` | Float |
| `BYTEA` | Binary data |
| `CURRENT_TIMESTAMP` | Timestamp |

### Date/Time convention:
- **Database**: lưu ISO string `YYYY-MM-DD` hoặc `YYYY-MM-DDTHH:MM:SS`
- **UI hiển thị**: `DD/MM/YYYY` qua `formatDate()` từ `utils/date.js`
- KHÔNG dùng `<input type="date">` (phụ thuộc locale trình duyệt)

---

## 7. WAL & Performance

```
wal_level = logical   # concurrent read/write
```

> 💡 **Project yêu cầu PostgreSQL 14+.** SQLite đã bị loại bỏ hoàn toàn từ phiên bản 2.0.
