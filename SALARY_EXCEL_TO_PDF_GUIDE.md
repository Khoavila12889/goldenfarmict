# 📋 Hướng dẫn Tạo Phiếu Lương từ Excel (Di chuyển từ web_simple)

## 🎯 Tổng quan

Module này di chuyển **100% logic** tạo phiếu lương từ project `web_simple` sang `goldenfarm-ict-web`, cho phép:
- ✅ Upload Excel + Template DOCX
- ✅ Generate PDF hàng loạt với mã hóa password
- ✅ Tự động lưu vào database + storage
- ✅ Download ZIP file chứa tất cả PDF
- ✅ Real-time progress tracking

---

## 🚀 Các tính năng đã tích hợp

### 1. **Tạo phiếu lương từ Excel** (Mới)
- Upload file Excel chứa dữ liệu lương toàn công ty
- Upload file Template DOCX với placeholders
- Hệ thống tự động:
  - Đọc từng dòng Excel
  - Thay thế placeholders trong template
  - Convert DOCX → PDF
  - Encrypt PDF bằng password (từ cột PASSWORD trong Excel)
  - Lưu vào database
  - Copy vào storage folder

### 2. **Tạo thủ công** (Đã có)
- Form nhập liệu cho 1 nhân viên
- Tạo hàng loạt với giá trị mặc định

### 3. **Upload PDF riêng lẻ** (Đã có)
- Upload PDF đã tạo sẵn cho nhân viên cụ thể

---

## 📂 Files đã di chuyển từ web_simple

```
web_simple → goldenfarm-ict-web

✅ services/excel_service.py       → app/utils/pdf_generator.py (tích hợp)
✅ services/pdf_service.py          → app/utils/pdf_generator.py (tích hợp)
✅ utils/format_utils.py            → app/utils/pdf_generator.py (inline functions)
✅ app.py (logic generate)          → app/routers/salary_slips.py (endpoints mới)
```

**Logic copy 100%:**
- ✅ `create_salary_context()` - Tạo context cho phiếu lương
- ✅ `create_bonus_context()` - Tạo context cho phiếu thưởng
- ✅ `format_days()`, `format_date()`, `format_value()` - Format dữ liệu
- ✅ PDF generation với docxtpl + docx2pdf
- ✅ Password encryption với PyPDF2

---

## 📋 Format Excel Input

### Phiếu lương (salary)

Các cột bắt buộc trong file Excel:

| Column | Mô tả | Ví dụ |
|--------|-------|-------|
| `NAME` | Tên nhân viên | Nguyễn Văn A |
| `ID` | Mã nhân viên | NV001 |
| `PASSWORD` | Mật khẩu PDF | 123456 |
| `Chức vụ` | Chức vụ | Nhân viên |
| `Phòng Ban` | Phòng ban | IT |
| `Ngày vào làm` | Ngày vào làm | 01/01/2020 |
| `Mức lương` | Lương cơ bản | 15000000 |
| `Mức trợ cấp tiền ăn` | Phụ cấp ăn | 800000 |
| `Mức trợ cấp tiền điện thoại` | Phụ cấp ĐT | 200000 |
| `Mức trợ cấp xăng xe` | Phụ cấp xe | 500000 |
| `Mức hiệu quả tuân thủ` | Hiệu quả | 1000000 |
| `Ngày công chuẩn trong tháng` | Ngày công | 26 |
| `Ngày công hưởng lương` | Ngày làm | 24.5 |
| `Tiền lương` | Lương thực tế | 14000000 |
| `Trợ cấp tiền ăn` | TC ăn | 700000 |
| `BHXH, YT,TN (10.5%)` | BHXH | 1500000 |
| `Thực nhận (A-B)` | Thực lĩnh | 17500000 |
| `Thuế TNCN` | Thuế | 800000 |
| ... | Xem file Excel mẫu | |

**⚠️ Lưu ý:** Tên cột phải khớp chính xác với template!

### Phiếu thưởng (bonus)

| Column | Mô tả |
|--------|-------|
| `NAME`, `ID`, `PASSWORD` | Như trên |
| `Phòng ban` | Phòng ban |
| `Mức thu nhập tính thưởng` | Thu nhập |
| `Tổng thu nhập tháng` | Tổng thu nhập |
| `Số tháng tính thưởng` | Số tháng |
| `Tiền thưởng Tết` | Thưởng |
| `Thuế thu TNCN khấu trừ` | Thuế |
| `Thực nhận (A-B+C)` | Thực lĩnh |

