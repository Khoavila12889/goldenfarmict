# 📋 Hướng dẫn Module Quản lý Phiếu Lương (Admin)

## 🎯 Tổng quan

Module quản lý phiếu lương cho phép **ADMIN** tạo và quản lý phiếu lương cho toàn bộ nhân viên, trong khi **TẤT CẢ USER** có thể xem phiếu lương của chính họ.

---

## 🏗️ Kiến trúc

### Backend (FastAPI)

```
backend/
├── app/
│   ├── routers/
│   │   └── salary_slips.py          # 🆕 API endpoints cho phiếu lương
│   └── core/
│       └── database.py               # 📝 Đã cập nhật (thêm bảng salary_slips)
├── main.py                           # 📝 Đã cập nhật (include router)
└── salary_pdfs/                      # 🆕 Thư mục lưu file PDF
    └── {year}/
        └── {month}/
            └── {employee_code}.pdf
```

### Frontend (React)

```
frontend/src/
├── pages/
│   ├── SalarySlip.jsx               # ✅ Đã có (User xem phiếu lương)
│   └── SalarySlipAdmin.jsx          # 🆕 Admin quản lý phiếu lương
├── hooks/
│   └── useSalarySlip.js             # ✅ Đã có (Hook xem PDF)
└── App.jsx                          # 📝 Đã cập nhật (thêm route admin)
```

---

## 🗄️ Database Schema

### Bảng `salary_slips`

```sql
CREATE TABLE salary_slips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_code TEXT NOT NULL,
    month TEXT NOT NULL,                  -- Format: YYYY-MM (ví dụ: 2024-12)
    basic_salary REAL DEFAULT 0,         -- Lương cơ bản
    allowances REAL DEFAULT 0,            -- Phụ cấp
    bonus REAL DEFAULT 0,                 -- Thưởng
    deductions REAL DEFAULT 0,            -- Khấu trừ (BHXH, thuế...)
    net_salary REAL DEFAULT 0,            -- Thực lĩnh = basic + allowances + bonus - deductions
    notes TEXT DEFAULT '',                -- Ghi chú
    created_by TEXT DEFAULT '',           -- Admin tạo
    updated_by TEXT DEFAULT '',           -- Admin cập nhật lần cuối
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(employee_code, month)          -- 1 nhân viên chỉ có 1 phiếu lương/tháng
);

-- Indexes
CREATE INDEX idx_salary_employee ON salary_slips(employee_code);
CREATE INDEX idx_salary_month ON salary_slips(month);
CREATE INDEX idx_salary_emp_month ON salary_slips(employee_code, month);
```

---

## 🔌 Backend API Endpoints

### 1️⃣ **GET** `/api/salary-slips/my` - Xem phiếu lương của chính mình

**Quyền**: Tất cả user (authenticated)

**Query Parameters**:
- `month` (required): Tháng (YYYY-MM)
- `employee_code`: Mã nhân viên (từ session)
- `token`: Token xác thực
- `role`: Role của user

**Response**: PDF file stream

**Example**:
```bash
curl -H "Authorization: Bearer token" \
  "http://localhost:8000/api/salary-slips/my?month=2024-12&employee_code=NV001&token=xxx&role=user"
```

---

### 2️⃣ **GET** `/api/salary-slips/admin/list` - Liệt kê tất cả phiếu lương

**Quyền**: Admin only

**Query Parameters**:
- `month` (optional): Lọc theo tháng
- `employee_code` (optional): Tìm theo mã NV
- `department` (optional): Lọc theo phòng ban
- `admin_code`, `token`, `role`: Xác thực admin

**Response**:
```json
{
  "data": [
    {
      "id": 1,
      "employee_code": "NV001",
      "full_name": "Nguyễn Văn A",
      "department": "IT",
      "position": "Developer",
      "month": "2024-12",
      "basic_salary": 15000000,
      "allowances": 2000000,
      "bonus": 3000000,
      "deductions": 1500000,
      "net_salary": 18500000,
      "notes": "",
      "created_at": "2024-12-01 10:00:00"
    }
  ],
  "total": 1
}
```

---

### 3️⃣ **GET** `/api/salary-slips/admin/employees` - Lấy danh sách nhân viên active

**Quyền**: Admin only

**Query Parameters**:
- `department` (optional): Lọc theo phòng ban
- `admin_code`, `token`, `role`: Xác thực admin

