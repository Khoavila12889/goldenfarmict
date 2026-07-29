# ✅ OnlyOffice Document Server - Đã Hoàn Thành!

## Tổng quan

OnlyOffice Document Server đã được tích hợp hoàn chỉnh vào GoldenFarm ICT.

## Cấu trúc hệ thống

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Client)                                            │
│  - Truy cập: http://10.0.0.9:8088                          │
│  - Load OnlyOffice JS: http://10.0.0.9:8080                │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────┴────────────────────────────────────────────┐
│  Docker Network: goldenfarm-network                          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Frontend (Nginx)                                     │  │
│  │  - Port: 8088 → 80                                    │  │
│  │  - Proxy /api/ → backend:8000                        │  │
│  └──────────────┬───────────────────────────────────────┘  │
│                 │                                            │
│  ┌──────────────┴───────────────────────────────────────┐  │
│  │  Backend (FastAPI)                                    │  │
│  │  - Port: 8000                                         │  │
│  │  - Connect to: onlyoffice:80                         │  │
│  │  - Provide download URL: http://backend:8000/...    │  │
│  └──────────────┬────────────┬──────────────────────────┘  │
│                 │            │                              │
│  ┌──────────────┴─┐    ┌────┴─────────────────────────┐   │
│  │  PostgreSQL    │    │  OnlyOffice Document Server  │   │
│  │  Port: 5432    │    │  - Internal: onlyoffice:80   │   │
│  └────────────────┘    │  - External: 8080 → 80       │   │
│                        │  - JWT: MySuperSecret123456   │   │
│                        └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Cấu hình hiện tại

### Environment Variables (.env)

```env
BACKEND_PUBLIC_URL=http://backend:8000
ONLYOFFICE_URL=http://onlyoffice:80
ONLYOFFICE_PUBLIC_URL=http://10.0.0.9:8080
ONLYOFFICE_SECRET=MySuperSecret123456
ONLYOFFICE_ENABLED=true
```

### Ports

| Service | Internal Port | External Port | Access URL |
|---------|---------------|---------------|------------|
| Frontend | 80 | 8088 | http://10.0.0.9:8088 |
| Backend | 8000 | 8000 | http://10.0.0.9:8000 |
| OnlyOffice | 80 | 8080 | http://10.0.0.9:8080 |
| PostgreSQL | 5432 | 5432 | 10.0.0.9:5432 |

## Sử dụng OnlyOffice

### 1. Xem file Office

1. Truy cập: `http://10.0.0.9:8088/documents`
2. Chọn storage configuration (SMB/FTP/Google Drive)
3. Browse đến folder chứa file
4. Click vào file `.docx`, `.xlsx`, `.pptx`, `.pdf`
5. OnlyOffice viewer sẽ mở file trong modal

### 2. Chỉnh sửa file

- File Word/Excel/PowerPoint: Có thể edit nếu có quyền write
- File PDF: Chỉ xem, không edit được
- Auto-save: Tự động lưu mỗi vài giây
- Force-save: Lưu ngay lập tức

### 3. Đóng viewer

- Click nút X ở góc phải trên
- Hoặc nhấn phím ESC

## Supported File Types

| Extension | Type | Edit | View |
|-----------|------|------|------|
| `.docx`, `.doc` | Word | ✅ | ✅ |
| `.xlsx`, `.xls` | Excel | ✅ | ✅ |
| `.pptx`, `.ppt` | PowerPoint | ✅ | ✅ |
| `.odt`, `.ods`, `.odp` | OpenDocument | ✅ | ✅ |
| `.csv` | CSV | ✅ | ✅ |
| `.txt`, `.rtf` | Text | ✅ | ✅ |
| `.pdf` | PDF | ❌ | ✅ |

## Quản lý Services

### Start tất cả services

```powershell
cd e:\goldenfarmict
docker-compose up -d
```

### Stop tất cả services

```powershell
docker-compose down
```

### Restart một service

```powershell
docker-compose restart backend
docker-compose restart frontend
docker-compose restart onlyoffice
```

### Xem logs

