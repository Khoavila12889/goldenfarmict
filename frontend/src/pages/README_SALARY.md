# Salary Slip Module

## 1. Functional Process Flow (Quy trình chức năng)

### Admin Side (SalarySlipAdmin.jsx)

┌─────────────────────────────────────────────────────────────────────┐
│  Bước 1: Upload file Excel lương (cột: ID, NAME, Mức lương, ...)  │
│           + Upload file template DOCX (chứa {{NAME}}, {{ML}}, ...) │
├─────────────────────────────────────────────────────────────────────┤
│  Bước 2: Hệ thống render template với từng nhân viên               │
│           → docxtpl → docx2pdf → PyPDF2 (mã hóa PASSWORD)          │
├─────────────────────────────────────────────────────────────────────┤
│  Bước 3: Tự động upload PDF lên FTP (FTP2: 10.0.0.119/nhansu)     │
├─────────────────────────────────────────────────────────────────────┤
│  Bước 4: Import dữ liệu lương vào DB (salary_slips table)          │
│           - Map ID (Excel) → employee_code                          │
│           - Lưu basic_salary, allowances, deductions, net_salary    │
├─────────────────────────────────────────────────────────────────────┤
│  Bước 5: Nhân viên login → xem phiếu lương → tải PDF              │
└─────────────────────────────────────────────────────────────────────┘

### Employee Side (SalarySlip.jsx)

1. Login với mã nhân viên (employee_code) + mật khẩu
2. Chọn tháng cần xem (input type="month")
3. Ấn "Xem phiếu lương" → gọi GET /api/salary-slips/my
4. API kiểm tra:
   - Có record trong salary_slips table?
   - File PDF tồn tại trong salary_pdfs/{year}/{month}/{employee_code}.pdf?
5. Nếu OK → trả về PDF blob → hiển thị / tải về

---

## 2. System Architecture (Kiến trúc hệ thống)

### Backend (FastAPI - port 8080)

```
salary_slips.py
├── GET  /my                              → Employee xem PDF
├── POST /admin/import-from-excel         → Import dữ liệu từ Excel
├── POST /admin/generate-from-excel        → Generate PDF + Upload FTP
├── POST /admin/create                     → CRUD salary_slip record
├── POST /admin/upload-pdf                 → Upload PDF riêng lẻ
├── POST /admin/bulk-generate              → Tạo hàng loạt
│
├── POST /generator/init                   → (Generator step-by-step)
├── POST /generator/{jid}/upload-excel
├── POST /generator/{jid}/upload-template
├── POST /generator/{jid}/generate
├── GET  /generator/{jid}/status
├── GET  /generator/{jid}/download
├── POST /generator/nextcloud-upload
│
└── WebSocket /generator/{jid}/ws          → Real-time progress
```

### Frontend (React + Vite - port 5173)

```
SalarySlip.jsx          → Employee view (xem/tải PDF)
SalarySlipAdmin.jsx     → Admin generator (upload Excel + template)
useSalarySlip.js        → Hook: fetch PDF blob, download, state mgmt
```

### Database (SQLite - company.db)

```
salary_slips
├── employee_code (TEXT) → FK to employees.employee_code
├── month (TEXT)          → 'YYYY-MM'
├── basic_salary (REAL)
├── allowances (REAL)
├── bonus (REAL)
├── deductions (REAL)
├── net_salary (REAL)
└── UNIQUE(employee_code, month)
```

### PDF Storage

```
backend/salary_pdfs/
└── {year}/
    └── {month}/
        └── {employee_code}.pdf
```

---

## 3. Why PDF Can't Be Read on Mobile / Brave

### Technical Root Cause

| Issue | Explanation |
|-------|------------|
| **No built-in PDF viewer** | Brave, Firefox iOS, Samsung Browser không có PDF engine tích hợp như Chrome. `<object>` / `<iframe>` không render được. |
| **Blob URL restriction** | PDF được trả về dạng `Blob` → tạo `blob:` URL. Một số mobile browser không hỗ trợ điều hướng đến `blob:` URL trong iframe do CSP policy. |
| **Brave Shields** | Brave chặn inline PDF rendering mặc định vì lý do privacy (Shields: "Block fingerprints"). |
| **iOS limitation** | WKWebView (iOS) không hỗ trợ `PDF.js` hay plugin PDF built-in. Mọi PDF phải mở bằng app ngoài. |

### Current Solution (SalarySlip.jsx)

- **Desktop**: Dùng `<iframe>` với `#toolbar=1` → PDF viewer của Chrome/Edge
- **Mobile**: Phát hiện user-agent → hiển thị màn hình fallback:
  - Nút **"Tải PDF"** → download file
  - Nút **"Mở tab mới"** → `window.open(blobUrl, '_blank')` → trình duyệt mobile sẽ tải về hoặc mở bằng app ngoài

### Alternative Solutions (Not Implemented)

| Solution | Pros | Cons |
|----------|------|------|
| `react-pdf` (pdfjs) | Render PDF trực tiếp bằng canvas | Tăng bundle size, font rendering không chuẩn |
| Google Docs Viewer | `https://docs.google.com/viewer?url=...` | Cần public URL, không dùng được với blob |
| Serve PDF qua endpoint riêng | Dùng `/api/salary-slips/pdf/{code}/{month}` trả về file stream | Cần thêm endpoint, vẫn không fix được Brave mobile |

---

## 4. Excel Column Mapping

### Salary (pdf_type=salary)

| Excel Column | DB Field | Ghi chú |
|-------------|----------|---------|
| ID | employee_code | Mã đăng nhập, dùng để lookup |
| NAME | - | Tên hiển thị |
| Mức lương | basic_salary | Lương căn bản |
| Trợ cấp tiền ăn + ... + Lương tăng ca | allowances | Tổng các trợ cấp |
| BHXH, YT,TN (10.5%) + Thuế TNCN + Đoàn phí | deductions | Tổng khấu trừ |
| Thực nhận (A-B) | net_salary | Lương thực nhận |

### Bonus (pdf_type=bonus)

| Excel Column | DB Field |
|-------------|----------|
| ID | employee_code |
| Mức thu nhập tính thưởng | basic_salary |
| Tiền thưởng Tết | bonus |
| Tổng thuế TNCN | deductions |
| Thực nhận (A-B+C) | net_salary |

---

## 5. Troubleshooting

### PDF không hiển thị

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Chưa có phiếu lương" | DB chưa có record | Chạy `/admin/import-from-excel` |
| "File không tồn tại" | PDF chưa được copy vào storage | Chạy generator hoặc copy thủ công |
| Trắng xoá / không load | Brave mobile / iOS | Dùng nút "Mở tab mới" hoặc "Tải PDF" |
| 401 Unauthorized | Token hết hạn | Đăng nhập lại |

### Login không được

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Sai mã NV hoặc mật khẩu" | User chưa có trong users table | Import Excel → tự động tạo user với pass = ID |

---

## 6. Related Files

| File | Purpose |
|------|---------|
| `frontend/src/pages/SalarySlip.jsx` | Employee PDF viewer |
| `frontend/src/pages/SalarySlipAdmin.jsx` | Admin generator UI |
| `frontend/src/pages/SalarySlip.css` | Styles + responsive |
| `frontend/src/hooks/useSalarySlip.js` | PDF fetch + download logic |
| `frontend/src/styles/booking.css` | Shared UI classes |
| `backend/app/routers/salary_slips.py` | All API endpoints |
| `backend/app/utils/pdf_generator.py` | PDF rendering engine |
| `backend/app/utils/ftp_utils.py` | FTP upload |
| `backend/config/config.xml` | FTP credentials |
