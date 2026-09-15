# Cấu hình VPS Production - Goldenfarm ICT

## Server Info
- **VPS IP**: `10.0.0.114`
- **Domain**: `noibo.canhdongvang.vn` (HTTPS qua Cloudflare/VPS proxy)
- **Project path**: `/home/goldenfarmict`
- **Mật khẩu DB**: `your_strong_password` (cần đổi trong production thật)

## Port Mapping
| Service | Container Port | Host Port | Protocol |
|---------|---------------|-----------|----------|
| Frontend | 80 | 8088 | HTTP |
| Backend | 8000 | 8000 | HTTP |
| OnlyOffice | 80 | 8090 | HTTP |
| Draw.io | 8080 | 8091 | HTTP |
| PostgreSQL | 5432 | 5432 | TCP |

## URLs quan trọng
| URL | Mục đích | Ai gọi |
|-----|----------|--------|
| `https://noibo.canhdongvang.vn` | User truy cập web | Browser |
| `https://noibo.canhdongvang.vn/onlyoffice` | OnlyOffice DocsAPI JS + editor iframe | Browser |
| `https://noibo.canhdongvang.vn/drawio` | Draw.io editor | Browser (iframe) |
| `http://backend:8000` | Backend API (DNS nội bộ Docker) | **OnlyOffice download + callback** |
| `http://onlyoffice:80` | Document Server (DNS nội bộ Docker) | Backend + nginx frontend |
| `http://10.0.0.114:8088` | Frontend (HTTP direct) | Test/debug |
| `http://10.0.0.114:8090` | OnlyOffice container (HTTP direct) | Test/debug |
| `http://10.0.0.114:8091` | Draw.io container (HTTP direct) | Test/debug |

> ⚠️ DS gọi backend bằng **`http://backend:8000`**, KHÔNG phải IP VPS. Cả hai container
> cùng network `goldenfarm-network` nên resolve được tên service. Dùng IP VPS vẫn chạy
> nhưng phụ thuộc firewall/route của host và từng gây lỗi `ECONNREFUSED`.

## Luồng giao tiếp OnlyOffice

```
Browser (HTTPS)                          OnlyOffice Container
    │                                         │
    │ 1. GET /api/documents/onlyoffice/config  │
    ├─────────────────────────────────────────►│ (backend sinh config + JWT)
    │                                          │
    │ 2. Trả về config:                        │
    │    - document.url = download token       │
    │    - editorConfig.callbackUrl            │
    │    - _docsApiUrl = /onlyoffice/.../api.js│
    │◄─────────────────────────────────────────┤
    │                                          │
    │ 3. GET /onlyoffice/web-apps/.../api.js   │
    ├─────────────────────────────────────────►│ (cùng origin HTTPS, nginx frontend proxy)
    │◄─────────────────────────────────────────┤ 200 application/javascript
    │                                          │
    │ 4. DocsAPI.DocEditor init                │
    │    → DS tự tải document.url              │
    │                                          ├──► http://backend:8000/api/documents/onlyoffice/download?token=…
    │                                          │◄── backend đọc SMB/FTP/GDrive, trả file bytes
    │                                          │
    │ 5. User chỉnh sửa, DS save               │
    │                                          ├──► POST http://backend:8000/api/documents/onlyoffice/callback
    │                                          │◄── backend ghi ngược file lên storage (_put_file_bytes)
```

## Backend .env variables (quan trọng)
```
ONLYOFFICE_BACKEND_URL=                        ← để TRỐNG → compose mặc định http://backend:8000
ONLYOFFICE_URL=http://onlyoffice:80            ← Backend gọi OnlyOffice (internal Docker)
ONLYOFFICE_PUBLIC_URL=/onlyoffice              ← Browser load DocsAPI (relative = same-origin)
ONLYOFFICE_SECRET=MySuperSecret123456          ← phải khớp JWT_SECRET của container DS
ONLYOFFICE_ENABLED=true
```

`docker-compose.yml` map nó thành:
```yaml
- BACKEND_PUBLIC_URL=${ONLYOFFICE_BACKEND_URL:-http://backend:8000}
```

Nếu `BACKEND_PUBLIC_URL` trống, backend sẽ suy ra từ header `Host` của browser →
ra URL của **frontend** → DS gọi ngược về frontend và báo
`connect ECONNREFUSED` trong `docservice/out.log`. Backend có log cảnh báo
`[ONLYOFFICE] BACKEND_PUBLIC_URL chưa được cấu hình…`.

## Frontend nginx.conf — yêu cầu BẮT BUỘC cho `/onlyoffice/`

DS dựng URL redirect tuyệt đối theo `$the_scheme://$the_host$the_prefix/<version>/web-apps/…`,
nên nginx frontend phải gửi đủ:

```nginx
proxy_pass http://onlyoffice:80/;              # "/" cuối → cắt prefix /onlyoffice
proxy_set_header Host $oo_host;                # = $http_x_forwarded_host hoặc $http_host (CÓ PORT)
proxy_set_header X-Forwarded-Host $oo_host;
proxy_set_header X-Forwarded-Proto $oo_scheme; # = $http_x_forwarded_proto hoặc $scheme
proxy_set_header X-Forwarded-Prefix /onlyoffice;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $oo_connection;
```

- **Không dùng `Host $host`** — `$host` bỏ port → DS sinh `http://noibo.canhdongvang.vn/9.4.0-…`
  thiếu port ở local, và browser rơi vào trang trắng.
- **Không dùng `proxy_redirect`** để vá prefix — khi đã có `X-Forwarded-Prefix`
  nó sẽ nhân đôi thành `/onlyoffice/onlyoffice/…`.
- Giữ cả `location /cache/` và `location /onlyoffice/cache/` (secure_link, `proxy_buffering off`).
- `/api/` → `http://backend:8000`, `/drawio/` → `http://drawio:8080/`.

Kiểm tra nhanh sau khi deploy:
```bash
curl -sSI -o /dev/null -D - http://127.0.0.1:8088/onlyoffice/web-apps/apps/spreadsheeteditor/main/index.html
# Location phải là: http://<host>:8088/onlyoffice/9.4.0-<tag>/web-apps/...
node debug-onlyoffice.js     # chẩn đoán đầy đủ 5 tầng
```

## Lưu ý
- Frontend dùng internal Docker names (`backend`, `onlyoffice`, `drawio`) vì cùng docker-compose network
- Browser dùng HTTPS domain (`noibo.canhdongvang.vn`) qua external proxy (NPM/Cloudflare) —
  proxy đó PHẢI gửi `X-Forwarded-Host` + `X-Forwarded-Proto`, nếu không DS sẽ sinh URL `http://`
  và browser báo **Mixed Content**
- KHÔNG dùng `localhost` hay `127.0.0.1` trong production config — container không resolve được
- `frontend/.env` phải để `VITE_API_URL=` **trống** ở cả local lẫn production (dùng `/api` tương đối)
- Chi tiết vận hành đầy đủ: `README.md` → mục **🚀 Deploy & Bảo trì Server**