```powershell
docker logs goldenfarm-backend --tail 50
docker logs goldenfarm-frontend --tail 50
docker logs goldenfarm-onlyoffice --tail 50
```

### Xem status

```powershell
docker-compose ps
```

## Deploy Script (Khuyến nghị)

Sử dụng script PowerShell để deploy dễ dàng:

```powershell
# Rebuild frontend (sau khi sửa code React)
.\deploy.ps1 -BuildFrontend

# Rebuild backend (sau khi sửa code Python)
.\deploy.ps1 -BuildBackend

# Rebuild tất cả
.\deploy.ps1 -BuildAll

# Restart tất cả (không rebuild)
.\deploy.ps1 -RestartAll

# Xem logs
.\deploy.ps1 -Logs
```

## Troubleshooting

### Vấn đề 1: OnlyOffice không mở file

**Triệu chứng:** Click vào file nhưng không hiển thị gì

**Kiểm tra:**
1. OnlyOffice container có chạy không?
   ```powershell
   docker ps | findstr onlyoffice
   ```
   Status phải là `healthy`

2. Test healthcheck:
   ```powershell
   curl http://10.0.0.9:8080/healthcheck
   ```
   Phải trả về `true`

3. Xem browser console (F12 > Console) có lỗi không?

**Fix:**
```powershell
docker-compose restart onlyoffice
```

### Vấn đề 2: Lỗi "Error: 0. Build: 129"

**Triệu chứng:** OnlyOffice hiển thị lỗi khi mở file

**Nguyên nhân:** OnlyOffice không thể download file từ backend

**Kiểm tra:**
```powershell
docker exec goldenfarm-onlyoffice curl -I http://backend:8000/api/health
```

Phải trả về HTTP 200 OK.

**Fix:**
```powershell
docker-compose restart backend onlyoffice
```

### Vấn đề 3: File SMB không đọc được

**Triệu chứng:** Browse SMB folder trả về lỗi hoặc file không hiển thị

**Kiểm tra:**
1. SMB credentials có đúng không?
2. SMB share có accessible từ backend container không?

**Test từ backend container:**
```powershell
docker exec -it goldenfarm-backend bash
# Trong container:
smbclient //10.0.0.x/share -U username
```

**Fix:** Xem phần "SMB Configuration" bên dưới

### Vấn đề 4: OnlyOffice chậm hoặc crash

**Nguyên nhân:** Không đủ RAM (OnlyOffice cần tối thiểu 4GB)

**Kiểm tra:**
```powershell
docker stats goldenfarm-onlyoffice
```

**Fix:**
- Tăng RAM cho Docker Desktop: Settings > Resources > Memory
- Hoặc tắt OnlyOffice: `ONLYOFFICE_ENABLED=false` trong `.env`

## SMB Configuration (Module Tài liệu)

### Cấu hình SMB Storage

1. Vào module **Tài liệu**
2. Click **Cấu hình Storage**
3. Chọn **SMB (Windows Share)**
4. Điền thông tin:

```
Tên: File Server Sản xuất
Host: 10.0.0.x
Port: 445
Username: goldenfarm\user
Password: ********
Remote Path: shared (tên share, không phải full path)
Domain: WORKGROUP (hoặc domain của công ty)
```

5. Click **Test Connection** để kiểm tra
6. Click **Lưu**

### SMB Permissions

Phân quyền folder theo:
- **Role:** admin, head, user
- **Mã NV:** Cụ thể từng nhân viên
- **Bộ phận:** Toàn bộ một phòng ban

**Ví dụ:**
- Folder `/HR` → Only role=admin, role=head có quyền read
- Folder `/HCNS` → Department=HR có quyền write
- Folder `/Public` → Tất cả có quyền read

### SMB Troubleshooting

**Lỗi: "Connection refused"**
→ Check firewall, SMB port 445 có mở không

**Lỗi: "Access denied"**
→ Check username/password, domain

**Lỗi: "Share not found"**
→ Remote Path phải là tên share (VD: `shared`), không phải full path (`/mnt/shared`)