**Response**: Danh sách nhân viên để tạo phiếu lương

---

### 4️⃣ **POST** `/api/salary-slips/admin/create` - Tạo/cập nhật phiếu lương

**Quyền**: Admin only

**Body**:
```json
{
  "employee_code": "NV001",
  "month": "2024-12",
  "basic_salary": 15000000,
  "allowances": 2000000,
  "bonus": 3000000,
  "deductions": 1500000,
  "net_salary": 18500000,
  "notes": "Thưởng cuối năm"
}
```

**Response**:
```json
{
  "success": true,
  "action": "created",  // hoặc "updated"
  "id": 1
}
```

**Logic**:
- Nếu phiếu lương đã tồn tại (cùng `employee_code` và `month`) → UPDATE
- Nếu chưa tồn tại → INSERT

---

### 5️⃣ **POST** `/api/salary-slips/admin/bulk-generate` - Tạo hàng loạt phiếu lương

**Quyền**: Admin only

**Body**:
```json
{
  "month": "2024-12",
  "department": "",  // Để trống = tất cả phòng ban
  "default_basic_salary": 15000000,
  "default_allowances": 2000000,
  "default_bonus": 0,
  "default_deductions": 1500000
}
```

**Response**:
```json
{
  "success": true,
  "message": "Generated salary slips for 50 employees",
  "created": 40,
  "updated": 10,
  "errors": []
}
```

**Ứng dụng**: Tạo phiếu lương cho toàn bộ nhân viên với giá trị mặc định, sau đó admin có thể điều chỉnh từng phiếu.

---

### 6️⃣ **POST** `/api/salary-slips/admin/upload-pdf` - Upload file PDF

**Quyền**: Admin only

**Form Data**:
- `employee_code`: Mã nhân viên
- `month`: Tháng (YYYY-MM)
- `file`: File PDF

**Response**:
```json
{
  "success": true,
  "message": "PDF uploaded successfully",
  "employee_code": "NV001",
  "month": "2024-12",
  "file_size": 524288,
  "file_path": "2024/12/NV001.pdf"
}
```

**Lưu ý**: 
- Phải tạo bản ghi trong database trước khi upload PDF
- File lưu tại: `backend/salary_pdfs/{year}/{month}/{employee_code}.pdf`

---

### 7️⃣ **DELETE** `/api/salary-slips/admin/{slip_id}` - Xóa phiếu lương

**Quyền**: Admin only

**Response**:
```json
{
  "success": true,
  "message": "Salary slip deleted successfully"
}
```

**Logic**: Xóa cả bản ghi database và file PDF (nếu có)

---

## 🎨 Frontend - Admin UI

### Trang `/salary-slip-admin` (Admin only)

**Tính năng**:

1. **📊 Thống kê tổng quan**
   - Tổng số phiếu lương
   - Tổng nhân viên active
   - Tổng lương phải trả

2. **🔍 Bộ lọc**
   - Lọc theo tháng
   - Lọc theo phòng ban
   - Tìm theo mã nhân viên

3. **📋 Bảng danh sách phiếu lương**
   - Hiển thị: Mã NV, Họ tên, Phòng ban, Tháng, Lương cơ bản, Phụ cấp, Thưởng, Khấu trừ, Thực lĩnh
   - Thao tác: Xóa

4. **➕ Tạo phiếu lương**
   - Form tạo phiếu lương cho 1 nhân viên
   - Auto-calculate net_salary = basic + allowances + bonus - deductions

5. **👥 Tạo hàng loạt**
   - Tạo phiếu lương cho nhiều nhân viên cùng lúc
   - Chọn tháng và phòng ban (optional)
   - Nhập giá trị lương mặc định

6. **📤 Upload PDF**
   - Upload file PDF cho phiếu lương đã tạo
   - Chọn nhân viên, tháng, file

---

## 🚀 Workflow Sử dụng

### Quy trình tạo phiếu lương (Admin)

```
1. Tạo bản ghi phiếu lương
   ├─ Option A: Tạo từng nhân viên (Create Form)
   └─ Option B: Tạo hàng loạt (Bulk Generate)

2. Upload file PDF (nếu có)
   └─ Upload PDF Form

3. Nhân viên có thể xem phiếu lương
   └─ Trang /salary-slip
```

### Ví dụ cụ thể

**Tháng 12/2024 - Tạo phiếu lương cho toàn công ty:**

