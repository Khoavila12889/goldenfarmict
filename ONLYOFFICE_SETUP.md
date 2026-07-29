# Hướng dẫn Setup OnlyOffice Document Server

## Tổng quan

OnlyOffice Document Server cho phép xem và chỉnh sửa file Office (docx, xlsx, pptx, pdf) trực tiếp trong trình duyệt web mà không cần tải xuống.

## Tùy chọn 1: Sử dụng OnlyOffice trên Docker (Khuyến nghị)

### Bước 1: Bật OnlyOffice service trong docker-compose.yml

Mở file `docker-compose.yml` và bỏ comment (xóa dấu `#`) các dòng từ `onlyoffice:` đến hết phần OnlyOffice service:

```yaml
  onlyoffice:
    image: onlyoffice/documentserver:latest
    container_name: goldenfarm-onlyoffice
    ports:
      - "8080:80"
    environment:
      - JWT_ENABLED=true
      - JWT_SECRET=MySuperSecret123456
    volumes:
      - onlyoffice-data:/var/www/onlyoffice/Data
      - onlyoffice-logs:/var/log/onlyoffice
    restart: unless-stopped
    networks:
      - goldenfarm-network
```

Và bỏ comment volumes:

```yaml
volumes:
  postgres-data:
    driver: local
  onlyoffice-data:
    driver: local
  onlyoffice-logs:
    driver: local
```

### Bước 2: Cấu hình môi trường

Mở file `.env` và cập nhật:

```env
ONLYOFFICE_URL=http://onlyoffice:80
ONLYOFFICE_SECRET=MySuperSecret123456
ONLYOFFICE_ENABLED=true
```

### Bước 3: Khởi động lại docker-compose

```powershell
docker-compose down
docker-compose up -d
```

### Bước 4: Kiểm tra

Truy cập http://localhost:8080 để xem OnlyOffice có chạy không.

**Lưu ý:** OnlyOffice yêu cầu tối thiểu 4GB RAM.

---

## Tùy chọn 2: Sử dụng OnlyOffice Server riêng (office.goldenfarm.vn)

Nếu bạn đã có OnlyOffice Document Server chạy riêng tại domain khác:

### Bước 1: Cấu hình môi trường

Mở file `.env` và cập nhật:

```env
ONLYOFFICE_URL=https://office.goldenfarm.vn
ONLYOFFICE_SECRET=your_jwt_secret_key
ONLYOFFICE_ENABLED=true
```

### Bước 2: Khởi động lại backend

```powershell
docker-compose restart backend
```

---

## Tùy chọn 3: Tắt OnlyOffice (Chỉ download file)

Nếu không muốn sử dụng OnlyOffice, file Office sẽ chỉ có thể download:

```env
ONLYOFFICE_ENABLED=false
```

Khởi động lại:

```powershell
docker-compose restart backend
```

---

## Troubleshooting

### Lỗi: "Không thể tải ONLYOFFICE API từ máy chủ"

**Nguyên nhân:** OnlyOffice server không khả dụng hoặc không thể kết nối.

**Giải pháp:**
1. Kiểm tra OnlyOffice container có đang chạy không: `docker ps | findstr onlyoffice`
2. Kiểm tra logs: `docker logs goldenfarm-onlyoffice`
3. Kiểm tra URL trong `.env` có đúng không
4. Nếu dùng external server, kiểm tra domain có resolve được không

### Lỗi: "OnlyOffice Document Server không được bật"

**Nguyên nhân:** `ONLYOFFICE_ENABLED=false` trong `.env`

**Giải pháp:** Đổi thành `ONLYOFFICE_ENABLED=true` và restart backend.

### Lỗi: "JWT validation failed"

**Nguyên nhân:** `ONLYOFFICE_SECRET` không khớp giữa backend và OnlyOffice server.

**Giải pháp:** Đảm bảo `JWT_SECRET` trong docker-compose.yml khớp với `ONLYOFFICE_SECRET` trong `.env`

---

## Cấu hình Nginx Reverse Proxy (Production)

Nếu deploy production với domain, cấu hình Nginx:

```nginx
# OnlyOffice Document Server
location /onlyoffice/ {
    proxy_pass http://onlyoffice:80/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Sau đó update `.env`:

```env
ONLYOFFICE_URL=https://yourdomain.com/onlyoffice
```

---

## Tham khảo

- OnlyOffice Documentation: https://helpcenter.onlyoffice.com/installation/docs-community-index.aspx
- Docker Image: https://hub.docker.com/r/onlyoffice/documentserver
