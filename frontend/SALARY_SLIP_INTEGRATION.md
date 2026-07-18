# Tài liệu tích hợp Module Phiếu Lương (Salary Slip)

## 📋 Tổng quan

Module Phiếu Lương cho phép nhân viên xem và tải xuống phiếu lương PDF của chính họ theo tháng.

## 🎯 Files đã tạo

### Frontend
```
frontend/src/
├── hooks/
│   └── useSalarySlip.js          # Custom hook quản lý logic phiếu lương
├── pages/
│   ├── SalarySlip.jsx            # Component chính hiển thị phiếu lương
│   └── SalarySlip.css            # Styles module phiếu lương
├── components/
│   └── Layout.jsx                # ✅ Đã cập nhật (thêm menu item)
├── services/
│   └── api.js                    # ✅ Đã cập nhật (thêm getSalarySlip)
└── App.jsx                       # ✅ Đã cập nhật (thêm route)
```

## 🔌 Backend API Endpoint Required

Backend cần implement endpoint sau:

### GET /api/salary-slips/my

**Mô tả**: Trả về file PDF phiếu lương của nhân viên hiện tại

**Authentication**: Lấy `employee_code` từ session token (đã có trong header request)

**Query Parameters**:
- `month` (required): Tháng cần xem, format `YYYY-MM` (ví dụ: `2024-12`)

**Response Success (200)**:
- Content-Type: `application/pdf`
- Body: PDF file stream/blob

**Response Error**:
- 404: Không tìm thấy phiếu lương
  ```json
  {
    "message": "Chưa có phiếu lương cho tháng này"
  }
  ```
- 401: Unauthorized (phiên hết hạn)
- 500: Server error

### Ví dụ implementation (FastAPI):

```python
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import FileResponse
import os

router = APIRouter()

@router.get("/api/salary-slips/my")
async def get_my_salary_slip(
    month: str = Query(..., description="Format: YYYY-MM"),
    employee_code: str = Depends(get_current_user)  # Từ auth middleware
):
    """
    Trả về file PDF phiếu lương của nhân viên
    """
    # Validate month format
    try:
        year, mon = month.split('-')
        if len(year) != 4 or len(mon) != 2:
            raise ValueError
    except:
        raise HTTPException(status_code=400, detail="Invalid month format")
    
    # Construct file path từ FTP storage
    # Ví dụ: /ftp/salary/2024/12/NV001.pdf
    file_path = f"/ftp/salary/{year}/{mon}/{employee_code}.pdf"
    
    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=404, 
            detail="Chưa có phiếu lương cho tháng này"
        )
    
    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=f"phieu-luong-{month}-{employee_code}.pdf"
    )
```

## 🎨 UI/UX Features

### Header Section
- **Tiêu đề**: "Phiếu Lương Cá Nhân" + hiển thị mã nhân viên
- **Bộ chọn tháng**: Input type="month" để chọn tháng/năm
- **Nút "Xem phiếu lương"**: Gọi API lấy PDF
- **Nút "Tải về"**: Download PDF (chỉ hiện khi đã load thành công)

### Content Area
Có 4 trạng thái:

1. **Initial State**: Hiển thị hướng dẫn chọn tháng
2. **Loading**: Spinner + "Đang tải dữ liệu..."
3. **Success**: Hiển thị PDF trong `<object>` tag (full-screen)
4. **Error**: 
   - 404: "Chưa có phiếu lương cho tháng này"
   - 401: "Phiên làm việc đã hết hạn"
   - Other: "Lỗi kết nối máy chủ"

### PDF Viewer
- Sử dụng HTML5 `<object>` tag (không cần thư viện ngoài)
- Fallback: Nếu browser không hỗ trợ → hiển thị nút tải xuống
- Auto cleanup: Revoke blob URL khi unmount để tránh memory leak

## 🔒 Security & Best Practices

### ✅ Đã tuân thủ
- ✅ **Rule D1**: Sử dụng kiến trúc hiện có (axios, routing, layout pattern)
- ✅ **Rule D6**: Lấy `employee_code` từ `sessionStorage` (không hard-code)
- ✅ **Rule D8**: Pure CSS + CSS Variables (không dùng Tailwind/inline styles)
- ✅ **Rule D9**: Code clean, không có import/component thừa

### Backend cần đảm bảo
- ⚠️ Validate `employee_code` từ token (không cho phép xem phiếu lương người khác)
- ⚠️ Sanitize input `month` parameter
- ⚠️ Check file permissions trước khi serve
- ⚠️ Log access để audit

## 📱 Responsive Design

- **Desktop**: Full-screen PDF viewer
- **Tablet**: Giữ nguyên layout, PDF có thể scroll
- **Mobile**: 
  - Header stack vertically
  - Controls full-width
  - Ưu tiên nút "Tải về" thay vì inline viewer

## 🧪 Testing Checklist

### Frontend
- [ ] Chọn tháng hiện tại → Load thành công
- [ ] Chọn tháng chưa có dữ liệu → Hiển thị error 404
- [ ] Click "Tải về" → Download file PDF
- [ ] Logout → Login lại → Module vẫn hoạt động
- [ ] Responsive: Test trên mobile/tablet
- [ ] Memory leak: Chuyển trang nhiều lần → Không tăng RAM

### Backend
- [ ] API trả về PDF cho tháng hợp lệ
- [ ] API trả về 404 cho tháng không có data
- [ ] User A không thể xem phiếu lương của User B
- [ ] Invalid month format → Return 400
- [ ] Expired token → Return 401

## 🚀 Deploy

### Frontend
Không cần thay đổi build config, module đã tích hợp vào routing sẵn.

### Backend
1. Tạo endpoint `/api/salary-slips/my` theo spec trên
2. Cấu hình path đến FTP storage chứa PDF files
3. Đảm bảo auth middleware check token và extract `employee_code`
4. Test với curl:
   ```bash
   curl -H "Authorization: Bearer <token>" \
        "http://localhost:8080/api/salary-slips/my?month=2024-12"
   ```

## 📞 Support

Nếu có vấn đề:
1. Check browser console (F12) → Network tab
2. Verify API endpoint đang hoạt động
3. Kiểm tra format tháng: phải là `YYYY-MM`
4. Đảm bảo file PDF tồn tại trên server

---

**Created**: 2024
**Module**: Salary Slip Management
**Framework**: React 19 + Vite 6 + FastAPI
