# PostgreSQL Migration Guide

## Overview

Project GoldenFARM ICT đã chuyển hoàn toàn sang PostgreSQL từ phiên bản 2.0 trở đi. SQLite đã bị loại bỏ.

## Quick Start

### 1. PostgreSQL Setup

**Option A: Sử dụng Docker (Khuyến nghị)**
```bash
docker compose up -d
```

PostgreSQL sẽ được tự động khởi động với:
- Database: `goldenfarmict`
- User: `goldenfarm`
- Password: `your_strong_password` (cấu hình trong `docker-compose.yml`)

**Option B: Cài PostgreSQL cục bộ**
```bash
# Install PostgreSQL
# Create database and user
createdb goldenfarmict
CREATE USER goldenfarm WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE goldenfarmict TO goldenfarm;
```

### 2. Cấu hình `.env`

```env
DATABASE_URL=postgresql://goldenfarm:your_password@localhost:5432/goldenfarmict
```

### 3. Khởi động Backend

```bash
cd backend
python -m uvicorn main:app --reload --port 8080
```

Backend sẽ tự động tạo tất cả các bảng (tables) khi khởi động lần đầu.

## Migration từ SQLite sang PostgreSQL

### Bước 1: Backup dữ liệu SQLite hiện tại

```bash
# Backup database cũ
cp backend/company.db backend/company.db.backup
```

### Bước 2: Export dữ liệu từ SQLite

```sql
-- Trong SQLite
.mode csv
.output export_employees.csv
SELECT * FROM employees;
.output export_equipment.csv
SELECT * FROM equipment;
-- ... export các bảng khác
```

### Bước 3: Import vào PostgreSQL

Sử dụng `psql` hoặcpgAdmin để import data:

```bash
psql -U goldenfarm -d goldenfarmict -f import_script.sql
```

### Bước 4: Reset Sequences

```bash
# Chạy script reset sequence
cd backend
python fix_postgres_sequences.py
```

Hoặc chạy SQL thủ công:

```sql
SELECT setval('employees_id_seq', COALESCE(MAX(id), 1)) FROM employees;
SELECT setval('equipment_id_seq', COALESCE(MAX(id), 1)) FROM equipment;
-- ... cho từng bảng
```

## Schema Changes

### Tables (21 tables)
- employees, equipment, licenses, equipment_history
- tickets, users, resources, workflow_templates
- workflow_steps, approval_requests, approval_logs
- departments, business_trips, bookings, salary_slips
- salaries, salary_upload_logs, storage_config
- storage_permissions, software_categories, software_items
- lic_categories, lic_items, user_permissions
- todos, todo_subtasks

### Data Types
- Tất cả các trường ngày tháng: `TEXT` (ISO format: `YYYY-MM-DD`)
- Các trường số: `INTEGER`, `REAL`
- TEXT fields: `TEXT` (thay vì VARCHAR)

## Development

### Local Development với PostgreSQL

1. Cài PostgreSQL trên máy local
2. Tạo database và user
3. Set `DATABASE_URL` trong `.env`
4. Backend tự động tạo tables khi khởi động

### Docker Development

```bash
# Khởi động toàn bộ stack
docker compose up -d --build

# Xem logs
docker compose logs -f backend

# Restart backend
docker compose restart backend
```

## Troubleshooting

### Error: DATABASE_URL not set
```bash
# Create .env file
echo "DATABASE_URL=postgresql://goldenfarm:your_password@localhost:5432/goldenfarmict" > .env
```

### Error: Connection refused
```bash
# Check if PostgreSQL is running
docker compose ps
# Or check local PostgreSQL service
```

### Error: Table does not exist
Backend sẽ tự động tạo tables khi khởi động. Nếu không:
```bash
# Reset database
docker compose down -v
docker compose up -d
```

## Support

- Documentation: See `README.md`
- Database Schema: See `SYSTEM_LOGIC.md`
- Database Models: See `backend/app/models.py`
