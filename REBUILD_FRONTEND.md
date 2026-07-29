# Rebuild Frontend để áp dụng OnlyOffice Viewer

## Vấn đề

Frontend chưa được rebuild với:
- OnlyOffice viewer CSS (`.oov-overlay`, `.oov-container`, etc.)
- Debug console.log statements
- Updated components

## Giải pháp: Rebuild frontend

### Cách 1: Rebuild qua Docker Desktop (Khuyến nghị)

1. Mở **Docker Desktop**
2. Vào **Containers** tab
3. Tìm container `goldenfarm-frontend`
4. Click **...** (3 dots) > **Stop**
5. Đợi container stop
6. Click **...** > **Delete**
7. Mở terminal trong Docker Desktop hoặc PowerShell
8. Chạy lệnh:

```powershell
cd e:\goldenfarmict
docker-compose up -d --build frontend
```

9. Đợi 2-3 phút để build xong (sẽ thấy các dòng "Building frontend...")

### Cách 2: Rebuild qua PowerShell

```powershell
cd e:\goldenfarmict

# Stop và xóa container cũ
docker stop goldenfarm-frontend
docker rm goldenfarm-frontend

# Rebuild image
docker-compose build frontend

# Start container mới
docker-compose up -d frontend
```

### Cách 3: Rebuild toàn bộ (nếu cần)

```powershell
cd e:\goldenfarmict
docker-compose down
docker-compose up -d --build
```

**Lưu ý:** Cách này sẽ restart tất cả services (DB, Backend, Frontend, OnlyOffice)

## Kiểm tra build đã xong chưa

```powershell
docker logs goldenfarm-frontend --tail 20
```

**Kết quả mong đợi:**
```
/docker-entrypoint.sh: Configuration complete; ready for start up
nginx/1.31.3
start worker processes
```

## Test sau khi rebuild

1. Mở browser, reload trang (Ctrl+Shift+R để force reload)
2. Vào `http://10.0.0.9:8088/documents`
3. Click vào file `.docx` hoặc `.xlsx`
4. Mở Browser Console (F12 > Console)
5. Xem có logs bắt đầu bằng `[OnlyOffice]` không

**Logs mong đợi:**
```
[OnlyOffice] Fetching config: {...}
[OnlyOffice] Config received: {...}
[OnlyOffice] DocsAPI URL: http://10.0.0.9:8080/web-apps/apps/api/documents/api.js
[OnlyOffice] DocsAPI script loaded successfully
[OnlyOffice] Initializing editor with config: {...}
[OnlyOffice] Editor initialized successfully
```

## Nếu vẫn không hiển thị

### Kiểm tra 1: CSS đã được build chưa?

```powershell
docker exec goldenfarm-frontend sh -c 'cat /usr/share/nginx/html/assets/*.css | grep -o "oov-overlay" | head -1'
```

**Kết quả mong đợi:** `oov-overlay`

### Kiểm tra 2: Xem browser console có lỗi không?

Nhấn F12 > Console tab, xem có lỗi màu đỏ không.

**Các lỗi thường gặp:**

#### Lỗi: "Failed to load resource: net::ERR_CONNECTION_REFUSED"
```
http://10.0.0.9:8080/web-apps/apps/api/documents/api.js
```

**Fix:** OnlyOffice container chưa chạy hoặc port 8080 bị block

```powershell
docker ps | findstr onlyoffice
curl http://10.0.0.9:8080/healthcheck
```

#### Lỗi: "Uncaught TypeError: Cannot read properties of undefined"

**Fix:** JavaScript error trong component. Xem full error message và stack trace.

#### Lỗi: "Mixed Content: The page at ... was loaded over HTTPS, but requested an insecure resource"

**Fix:** Trang đang dùng HTTPS nhưng OnlyOffice dùng HTTP. 

**Giải pháp tạm thời:** Vào browser settings cho phép Mixed Content cho domain `10.0.0.9`

### Kiểm tra 3: Network tab có request fail không?

Nhấn F12 > Network tab > Click vào file > Xem các requests:

| URL | Status | Fix nếu fail |
|-----|--------|--------------|
| `/api/documents/onlyoffice/config?...` | 200 | Restart backend |
| `http://10.0.0.9:8080/web-apps/apps/api/documents/api.js` | 200 | Restart OnlyOffice |
| `http://10.0.0.9:8080/...` (các file khác) | 200 | Restart OnlyOffice |

## Nếu vẫn lỗi sau khi rebuild

Gửi cho tôi:
1. Screenshot browser console (F12 > Console)
2. Screenshot network tab (F12 > Network, filter "onlyoffice")
3. Output của: `docker logs goldenfarm-frontend --tail 30`
4. Output của: `docker logs goldenfarm-onlyoffice --tail 30`

## Workaround: Tắt OnlyOffice tạm thời

Nếu cần tải file ngay mà OnlyOffice chưa hoạt động:

File `.env`:
```env
ONLYOFFICE_ENABLED=false
```

Restart backend:
```powershell
docker-compose restart backend
```

File sẽ chỉ có nút Download thay vì View.
