# Salary Slip Module

## Location

| File | Path |
|------|------|
| Component | `src/pages/SalarySlip.jsx` |
| Styles | `src/pages/SalarySlip.css` |
| Hook | `src/hooks/useSalarySlip.js` |
| Admin page | `src/pages/SalarySlipAdmin.jsx` |
| Backend user API | `backend/app/routers/salary_user.py` |
| Backend admin API | `backend/app/routers/salary_slips.py` |

## Route

```
/salary-slip        → Employee view (user, admin)
/salary-slip-admin  → Admin management (admin only)
```

## Access

- `user`, `admin` — view own salary slips
- `admin` only — manage all slips, upload Excel, CRUD

## Architecture

### Data Flow

```
[SalarySlip.jsx]
  └─ useSalarySlip hook
       └─ POST /api/salary/verify-and-view  { employee_code, month, password?, token, role }
            ├─ 200 → salary data JSON
            ├─ 401 → needPassword=true → show password form → retry with password
            └─ 404 → "No salary slip" message
```

The employee view renders salary data as **HTML tables** (not PDF). The JSON response contains a full context object with company info, employee details, salary breakdown, deductions, and leave tracking.

### Admin Excel Import Flow

```
[SalarySlipAdmin.jsx]
  └─ Upload .xlsx → POST /api/salary-slips/admin/upload-salaries
       └─ Parse Excel → create_salary_context() → store JSON in salaries table
            └─ Auto-create user accounts for new employees
```

## Frontend Components

### SalarySlip.jsx (~325 lines)

Self-contained component with these states:

| State | Display |
|-------|---------|
| Loading | Spinner + "Đang tải..." |
| Password required | Lock icon + password input form |
| Error | Error message with details |
| No data | "Chưa có phiếu lương tháng X/Y" |
| Success | HTML-rendered salary slip |

**Header**: Month/year selector with prev/next arrows + inline date picker.
**Body**: Company letterhead → Employee info → Salary table → Deductions → Net pay → Leave tracking table → Footer.

### SalarySlipAdmin.jsx (~147 lines)

Admin interface for Excel payroll upload. Features file drop zone, progress bar, success/error display.

### useSalarySlip.js (~66 lines)

Custom hook managing `selectedMonth`, `salaryData`, `isLoading`, `error`, `needPassword`. Calls `POST /api/salary/verify-and-view`.

## CSS Organization (`SalarySlip.css`)

```
.salary-container       → Flex column, full viewport height
.salary-header          → Month selector bar
.salary-content         → Content area (block layout)
.pdf-a4-portrait        → Simulated A4 paper
.pdf-main-table         → Main salary breakdown table (5 columns)
.pdf-tracking-table     → Leave tracking table (5 columns)
.pdf-info-table         → Employee info table
.salary-pwd-wrap        → Password form
```

**Responsive breakpoints:**
- `@media (max-width: 768px)` — Tablet: compact padding, smaller fonts
- `@media (max-width: 480px)` — Mobile: single-row header, `table-layout: auto` with `width: 1%` shrink columns, `min-width: 75px` for number cells, `word-break: break-word` for descriptions
- `@media print` — Hide nav, remove shadows

### Table Column Strategy (Mobile)

| Column | Width | Behavior |
|--------|-------|----------|
| 1, 3 (description) | `auto` | Take remaining space, wrap text |
| 2, 4 (amount) | `1%` + `nowrap` | Shrink to fit content, `min-width: 75px` |
| 5 (đồng) | `1%` + `nowrap` | Shrink to fit "đồng" text |

Uses `table-layout: auto` to let columns auto-size. Number cells with `.text-right` class get guaranteed `min-width: 75px` for amounts up to 9 digits.

## Backend API

### Employee API (`salary_user.py`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/salary/verify-and-view` | View salary slip JSON (with optional password) |

### Admin API (`salary_slips.py`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/salary-slips/admin/list` | List all slips (filters: month, employee_code, dept) |
| `GET` | `/api/salary-slips/admin/employees` | Get active employees |
| `POST` | `/api/salary-slips/admin/create` | Create/update single slip |
| `POST` | `/api/salary-slips/admin/bulk-generate` | Generate for all/dept with defaults |
| `POST` | `/api/salary-slips/admin/upload-salaries` | Upload Excel → parse → store |
| `POST` | `/api/salary-slips/admin/import-from-excel` | Import into salary_slips table |
| `DELETE` | `/api/salary-slips/admin/{slip_id}` | Delete a slip |

## Database

Two tables in `company.db`:

### `salaries` — Full JSON context for HTML rendering

```sql
salaries (employee_code, month, password, data_json, ...)
```

### `salary_slips` — Structured data for analytics

```sql
salary_slips (employee_code, month, basic_salary, allowances, bonus, deductions, net_salary, ...)
```

## Quick Start

```bash
# Backend
cd backend
python init_salary_table.py
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm run dev
# → http://localhost:5173/salary-slip
```

## Dependencies

- **Frontend**: `lucide-react` (icons), `axios` (HTTP)
- **Backend**: `fastapi`, `uvicorn`, `pandas`, `openpyxl`, `python-multipart`