1. **Admin vào `/salary-slip-admin`**
2. **Click "Tạo hàng loạt"**
   - Chọn tháng: `2024-12`
   - Phòng ban: `Tất cả`
   - Lương cơ bản: `15,000,000`
   - Phụ cấp: `2,000,000`
   - Khấu trừ: `1,500,000`
   - → Tạo 50 phiếu lương

3. **Điều chỉnh từng phiếu (nếu cần)**
   - Click vào phiếu lương cần sửa
   - Edit form → Update

4. **Upload PDF (nếu có)**
   - Click "Upload PDF"
   - Chọn nhân viên: `NV001`
   - Chọn tháng: `2024-12`
   - Chọn file: `phieu-luong-NV001.pdf`
   - → Upload thành công

5. **Nhân viên vào `/salary-slip` để xem**
   - Chọn tháng: `12/2024`
   - Click "Xem phiếu lương"
   - → Hiển thị PDF hoặc download

---

## 🔐 Phân quyền

| Tính năng | User | Admin |
|-----------|------|-------|
| Xem phiếu lương của chính mình | ✅ | ✅ |
| Xem tất cả phiếu lương | ❌ | ✅ |
| Tạo phiếu lương | ❌ | ✅ |
| Tạo hàng loạt | ❌ | ✅ |
| Upload PDF | ❌ | ✅ |
| Xóa phiếu lương | ❌ | ✅ |

---

## 🧪 Testing

### 1. Test Backend API

```bash
# Start backend
cd backend
uvicorn main:app --reload --port 8000

# Test endpoints với curl hoặc Postman
```

### 2. Test Frontend

```bash
# Start frontend
cd frontend
npm run dev

# Login as admin
# Go to http://localhost:5173/salary-slip-admin
```

### 3. Test Flow

**Admin:**
1. ✅ Tạo phiếu lương cho NV001 tháng 12/2024
2. ✅ Upload PDF file
3. ✅ Xem danh sách phiếu lương
4. ✅ Tạo hàng loạt cho toàn phòng IT
5. ✅ Xóa phiếu lương

**User (NV001):**
1. ✅ Login vào hệ thống
2. ✅ Vào trang "Phiếu lương"
3. ✅ Chọn tháng 12/2024
4. ✅ Xem PDF inline trong browser
5. ✅ Download PDF về máy

---

## 📝 Lưu ý quan trọng

### 1. **File Storage Path**

Mặc định: `backend/salary_pdfs/{year}/{month}/{employee_code}.pdf`

**Để thay đổi:**
```python
# File: backend/app/routers/salary_slips.py
# Line 15-16
SALARY_STORAGE_PATH = Path("/your/custom/path")
```

**Khuyến nghị**: 
- Production: Dùng FTP server hoặc cloud storage (S3, Azure Blob)
- Development: Local folder

### 2. **Security**

✅ **Đã implement:**
- Role-based access control (Admin only)
- Token verification
- Directory traversal protection
- File type validation (PDF only)

⚠️ **Cần thêm (Production):**
- HTTPS encryption
- File size limit
- Virus scan trước khi lưu
- Audit logging
- Rate limiting

### 3. **Performance**

- Sử dụng indexes cho queries
- Pagination cho danh sách phiếu lương (nếu > 1000 records)
- CDN cho file PDF (production)

### 4. **Backup**

- Backup database định kỳ
- Backup thư mục `salary_pdfs/`
- Version control cho schema changes

---

## 🐛 Troubleshooting

### Lỗi "Admin access required"
→ Kiểm tra `role` trong sessionStorage phải là `admin`

### Lỗi "File not found" khi xem PDF
→ Kiểm tra:
1. Bản ghi đã có trong database?
2. File PDF đã upload chưa?
3. Path lưu file đúng chưa?

### Lỗi "Invalid token"
→ Token hết hạn, login lại

### Không thấy menu "Quản lý lương"
→ User không phải admin, chỉ thấy "Phiếu lương"

---

## 🎉 Tổng kết

✅ **Đã hoàn thành:**
- Backend API đầy đủ (7 endpoints)
- Database schema với indexes
- Frontend admin UI
- Frontend user UI (đã có sẵn)
- Role-based access control
- PDF upload & download
- Bulk generation
- Filters & search

🚀 **Sẵn sàng sử dụng!**

---

**Created**: December 2024  
**Module**: Salary Slip Management  
**Framework**: FastAPI + React + SQLite  
**Version**: 1.0.0
