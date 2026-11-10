# Craft Web — WordCraft / GridCraft / PdfCraft

Static WASM demo cho webapp (`/craft-demo`), chạy qua profile `craft`, không ảnh hưởng stack chính.

| Service | Port | Thư mục mount | Container |
|---|---|---|---|
| wordcraft-web | 8771 | `./craft-web/wordcraft` | goldenfarm-wordcraft-web |
| gridcraft-web | 8772 | `./craft-web/gridcraft` | goldenfarm-gridcraft-web |
| pdfcraft-web | 8773 | `./craft-web/pdfcraft` | goldenfarm-pdfcraft-web |

Nginx chung: `./craft-web/nginx.conf` (mount read-only vào cả 3 service).
Phiên bản đang chạy (05/11/2026): WordCraft `v0.15.1`, GridCraft `v0.16.0`, PdfCraft `v0.18.1`.

## Update bản Web mới nhất (copy-paste 1 khối)

> Org đúng là `storytold` (`ArtCraft-Apps` trả 404). Asset Web khớp pattern `web.*\.zip`.
> Zip release luôn lồng 1 thư mục con (`<app>-web-<ver>/`) — script dưới tự flatten.

```bash
cd /home/goldenfarmict  # ngang hàng docker-compose.yml

for APP in wordcraft gridcraft pdfcraft; do
  echo ">>> $APP"
  curl -sL "https://api.github.com/repos/storytold/$APP/releases/latest" -o /tmp/$APP-release.json
  echo "TAG: $(jq -r .tag_name /tmp/$APP-release.json)"
  jq -r '.assets[] | select(.name | test("web.*\\.zip")) | .browser_download_url' /tmp/$APP-release.json
done

for APP in wordcraft gridcraft pdfcraft; do
  URL=$(jq -r '.assets[] | select(.name | test("web.*\\.zip")) | .browser_download_url' /tmp/$APP-release.json)
  rm -f /tmp/$APP-web.zip
  curl -sL "$URL" -o /tmp/$APP-web.zip
  DEST="./craft-web/$APP"
  mkdir -p "$DEST"
  find "$DEST" -mindepth 1 -delete
  unzip -q -o /tmp/$APP-web.zip -d "$DEST"
  if [ ! -f "$DEST/index.html" ]; then
    SUB=$(find "$DEST" -mindepth 1 -maxdepth 1 -type d | head -n 1)
    [ -f "$SUB/index.html" ] && { mv "$SUB"/* "$SUB"/.[!.]* "$DEST"/ 2>/dev/null || mv "$SUB"/* "$DEST"/; rmdir "$SUB"; }
  fi
  touch "$DEST/.gitkeep"
  ls -lh "$DEST/index.html" "$DEST"/*.wasm
done

rm -f /tmp/*-web.zip /tmp/*-release.json

docker compose --profile craft restart wordcraft-web gridcraft-web pdfcraft-web
sleep 3
for p in 8771 8772 8773; do echo "== $p =="; curl -I -s http://localhost:$p/ | head -n 1; done
```

Kỳ vọng: cả 3 port trả `HTTP/1.1 200 OK`, `index.html` + `*.wasm` nằm ngay gốc `./craft-web/<app>/`.

## Lệnh service

```bash
docker compose --profile craft up -d wordcraft-web gridcraft-web pdfcraft-web  # lần đầu / container chưa chạy
docker compose --profile craft restart wordcraft-web gridcraft-web pdfcraft-web # update xong
docker compose --profile craft ps        # kiểm tra
docker compose --profile craft down      # tắt demo (không đụng db/backend/onlyoffice)
```

Không `restart` toàn bộ compose — sẽ gián đoạn `db`, `backend`, `onlyoffice`.

## Xử lý sự cố

- `Not Found` từ API: kiểm tra org `storytold`, không phải `ArtCraft-Apps`.
- `index.html` không ở gốc sau giải nén: zip bị lồng thư mục con — `mv` toàn bộ ra ngoài, `rmdir` thư mục rỗng.
- Sửa `craft-web/nginx.conf` xong container vẫn đọc config cũ: bind-mount file giữ inode cũ — phải `up -d --force-recreate` 3 service craft. Regex `location` chứa `{...}` phải đặt trong ngoặc kép, ví dụ `location ~* "-[a-f0-9]{16}(_bg)?\.(wasm|js|ico)$"`, nếu không nginx báo `unknown directive` và container restart loop.
- Arch dùng `pacman -S curl jq unzip wget`; AlmaLinux/RHEL dùng `dnf install -y curl jq unzip wget` (thường đã có sẵn).
- Container Up nhưng curl không 200: kiểm tra mount `./craft-web/<app>:/usr/share/nginx/html:ro` và file `index.html` tồn tại.

Chi tiết demo trong webapp: xem `docs/CRAFT_DEMO_README.md`.

## Cap nhat tu dong (tu 2026-11-10)

Server tu kiem tra release moi cua ca 3 app moi ngay luc 02:30 (systemd timer
`artcraft-update.timer`, script `/usr/local/sbin/artcraft-update.sh`): tai ban
web moi nhat tu GitHub releases cua storytold, backup ban dang chay vao
`backups/artcraft/` (giu 3 ban/app), thay noi dung, restart 3 service va kiem
tra HTTP 200 o cac cong 8771/8772/8773; app nao loi se tu khoi phuc backup.
Log o `/var/log/artcraft-update.log`, tag dang cai o `/var/lib/artcraft/`.
Chay tay khi can: `systemctl start artcraft-update.service`.
