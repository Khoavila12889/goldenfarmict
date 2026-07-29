# Debug OnlyOffice - Trang trắng

Backend trả về HTTP 200 OK, CSS đã có, nhưng trang vẫn trắng.

## Bước 1: Mở Browser Console

**Firefox:**
1. Nhấn `F12`
2. Chọn tab **Console** (tab đầu tiên)
3. Click vào file .pdf/.docx trong module Tài liệu
4. Xem console có lỗi màu đỏ không

## Bước 2: Chụp màn hình Console

Gửi screenshot console để tôi xem lỗi chính xác.

## Các lỗi có thể xảy ra:

### 1. CORS Error
```
Cross-Origin Request Blocked: The Same Origin Policy disallows reading 
the remote resource at https://office.goldenfarm.vn/...
```

**Fix:** Thêm CORS headers trong NPM (Nginx Proxy Manager):
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
```

### 2. Network Error
```
Failed to load resource: net::ERR_NAME_NOT_RESOLVED
https://office.goldenfarm.vn/web-apps/apps/api/documents/api.js
```

**Fix:** Thêm vào `C:\Windows\System32\drivers\etc\hosts`:
```
10.0.0.119  office.goldenfarm.vn
```

### 3. SSL Error
```
NET::ERR_CERT_AUTHORITY_INVALID
```

**Fix:** Click "Advanced" > "Proceed to office.goldenfarm.vn (unsafe)"

### 4. JavaScript Error
```
Uncaught TypeError: ...
```

**Fix:** Rebuild frontend lại một lần nữa

## Bước 3: Test trực tiếp OnlyOffice

Mở browser, truy cập:
```
https://office.goldenfarm.vn/web-apps/apps/api/documents/api.js
```

- Nếu hiển thị JavaScript code → OnlyOffice OK
- Nếu lỗi 404 / 502 → OnlyOffice server có vấn đề
- Nếu SSL warning → Accept certificate

## Bước 4: Kiểm tra Network Tab

1. Mở DevTools (F12)
2. Chọn tab **Network**
3. Click vào file để mở OnlyOffice
4. Xem các request:
   - `/api/documents/onlyoffice/config` → Status 200?
   - `https://office.goldenfarm.vn/web-apps/...` → Status 200?
5. Chụp màn hình Network tab

## Workaround tạm thời

Nếu cần xem file ngay, tắt OnlyOffice:

**File `.env`:**
```env
ONLYOFFICE_ENABLED=false
```

**Restart backend:**
```powershell
docker-compose restart backend
```

File sẽ có nút Download thay vì xem trực tiếp.

---

**Hãy gửi screenshot Console và Network tab để tôi debug chính xác!**