---

## 📝 Format Template DOCX

Template Word sử dụng **jinja2 syntax** với placeholders:

```
Phiếu lương tháng {{ MONTH }}/{{ YEAR }}

Họ tên: {{ NAME }}
Mã NV: {{ ID }}
Chức vụ: {{ CHUCVU }}
Phòng ban: {{ PB }}

Lương cơ bản: {{ ML }} VNĐ
Phụ cấp ăn: {{ TCTA }} VNĐ
Phụ cấp điện thoại: {{ TCDT }} VNĐ

...

Thực lĩnh: {{ TN }} VNĐ
```

**Placeholders có sẵn:**
- `{{ NAME }}`, `{{ ID }}`, `{{ CHUCVU }}`, `{{ PB }}`
- `{{ ML }}`, `{{ TL }}`, `{{ TCTA }}`, `{{ TCDT }}`, `{{ TCXX }}`
- `{{ HQTT }}`, `{{ LTC }}`, `{{ BHXH }}`, `{{ TN }}`
- `{{ MONTH }}`, `{{ YEAR }}`, `{{ DAY }}`
- Xem `create_salary_context()` trong `pdf_generator.py` để biết full list

---

## 🎬 Workflow Sử Dụng

### Bước 1: Chuẩn bị Files

1. **Excel File**: Xuất dữ liệu lương từ hệ thống kế toán
2. **Template DOCX**: Thiết kế template với placeholders

### Bước 2: Upload và Generate

1. Login vào hệ thống với tài khoản **admin**
2. Vào trang **"Quản lý lương"**
3. Click nút **"Tạo từ Excel"**
4. Chọn:
   - Loại phiếu: `Phiếu lương (Salary)` hoặc `Phiếu thưởng (Bonus)`
   - File Excel: `luong_thang_12_2024.xlsx`
   - File Template: `template_phieu_luong.docx`
5. Click **"Tạo phiếu lương"**

### Bước 3: Theo dõi Tiến trình

- Hệ thống hiển thị progress bar real-time
- Thông báo: "Đã tạo: Nguyễn Văn A"
- Progress: "25 / 50 nhân viên"

### Bước 4: Kết quả

Khi hoàn tất:
- ✅ **Database**: Bản ghi phiếu lương cho từng nhân viên
- ✅ **Storage**: PDF files tại `backend/salary_pdfs/{year}/{month}/{employee_code}.pdf`
- ✅ **ZIP Download**: File ZIP chứa tất cả PDF để tải về

### Bước 5: Nhân viên Xem

1. Nhân viên login vào hệ thống
2. Vào trang **"Phiếu lương"**
3. Chọn tháng → **"Xem phiếu lương"**
4. Nhập password (từ Excel) nếu PDF có mã hóa
5. Xem/download PDF

---

## 🔌 API Endpoints

### 1. Generate PDFs from Excel

```http
POST /api/salary-slips/admin/generate-from-excel
Content-Type: multipart/form-data

Form Data:
  excel_file: File
  template_file: File
  pdf_type: "salary" | "bonus"
  admin_code: string
  token: string
  role: "admin"

Response:
{
  "success": true,
  "job_id": "uuid",
  "message": "Đang xử lý..."
}
```

### 2. Check Generation Status

```http
GET /api/salary-slips/admin/pdf-status/{job_id}
Params: admin_code, token, role

Response:
{
  "status": "processing" | "completed" | "failed",
  "progress": 75,
  "message": "Đã tạo: Nguyễn Văn A",
  "completed": 38,
  "total": 50,
  "total_files": 50,
  "saved_to_db": 50,
  "errors": []
}
```

### 3. Download ZIP

```http
GET /api/salary-slips/admin/pdf-download/{job_id}
Params: admin_code, token, role

Response: ZIP file binary
```

### 4. Cleanup Job

```http
DELETE /api/salary-slips/admin/pdf-cleanup/{job_id}
Params: admin_code, token, role

Response:
{
  "success": true,
  "message": "Job cleaned up successfully"
}
```

---

## 🛠️ Cài đặt Dependencies

```bash
cd backend
pip install -r requirements.txt
```

