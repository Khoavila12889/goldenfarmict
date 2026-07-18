# 🚀 Hướng dẫn Nhanh - Module Phiếu Lương

## Bước 1: Cài đặt Database

```bash
cd backend
python init_salary_table.py
```

**Output**:
```
📋 Initializing salary_slips table...
✅ Table created
✅ Indexes created
✅ Verification: 0 salary slips in database
✅ Created folder: E:\LICENSE\goldenfarm-ict-web\backend\salary_pdfs
🎉 Migration completed successfully!
```

---

## Bước 2: Khởi động Backend

```bash
cd backend
python -m uvicorn main:app --reload --port 8000
```

**Kiểm tra**: http://localhost:8000/api/health

---

## Bước 3: Khởi động Frontend

```bash
cd frontend
npm run dev
```

**Kiểm tra**: http://localhost:5173

---

## Bước 4: Test chức năng

### 4.1. Login as Admin

1. Mở http://localhost:5173/login
2. Login với tài khoản admin:
   - Username: `admin`
   - Password: `admin`

### 4.2. Truy cập trang quản lý lương

1. Click vào menu **"Quản lý lương"** ở sidebar
2. URL: http://localhost:5173/salary-slip-admin

### 4.3. Tạo phiếu lương thử nghiệm

**Tạo từng phiếu:**
1. Click nút **"Tạo phiếu lương"**
2. Chọn nhân viên từ dropdown
3. Chọn tháng (ví dụ: 12/2024)
4. Nhập thông tin lương:
   - Lương cơ bản: `15000000`
   - Phụ cấp: `2000000`
   - Thưởng: `3000000`
   - Khấu trừ: `1500000`
   - **Thực lĩnh tự động tính**: `18,500,000 VNĐ`
5. Click **"Tạo phiếu lương"**

**Hoặc tạo hàng loạt:**
1. Click nút **"Tạo hàng loạt"**
2. Chọn tháng: `2024-12`
3. Phòng ban: `Tất cả` (hoặc chọn phòng cụ thể)
4. Nhập lương mặc định cho tất cả nhân viên
5. Click **"Tạo hàng loạt"**
6. Confirm → Phiếu lương được tạo cho tất cả nhân viên active

### 4.4. Upload PDF (Optional)

1. Click nút **"Upload PDF"**
2. Chọn nhân viên
3. Chọn tháng
4. Chọn file PDF từ máy
5. Click **"Upload PDF"**

**Lưu ý**: Phải tạo bản ghi phiếu lương trước khi upload PDF!

### 4.5. User xem phiếu lương

1. Logout admin
2. Login với tài khoản nhân viên (ví dụ: `NV001` / `NV001`)
3. Click menu **"Phiếu lương"** (tất cả user đều thấy menu này)
4. URL: http://localhost:5173/salary-slip
5. Chọn tháng đã tạo phiếu lương
6. Click **"Xem phiếu lương"**
7. PDF sẽ hiển thị inline (nếu đã upload) hoặc hiện thông báo chưa có PDF
8. Click **"Tải về"** để download PDF

---

## Cấu trúc Menu theo Role

### Admin thấy:
- ✅ Dashboard
- ✅ Nhân viên
- ✅ Thiết bị
- ✅ License Keys
- ✅ Tickets
- ✅ Phê duyệt
- ✅ Quy trình
- ✅ Đặt lịch
- ✅ **Phiếu lương** (xem của chính mình)
- ✅ **Quản lý lương** (quản lý tất cả)

### User thấy:
- ✅ Dashboard
- ✅ Tickets
- ✅ Phê duyệt
- ✅ Đặt lịch
- ✅ **Phiếu lương** (xem của chính mình)

---

## API Endpoints

### User endpoints:
```
GET /api/salary-slips/my
  ?month=2024-12
  &employee_code=NV001
  &token=xxx
  &role=user
```

### Admin endpoints:
```
GET    /api/salary-slips/admin/list           # Danh sách
GET    /api/salary-slips/admin/employees      # Nhân viên active
POST   /api/salary-slips/admin/create         # Tạo/edit 1 phiếu
POST   /api/salary-slips/admin/bulk-generate  # Tạo hàng loạt
POST   /api/salary-slips/admin/upload-pdf     # Upload PDF
DELETE /api/salary-slips/admin/{id}           # Xóa
```

---

## Troubleshooting

### ❌ "Module 'salary_slips' has no attribute 'router'"

**Nguyên nhân**: Backend chưa restart sau khi thêm file mới

**Giải pháp**:
```bash
# Stop backend (Ctrl+C)
# Start lại
python -m uvicorn main:app --reload --port 8000
```

---

### ❌ "Table salary_slips not found"

**Nguyên nhân**: Chưa chạy migration script

**Giải pháp**:
```bash
cd backend
python init_salary_table.py
```

---

### ❌ "404 Not Found" khi xem PDF

**Nguyên nhân**: Chưa upload file PDF hoặc path không đúng

**Giải pháp**:
1. Kiểm tra bản ghi đã có trong database chưa (admin list)
2. Upload PDF qua form "Upload PDF"
3. Kiểm tra folder `backend/salary_pdfs/{year}/{month}/` có file không

---

### ❌ Menu "Quản lý lương" không hiện

**Nguyên nhân**: User không phải admin

**Giải pháp**: Login bằng tài khoản admin

---

## File Structure

```
goldenfarm-ict-web/
├── backend/
│   ├── app/
│   │   ├── routers/
│   │   │   └── salary_slips.py          # 🆕 API router
│   │   └── core/
│   │       └── database.py              # 📝 Updated
│   ├── company.db                       # 📝 Updated (table mới)
│   ├── salary_pdfs/                     # 🆕 PDF storage
│   │   └── {year}/{month}/{code}.pdf
│   ├── init_salary_table.py             # 🆕 Migration script
│   └── main.py                          # 📝 Updated
│
└── frontend/
    └── src/
        ├── pages/
        │   ├── SalarySlip.jsx           # ✅ Đã có (User view)
        │   └── SalarySlipAdmin.jsx      # 🆕 Admin management
        ├── components/
        │   └── Layout.jsx               # 📝 Updated (thêm menu)
        └── App.jsx                      # 📝 Updated (thêm route)
```

---

## Demo Workflow

### Scenario: Tạo phiếu lương tháng 12/2024 cho toàn công ty

```
1. Admin login
2. Vào "Quản lý lương"
3. Click "Tạo hàng loạt"
4. Chọn:
   - Tháng: 2024-12
   - Phòng ban: Tất cả
   - Lương cơ bản: 15,000,000
   - Phụ cấp: 2,000,000
   - Khấu trừ: 1,500,000
5. Submit → 50 phiếu được tạo
6. (Optional) Upload PDF cho từng nhân viên
7. Nhân viên login → Vào "Phiếu lương" → Xem tháng 12/2024
```

---

## Next Steps

1. ✅ Test với real data
2. ✅ Upload PDF files thực tế
3. ✅ Kiểm tra phân quyền (user không thấy data của user khác)
4. ✅ Deploy lên production

---

**Hoàn thành!** 🎉

Bất kỳ câu hỏi nào, vui lòng tham khảo `SALARY_SLIP_ADMIN_GUIDE.md` để biết chi tiết.
