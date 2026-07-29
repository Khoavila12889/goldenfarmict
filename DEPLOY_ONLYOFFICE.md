# Deploy OnlyOffice Document Server trong Docker Compose

## Tổng quan

OnlyOffice Document Server đã được tích hợp sẵn trong `docker-compose.yml`. Không cần cài đặt server riêng nữa!

## Cấu trúc

```
┌─────────────────────────────────────────────────────────┐
│  Browser (10.0.0.9:8088)                                │
│  ↓ Load JS từ http://10.0.0.9:8080                     │
├─────────────────────────────────────────────────────────┤
│  Frontend Container (nginx)                              │
│  ↓ API calls                                            │
├─────────────────────────────────────────────────────────┤
│  Backend Container (FastAPI)                             │
│  ↓ Connect to http://onlyoffice:80 (internal network)  │
├─────────────────────────────────────────────────────────┤
│  OnlyOffice Container (Document Server)                 │
│  - Exposed: 8080 → 80                                   │
│  - Callback to http://10.0.0.9:8088 (download files)   │
└─────────────────────────────────────────────────────────┘
```

## Bước 1: Start OnlyOffice container

```powershell
cd e:\goldenfarmict
docker-compose up -d onlyoffice
```

**Đợi 2-3 phút** để OnlyOffice khởi động (container rất nặng, ~1.5GB).

## Bước 2: Kiểm tra OnlyOffice đã chạy chưa

```powershell
docker logs goldenfarm-onlyoffice --tail 50
```

**Tìm dòng:**
```
INFO Docs: onlyoffice-documentserver:latest
```

**Hoặc kiểm tra healthcheck:**
```powershell
docker ps | findstr onlyoffice
```

Phải thấy status: `healthy`

## Bước 3: Test OnlyOffice từ browser

Mở browser, vào:
```
http://10.0.0.9:8080/healthcheck
```

**Kết quả:** Phải hiển thị `true`

## Bước 4: Restart backend để áp dụng config mới

```powershell
docker stop goldenfarm-backend
docker rm goldenfarm-backend
docker-compose up -d backend
```

**Đợi 5 giây** backend start xong.

## Bước 5: Test OnlyOffice trong app

1. Mở `http://10.0.0.9:8088/documents`
2. Click vào file `.docx`, `.xlsx`, hoặc `.pdf`
3. OnlyOffice viewer sẽ mở file

## Kiểm tra logs

**Backend logs:**
```powershell
docker logs goldenfarm-backend --tail 30
```

**OnlyOffice logs:**
```powershell
docker logs goldenfarm-onlyoffice --tail 30
```

**Frontend logs:**
```powershell
docker logs goldenfarm-frontend --tail 30
```

## Troubleshooting

### Lỗi: OnlyOffice container không start

**Nguyên nhân:** Không đủ RAM (cần tối thiểu 4GB)

**Kiểm tra:**
```powershell
docker stats goldenfarm-onlyoffice
```

**Giải pháp:**
- Tăng RAM cho Docker Desktop (Settings > Resources > Memory)
- Hoặc tắt OnlyOffice nếu không cần:
  ```env
  ONLYOFFICE_ENABLED=false
  ```

### Lỗi: "Không thể tải ONLYOFFICE API từ máy chủ"

**Nguyên nhân:** OnlyOffice chưa start xong hoặc healthcheck fail

**Kiểm tra:**
```powershell
docker ps | findstr onlyoffice
```

Nếu status là `starting` hoặc `unhealthy`, đợi thêm 1-2 phút.

**Test healthcheck:**
```powershell
curl http://10.0.0.9:8080/healthcheck
```

Phải trả về `true`.

### Lỗi: "JWT verification failed"

**Nguyên nhân:** JWT secret không khớp giữa backend và OnlyOffice

**Kiểm tra:**
```powershell
docker exec goldenfarm-backend bash -c 'echo $ONLYOFFICE_SECRET'
docker exec goldenfarm-onlyoffice bash -c 'echo $JWT_SECRET'
```

Phải giống nhau: `MySuperSecret123456`

**Fix:** Đảm bảo `JWT_SECRET` trong `docker-compose.yml` khớp với `ONLYOFFICE_SECRET` trong `.env`.

### Lỗi: File không load được

**Nguyên nhân:** OnlyOffice server không thể callback về backend để download file

**Kiểm tra:** Xem logs OnlyOffice:
```powershell
docker logs goldenfarm-onlyoffice | Select-String "error\|Error\|ERROR"
```

**Fix:** Đảm bảo `BACKEND_PUBLIC_URL=http://10.0.0.9:8088` đúng và OnlyOffice container có thể truy cập được.

## Cấu hình nâng cao

### Thay đổi JWT Secret

**File `docker-compose.yml`:**
```yaml
environment:
  - JWT_SECRET=YourNewSecretKey123456789
```

**File `.env`:**
```env
ONLYOFFICE_SECRET=YourNewSecretKey123456789
```

**Restart:**
```powershell
docker-compose restart onlyoffice backend
```

### Expose OnlyOffice ra public

Nếu muốn OnlyOffice accessible từ mạng ngoài:

**File `docker-compose.yml`:**
```yaml
ports:
  - "0.0.0.0:8080:80"
```

**Hoặc dùng NPM (Nginx Proxy Manager) để proxy:**
```
Proxy Host: office.goldenfarm.vn
Forward to: goldenfarm-onlyoffice:80
```

## Tắt OnlyOffice

Nếu không cần OnlyOffice nữa:

**Tắt container:**
```powershell
docker-compose stop onlyoffice
```

**Xóa container và data:**
```powershell
docker-compose down onlyoffice
docker volume rm goldenfarmict_onlyoffice-data
docker volume rm goldenfarmict_onlyoffice-logs
```

**Tắt trong app:**
```env
ONLYOFFICE_ENABLED=false
```

```powershell
docker-compose restart backend
```

## Tổng kết

✅ OnlyOffice đã được tích hợp sẵn trong Docker Compose
✅ Không cần server riêng `10.0.0.119` nữa
✅ Tự động khởi động cùng app
✅ Dễ dàng backup/restore (chỉ cần backup volumes)

**Port mapping:**
- `8088` → Frontend (nginx)
- `8000` → Backend (FastAPI)
- `8080` → OnlyOffice (Document Server)
- `5432` → PostgreSQL

**Chạy lệnh sau để start tất cả:**
```powershell
cd e:\goldenfarmict
docker-compose up -d
```