**Packages mới:**
- `docxtpl>=0.16.7` - Template engine cho DOCX
- `docx2pdf>=0.1.8` - Convert DOCX to PDF
- `PyPDF2>=3.0.0` - PDF encryption
- `python-multipart>=0.0.6` - File upload support

**⚠️ Windows:** docx2pdf cần Microsoft Word installed  
**⚠️ Linux:** cài `libreoffice`:
```bash
sudo apt-get install libreoffice
```

---

## 📊 Ví dụ Thực tế

### Scenario: Tạo phiếu lương tháng 12/2024 cho 50 nhân viên

**Input:**
- `luong_thang_12_2024.xlsx` - 50 rows
- `template_phieu_luong.docx` - Template chuẩn công ty

**Process:**
1. Admin upload 2 files
2. Hệ thống xử lý: ~2-3 phút (50 PDFs)
3. Progress: 0% → 100%

**Output:**
```
backend/salary_pdfs/
└── 2024/
    └── 12/
        ├── NV001.pdf (encrypted with password)
        ├── NV002.pdf (encrypted with password)
        ├── ...
        └── NV050.pdf (encrypted with password)

Downloads/
└── phieu_luong_{job_id}.zip
    ├── Nguyễn Văn A/
    │   └── Lương_T12_2024_Nguyễn Văn A.pdf
    ├── Trần Thị B/
    │   └── Lương_T12_2024_Trần Thị B.pdf
    └── ...
```

**Database:**
```sql
SELECT * FROM salary_slips WHERE month='2024-12';
-- 50 rows inserted
```

---

## 🐛 Troubleshooting

### ❌ "docx2pdf not working"

**Windows:**
```
Cần cài Microsoft Word
```

**Linux:**
```bash
sudo apt-get install libreoffice
```

---

### ❌ "Column 'NAME' not found in Excel"

**Nguyên nhân:** Tên cột trong Excel không khớp với code

**Giải pháp:**
1. Kiểm tra file Excel có cột `NAME` (chính xác, không dấu cách thừa)
2. Hoặc sửa code `create_salary_context()` để match tên cột thực tế

---

### ❌ "Template placeholder not replaced"

**Nguyên nhân:** Placeholder trong DOCX không đúng format

**Giải pháp:**
- Dùng `{{ NAME }}` không phải `{NAME}` hay `<<NAME>>`
- Không có khoảng trắng: `{{NAME}}` ❌, `{{ NAME }}` ✅

---

### ❌ "PDF generation timeout"

**Nguyên nhân:** File Excel quá lớn (> 100 rows)

**Giải pháp:**
- Tách file Excel thành nhiều batch nhỏ hơn
- Hoặc tăng timeout trong `pollGenerationStatus()` (frontend)

---

### ❌ "Password encryption failed"

**Nguyên nhân:** Cột PASSWORD trong Excel chứa giá trị null/empty

**Giải pháp:**
- Ensure tất cả rows có PASSWORD value
- Hoặc skip encryption nếu password is null (đã handle trong code)

---

## 📝 Checklist Kiểm tra

### Trước khi upload:
- [ ] File Excel có đầy đủ columns theo format
- [ ] Cột `NAME` và `ID` không trống
- [ ] Cột `PASSWORD` có giá trị hợp lệ (nếu cần mã hóa)
- [ ] Template DOCX có placeholders đúng format `{{ }}`
- [ ] Template được test với 1-2 rows trước

### Sau khi generate:
- [ ] Kiểm tra database: `SELECT * FROM salary_slips WHERE month='2024-12'`
- [ ] Kiểm tra storage: `backend/salary_pdfs/2024/12/` có PDF files
- [ ] Test user xem phiếu lương (login as NV001, xem tháng 12)
- [ ] Test download ZIP file
- [ ] Test password PDF (mở PDF bằng password từ Excel)

---

## 🎉 Tổng kết

✅ **Đã hoàn thành:**
- Di chuyển 100% logic tạo phiếu lương từ web_simple
- Tích hợp vào goldenfarm-ict-web (backend + frontend)
- Real-time progress tracking
- Automatic database + storage sync
- ZIP download
- Password encryption

🚀 **Sẵn sàng sử dụng!**

---

**Documentation**: December 2024  
**Migrated from**: `web_simple` project  
**Integration**: `goldenfarm-ict-web`
