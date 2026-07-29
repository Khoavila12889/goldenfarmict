# Debug OnlyOffice - Trang trắng khi mở file

## Vấn đề hiện tại
Khi click vào file .docx/.xlsx/.pdf trong module Tài liệu, trang hiển thị trắng.

## Bước 1: Kiểm tra Browser Console

**Mở Browser Console:**
- Nhấn `F12` hoặc `Right Click > Inspect`
- Chọn tab **Console**
- Click vào file .docx/.xlsx/.pdf
- Xem có lỗi gì xuất hiện không (màu đỏ)

### Các lỗi thường gặp:

#### 1. **CORS Error**
```
Access to script at 'https://office.goldenfarm.vn/web-apps/apps/api/documents/api.js' 
from origin 'http://10.0.0.9:8088' has been blocked by CORS policy
```

**Nguyên nhân:** OnlyOffice server không cho phép domain `10.0.0.9:8088` truy cập

**Giải pháp:**
- Thêm `Access-Control-Allow-Origin: *` trong OnlyOffice server config
- Hoặc config NPM (Nginx Proxy Manager) để thêm CORS headers

#### 2. **Network Error - Failed to load script**
```
GET https://office.goldenfarm.vn/web-apps/apps/api/documents/api.js net::ERR_NAME_NOT_RESOLVED
```

**Nguyên nhân:** Domain `office.goldenfarm.vn` không thể resolve từ máy client

**Giải pháp:**
- Kiểm tra DNS: `nslookup office.goldenfarm.vn` từ máy client
- Nếu không có DNS, thêm vào `C:\Windows\System32\drivers\etc\hosts`:
  ```
  10.0.0.119  office.goldenfarm.vn
  ```

#### 3. **SSL Certificate Error**
```
NET::ERR_CERT_AUTHORITY_INVALID
```

**Nguyên nhân:** Let's Encrypt certificate chưa hợp lệ

**Giải pháp:**
- Click "Advanced" > "Proceed to office.goldenfarm.vn" để accept certificate
- Hoặc thêm certificate vào trusted root

#### 4. **JWT Error**
```
Error: JWT verification failed
```

**Nguyên nhân:** JWT secret không khớp giữa backend và OnlyOffice server

**Giải pháp:**
- Kiểm tra JWT secret trong OnlyOffice server
- Update `ONLYOFFICE_SECRET` trong `.env`
- Restart backend: `docker-compose restart backend`

#### 5. **React Error**
```
Uncaught TypeError: Cannot read properties of undefined
```

**Nguyên nhân:** Lỗi JavaScript trong component

**Giải pháp:**
- Rebuild frontend: 
  ```powershell
  docker-compose down frontend
  docker-compose up -d --build frontend
  ```

## Bước 2: Kiểm tra Network Tab

**Trong Browser DevTools:**
- Chọn tab **Network**
- Click vào file để mở OnlyOffice
- Xem các request:

### Request cần kiểm tra:

1. **GET /api/documents/onlyoffice/config?config_id=...**
   - Status phải là **200 OK**
   - Response phải có `_docsApiUrl`, `document.url`, `editorConfig.callbackUrl`

2. **GET https://office.goldenfarm.vn/web-apps/apps/api/documents/api.js**
   - Status phải là **200 OK**
   - Content-Type: `application/javascript`
   - Nếu fail, kiểm tra OnlyOffice server

3. **GET http://10.0.0.9:8088/api/documents/onlyoffice/download?token=...**
   - Status phải là **200 OK**
   - OnlyOffice server gọi để download file
   - Nếu fail, kiểm tra `BACKEND_PUBLIC_URL` trong `.env`

## Bước 3: Kiểm tra frontend đã rebuild chưa

Frontend cần rebuild để áp dụng debug logs mới trong `OnlyOfficeViewer.jsx`.

**Rebuild frontend:**
```powershell
cd e:\goldenfarmict
docker-compose down frontend
docker-compose up -d --build frontend
```

Đợi 2-3 phút để build xong, sau đó test lại.

## Bước 4: Test với file đơn giản

Tạo file test.docx đơn giản (vài KB) để test, tránh file lớn gây timeout.

## Bước 5: Kiểm tra OnlyOffice server

**Test OnlyOffice server từ máy client:**

1. Mở trình duyệt, vào: `https://office.goldenfarm.vn`
   - Phải hiển thị OnlyOffice welcome page
   - Nếu không, kiểm tra NPM proxy config

2. Test healthcheck: `https://office.goldenfarm.vn/healthcheck`
   - Phải trả về `true`

3. Test API script: `https://office.goldenfarm.vn/web-apps/apps/api/documents/api.js`
   - Phải tải về file JavaScript
   - Nếu 404, OnlyOffice chưa cài đúng

## Bước 6: Kiểm tra logs

**Backend logs:**
```powershell
docker logs goldenfarm-backend --tail 50
```

Tìm dòng:
```
INFO: 172.18.0.4:xxxxx - "GET /api/documents/onlyoffice/config?..." 200 OK
```

Nếu không có dòng này hoặc status khác 200, có vấn đề với backend.

**Frontend logs:**
```powershell
docker logs goldenfarm-frontend --tail 50
```

Tìm lỗi nginx hoặc 404 errors.

## Bước 7: Workaround - Tắt OnlyOffice tạm thời

Nếu cần tải file khẩn cấp mà OnlyOffice chưa hoạt động:

```env
ONLYOFFICE_ENABLED=false
```

Restart backend:
```powershell
docker-compose restart backend
```

File sẽ chỉ có nút Download, không xem trực tiếp.

---

## Checklist tổng hợp

- [ ] Browser console không có lỗi đỏ
- [ ] Network tab: `/api/documents/onlyoffice/config` trả về 200
- [ ] Network tab: `https://office.goldenfarm.vn/web-apps/apps/api/documents/api.js` trả về 200
- [ ] Domain `office.goldenfarm.vn` resolve được từ máy client
- [ ] OnlyOffice server accessible: `https://office.goldenfarm.vn/healthcheck` = true
- [ ] JWT secret khớp giữa backend và OnlyOffice server
- [ ] Frontend đã rebuild: `docker-compose up -d --build frontend`
- [ ] Backend có biến env: `docker exec goldenfarm-backend env | grep ONLYOFFICE`

---

## Liên hệ hỗ trợ

Nếu vẫn lỗi, gửi cho tôi:
1. Screenshot browser console (tab Console)
2. Screenshot network tab (tab Network, filter "onlyoffice")
3. Output của: `docker logs goldenfarm-backend --tail 50`
4. Test URL: `https://office.goldenfarm.vn/healthcheck` từ browser
