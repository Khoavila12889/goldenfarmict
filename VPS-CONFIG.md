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
| `https://noibo.canhdongvang.vn/onlyoffice` | OnlyOffice DocsAPI JS | Browser |
| `https://noibo.canhdongvang.vn/drawio` | Draw.io editor | Browser (iframe) |
| `http://10.0.0.114:8000` | Backend API | OnlyOffice callback, internal |
| `http://10.0.0.114:8088` | Frontend (HTTP direct) | Test/debug |
| `http://10.0.0.114:8090` | OnlyOffice container (HTTP direct) | Test/debug |
| `http://10.0.0.114:8091` | Draw.io container (HTTP direct) | Test/debug |

## Luồng giao tiếp OnlyOffice

```
Browser (HTTPS)                          OnlyOffice Container
    │                                         │
    │ 1. GET /api/documents/onlyoffice/config  │
    ├─────────────────────────────────────────►│ (gọi backend qua 10.0.0.114:8000)
    │                                          │
    │ 2. Trả về config:                        │
    │    - document.url = download token       │
    │    - editorConfig.callbackUrl            │
    │    - _docsApiUrl = /onlyoffice/.../api.js│
    │◄─────────────────────────────────────────┤
    │                                          │
    │ 3. GET /onlyoffice/web-apps/.../api.js   │
    ├─────────────────────────────────────────►│ (cùng origin HTTPS, proxy route đúng)
    │◄─────────────────────────────────────────┤ 200 application/javascript
    │                                          │
    │ 4. DocsAPI.DocEditor init                │
    │    → Fetch document.url (download file)  │
    ├─────────────────────────────────────────►│ (OnlyOffice → backend 10.0.0.114:8000)
    │◄─────────────────────────────────────────┤ Trả về file bytes
    │                                          │
    │ 5. User chỉnh sửa, OnlyOffice save       │
    │    → POST callbackUrl (force-save)       │
    ├─────────────────────────────────────────►│ (OnlyOffice → backend 10.0.0.0.114:8000)
    │◄─────────────────────────────────────────┤ Backend tải file từ storage, ghi lại
    │                                          │
```

## Backend .env variables (quan trọng)
```
BACKEND_PUBLIC_URL=http://10.0.0.114:8000    ← OnlyOffice container gọi được (internal IP)
ONLYOFFICE_URL=http://onlyoffice:80           ← Backend gọi OnlyOffice (internal Docker)
ONLYOFFICE_PUBLIC_URL=/onlyoffice             ← Browser load DocsAPI (relative = same-origin)
ONLYOFFICE_SECRET=MySuperSecret123456
ONLYOFFICE_ENABLED=true
```

## Frontend nginx.conf
- `/api/` → proxy_pass `http://backend:8000` (internal Docker)
- `/onlyoffice/` → proxy_pass `http://onlyoffice:80/` (internal Docker)
- `/drawio/` → proxy_pass `http://drawio:8080/` (internal Docker)

## Lưu ý
- Chỉ backend mới cần biết VPS IP thật (`10.0.0.114`) vì OnlyOffice callback/download cần URL reachable từ container
- Frontend dùng internal Docker names (`backend`, `onlyoffice`, `drawio`) vì cùng docker-compose network
- Browser dùng HTTPS domain (`noibo.canhdongvang.vn`) qua external proxy
- KHÔNG dùng `localhost` hay `127.0.0.1` trong production config — container không resolve được
