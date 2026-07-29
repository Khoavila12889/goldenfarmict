# ⚠️ Trang trắng khi click vào file - Cần kiểm tra Browser Console

## Hiện tượng

Click vào file .xlsx → Trang trắng (không hiển thị gì)

## Nguyên nhân có thể

1. **JavaScript error** - Component crash
2. **CSS không load** - Modal render nhưng không thấy (z-index, position, opacity)
3. **Script không load** - OnlyOffice API không tải được
4. **React error boundary** - Component error nhưng không hiển thị

## QUAN TRỌNG: Kiểm tra Browser Console

### Bước 1: Mở DevTools

**Firefox:**
- Nhấn `F12`
- Hoặc Right Click > Inspect Element

**Chrome:**
- Nhấn `F12`
- Hoặc Right Click > Inspect

### Bước 2: Chọn tab Console

Tab **Console** (thường là tab đầu tiên bên trái)

### Bước 3: Clear logs cũ

Click nút **Clear** (icon thùng rác) để xóa logs cũ

### Bước 4: Click vào file .xlsx

Trong module Documents, click vào file .xlsx

### Bước 5: Xem có lỗi màu đỏ không?

**Screenshot toàn bộ console** và gửi cho tôi.

## Các lỗi thường gặp

### Lỗi 1: "Cannot read properties of undefined"

```
Uncaught TypeError: Cannot read properties of undefined (reading 'xyz')
    at OnlyOfficeViewer.jsx:123
```

**Nguyên nhân:** Component code có bug

**Cần:** Full error message và stack trace

### Lỗi 2: CORS Error

```
Cross-Origin Request Blocked: The Same Origin Policy disallows...
http://10.0.0.9:8080/web-apps/apps/api/documents/api.js
```

**Nguyên nhân:** OnlyOffice không cho phép cross-origin request

**Fix:** Thêm CORS headers trong OnlyOffice nginx config

### Lỗi 3: Failed to load resource

```
Failed to load resource: net::ERR_CONNECTION_REFUSED
http://10.0.0.9:8080/web-apps/apps/api/documents/api.js
```

**Nguyên nhân:** OnlyOffice container không chạy hoặc port bị block

**Fix:**
```powershell
docker ps | findstr onlyoffice
curl http://10.0.0.9:8080/healthcheck
```

### Lỗi 4: Mixed Content

```
Mixed Content: The page at 'https://...' was loaded over HTTPS, 
but requested an insecure resource 'http://10.0.0.9:8080/...'
```

**Nguyên nhân:** Trang dùng HTTPS nhưng OnlyOffice dùng HTTP

**Fix:** Allow mixed content trong browser settings

### Lỗi 5: Module not found

```
Failed to resolve module specifier "react"
```

**Nguyên nhân:** Build frontend bị lỗi

**Fix:**
```powershell
.\deploy.ps1 -BuildFrontend
```

## Kiểm tra Network Tab

### Bước 1: Chọn tab Network

Trong DevTools (F12), chọn tab **Network**

### Bước 2: Clear logs

Click nút Clear (icon X)

### Bước 3: Click vào file

Click vào file .xlsx trong Documents

### Bước 4: Xem các requests

Tìm các requests sau:

| URL Pattern | Expected Status | Notes |
|-------------|----------------|-------|
| `/api/documents/onlyoffice/config?...` | 200 OK | Backend config |
| `http://10.0.0.9:8080/web-apps/apps/api/documents/api.js` | 200 OK | OnlyOffice API script |
| `http://10.0.0.9:8080/web-apps/...` | 200 OK | OnlyOffice resources |

**Nếu có request nào màu đỏ (failed), click vào và xem:**
- Status code
- Response
- Headers
- Timing

**Screenshot network tab** và gửi cho tôi.

## Kiểm tra Elements Tab (DOM)

### Bước 1: Chọn tab Elements

Trong DevTools (F12), chọn tab **Elements** (hoặc Inspector)

### Bước 2: Tìm modal

Nhấn `Ctrl+F` trong Elements tab, search `oov-overlay`

**Nếu tìm thấy:**
→ Modal đã render nhưng không thấy (CSS issue)

**Nếu không tìm thấy:**
→ Component không mount (JavaScript issue)

### Bước 3: Nếu tìm thấy modal

Right click vào element `<div class="oov-overlay">` > Inspect

Xem các CSS properties:
- `display` phải là `flex` (không phải `none`)
- `opacity` phải là `1` (không phải `0`)
- `z-index` phải là `1000` hoặc cao hơn
- `position` phải là `fixed`

## Quick Tests

### Test 1: JavaScript console có hoạt động không?

Trong Console tab, gõ:
```javascript
console.log("Test")
```

Nhấn Enter. Phải hiển thị `Test`.

### Test 2: React có load không?

Trong Console tab, gõ:
```javascript
window.React
```

Nhấn Enter. Phải hiển thị object, không phải `undefined`.

### Test 3: OnlyOfficeViewer component có tồn tại không?

Trong Console tab, sau khi click vào file, gõ:
```javascript
document.querySelector('.oov-overlay')
```

**Nếu trả về `null`:**
→ Component không render

**Nếu trả về element:**
→ Component đã render, vấn đề là CSS

### Test 4: Có lỗi React không?

Xem console có dòng:
```
The above error occurred in the <OnlyOfficeViewer> component
```

**Nếu có:**
→ React error boundary đã catch error
→ Xem error message phía trên dòng này

## Workaround tạm thời

Nếu không debug được, tắt OnlyOffice và dùng download:

**File `.env`:**
```env
ONLYOFFICE_ENABLED=false
```

**Restart backend:**
```powershell
docker-compose restart backend
```

**Kết quả:** File sẽ có nút Download thay vì View

---

## 📸 GỬI CHO TÔI

1. **Screenshot browser console đầy đủ** (F12 > Console)
2. **Screenshot network tab** (F12 > Network, filter "onlyoffice")
3. **Text của error đầu tiên** (nếu có lỗi màu đỏ)

Với thông tin này tôi có thể debug chính xác!