**File tiếng Việt không hiển thị đúng:**
→ Đảm bảo SMB server dùng UTF-8 encoding

## Performance Tips

### 1. Tối ưu RAM

OnlyOffice sử dụng nhiều RAM. Nếu server có ít RAM:

```yaml
# docker-compose.yml
onlyoffice:
  deploy:
    resources:
      limits:
        memory: 2G
```

### 2. Tối ưu Storage

OnlyOffice lưu cache trong volume `onlyoffice-data`. Nên định kỳ dọn dẹp:

```powershell
docker exec goldenfarm-onlyoffice rm -rf /var/www/onlyoffice/Data/cacheFile/*
```

### 3. Tối ưu Network

Nếu file lớn (>10MB), tăng timeout trong nginx config:

```nginx
# frontend/nginx.conf
location /api/ {
    proxy_read_timeout 600s;
}
```

## Security

### 1. Đổi JWT Secret

**Không dùng** `MySuperSecret123456` trong production!

**Tạo secret mới:**
```powershell
# Generate random 32-byte secret
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

**Update config:**
- File `.env`: `ONLYOFFICE_SECRET=YourNewSecretHere`
- File `docker-compose.yml`: `JWT_SECRET=YourNewSecretHere`
- Restart: `docker-compose restart backend onlyoffice`

### 2. HTTPS (Production)

Trong production, nên dùng HTTPS:

```yaml
# docker-compose.yml
frontend:
  ports:
    - "443:443"
  volumes:
    - ./ssl/cert.pem:/etc/nginx/ssl/cert.pem:ro
    - ./ssl/key.pem:/etc/nginx/ssl/key.pem:ro
```

Update nginx config để dùng SSL.

### 3. Network Isolation

OnlyOffice chỉ accessible từ internal network. Không expose port 8080 ra internet.

## Backup & Restore

### Backup

```powershell
# Backup PostgreSQL
docker exec goldenfarm-postgres pg_dump -U goldenfarm goldenfarmict > backup.sql

# Backup OnlyOffice data
docker run --rm -v goldenfarmict_onlyoffice-data:/data -v ${PWD}:/backup alpine tar czf /backup/onlyoffice-data.tar.gz /data
```

### Restore

```powershell
# Restore PostgreSQL
docker exec -i goldenfarm-postgres psql -U goldenfarm goldenfarmict < backup.sql

# Restore OnlyOffice data
docker run --rm -v goldenfarmict_onlyoffice-data:/data -v ${PWD}:/backup alpine tar xzf /backup/onlyoffice-data.tar.gz -C /
```

## Support

Nếu gặp vấn đề, thu thập thông tin sau:

1. **Logs:**
   ```powershell
   docker logs goldenfarm-backend --tail 100 > backend.log
   docker logs goldenfarm-onlyoffice --tail 100 > onlyoffice.log
   docker logs goldenfarm-frontend --tail 100 > frontend.log
   ```

2. **Config:**
   ```powershell
   docker exec goldenfarm-backend env | findstr ONLYOFFICE
   ```

3. **Status:**
   ```powershell
   docker-compose ps
   docker stats --no-stream
   ```

4. **Browser console screenshot** (F12 > Console tab)

5. **Network tab screenshot** (F12 > Network tab, filter "onlyoffice")

---

## ✅ Checklist Hoàn thành

- [x] OnlyOffice container chạy trong Docker Compose
- [x] Frontend đã rebuild với OnlyOffice Viewer component
- [x] Backend config đúng (BACKEND_PUBLIC_URL, ONLYOFFICE_URL)
- [x] JWT authentication giữa services
- [x] SMB file access working
- [x] File preview (.docx, .xlsx, .pdf) working
- [x] File editing (.docx, .xlsx) working
- [x] Auto-save và force-save
- [x] Permissions (read/write) theo role
- [x] Error handling và user-friendly messages
- [x] Debug logging trong browser console
- [x] Deploy script (deploy.ps1)
- [x] Documentation đầy đủ

## 🎉 Sẵn sàng sử dụng!

Truy cập: **http://10.0.0.9:8088/documents**
