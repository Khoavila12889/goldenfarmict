# GOLDENFARM ICT — RUNBOOK

> Luôn đọc `SYSTEM_LOGIC.md` trước khi code. File này là checklist để chạy project.

---

## 1. Quick Start

### Backend (cổng 8080)
```bash
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8080 --reload
# Hoặc: run.bat
# → http://127.0.0.1:8080
# → SSE: http://127.0.0.1:8080/api/events
# → Health: http://127.0.0.1:8080/api/health
```

### Frontend (cổng 5173)
```bash
cd frontend
npm run dev
# Hoặc: run.bat
# → http://127.0.0.1:5173
# Vite proxy /api → 127.0.0.1:8080 (xem vite.config.js)
```

### Default login
- **Admin**: `admin` / `admin`
- **User**: Mã nhân viên / trùng mã NV

---

## 2. Pre-Code Checklist

Trước khi sửa code, kiểm tra:

- [ ] Đã đọc `SYSTEM_LOGIC.md` (kiến trúc, cascade, SSE, role)?
- [ ] Đã đọc `README-UI.md` (CSS variables, naming, layout)?
- [ ] Module có SSE event không? Đã publish chưa?
- [ ] Có cascade delete không? Xử lý ở backend?
- [ ] Role check: admin/head/user đúng chưa?
- [ ] Dùng CSS class (không inline style)?
- [ ] Không thêm dependency mới?

---

## 3. Database

### File
`backend/company.db` (SQLite WAL mode)

### Schema
18 tables — xem `database.py` hoặc `SYSTEM_LOGIC.md` mục 4.1.

### Migration
Thêm column mới trong `init_db()`:
```python
try:
    conn.execute("ALTER TABLE table_name ADD COLUMN col_name TYPE")
except sqlite3.OperationalError:
    pass  # column already exists
```

---

## 4. Common Tasks

### Cascade delete employee
`routers/employees.py:delete_employee()` — set NULL cho tickets, bookings, equipment, history.

### Cascade delete workflow
`routers/approvals.py:delete_workflow()` — DELETE steps trước, template sau.

### Equipment lifecycle
`routers/equipment.py`: allocate → transfer → revoke. Ghi equipment_history, publish SSE.

### Salary import Excel
`POST /api/salary-slips/admin/upload-salaries` — parse Excel → `salaries` (JSON) table.
`POST /api/salary-slips/admin/import-from-excel` — parse Excel → `salary_slips` table.

### Storage browse
`GET /api/documents/browse/{config_id}?path=/` — FTP/SMB/GDrive. Check permission trước.

---

## 5. Debug

### SSE test
```javascript
// Browser console
const es = new EventSource('/api/events')
es.onmessage = e => console.log(e)
```

### API test (PowerShell)
```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8080/api/health
Invoke-RestMethod -Uri http://127.0.0.1:8080/api/dashboard/stats
```

---

## 6. Deploy

```bash
# Build frontend
cd frontend
npm run build   # → dist/

# Run backend (production)
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8080
```

Frontend `dist/` phải được serve bởi backend hoặc reverse proxy (CORS đã cấu hình cho localhost:5173 + 127.0.0.1:5173).

---

## 7. Migration Prep (SQLite → PostgreSQL)

### DB Layer (đã có)
| File | Role |
|------|------|
| `app/core/session.py` | SQLAlchemy engine + SessionLocal — **đổi DATABASE_URL để migrate** |
| `app/models.py` | ORM models 18 tables |
| `app/core/db.py` | Abstraction layer (dùng SQLAlchemy, module mới dùng) |
| `app/core/database.py` | Legacy init + `get_conn()` — module cũ giữ nguyên |

### Cách migrate sang PostgreSQL
```
1. Cài asyncpg:            pip install asyncpg
2. Sửa DATABASE_URL:      app/core/session.py → "postgresql://..."
3. Tạo DB mới + migrate data từ company.db
4. Chạy backend → SQLAlchemy tự tạo schema
5. Module mới viết qua db.py hoặc SQLAlchemy ORM
6. Module cũ migrate dần, xoá get_conn() cuối cùng
```
Xem chi tiết `SYSTEM_LOGIC.md` mục 8.
