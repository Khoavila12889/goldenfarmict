# Demo WordCraft / GridCraft / PdfCraft trực tiếp trên webapp GoldenFarmICT

Branch: `wordcraft-viewer-151026`. Trang demo: **`/craft-demo`** (đã đăng nhập mới vào được,
OnlyOffice hiện tại không bị đụng).

## Cách 1 — Không build gì (nhanh nhất, ngoài webapp)

Tải bản portable Windows từ GitHub Releases, mở file công ty để xem:

| App | Release | File thử |
|---|---|---|
| WordCraft | `wordcraft-<ver>-windows-x64-portable.zip` | `frontend/src/template/luong.docx` |
| GridCraft | `gridcraft-<ver>-windows-x64-portable.zip` | `frontend/src/template/luong.xlsx`, `backend/uploads/salary/2026-09/20261006_040040_luong_9.2026.xlsx` |
| PdfCraft | `pdfcraft-<ver>-windows-x64-portable.zip` | file PDF trong `backend/uploads/documents/pages/_src/` |

## Cách 2 — Demo ngay trong webapp (trang /craft-demo)

> Bạn chạy project bằng `docker compose`: 3 bản web đã có sẵn service riêng
> (profile `craft`, không chạy mặc định, không ảnh hưởng stack chính).

1. Bỏ bản web vào thư mục (trên PC, ngang hàng `docker-compose.yml`):
   `craft-web/wordcraft/`, `craft-web/gridcraft/`, `craft-web/pdfcraft/`
   (build `trunk build --release` hoặc giải nén release `*-web-*.zip`).
2. Chạy:
   ```bash
   docker compose --profile craft up -d wordcraft-web gridcraft-web pdfcraft-web
   ```
   Mở `http://<pc>:8771` kiểm tra từng bản trước.
3. Mở webapp GoldenFarmICT → `/craft-demo` (URL mặc định trong trang đã khớp
   3 port này; đổi port thì sửa trong ô URL).
4. Trong khung iframe dùng **file picker của app** để mở file công ty, đối chiếu với
   OnlyOffice ở module Tài liệu, ghi kết quả vào checklist trong trang.
5. Không demo nữa: `docker compose --profile craft down`.

## Cách 3 — So convert (quyết định có thay OnlyOffice cho in ấn không)

```bash
wordcraft-cli convert luong.docx luong-wordcraft.pdf
gridcraft-cli convert luong_9.2026.xlsx luong-gridcraft.pdf
pdfcraft-cli text  <file>.pdf --page 1   # kiểm tra trích xuất text
```

So PDF này với PDF OnlyOffice đang sinh cho phiếu lương/công thức. Khớp số liệu mới thay.

## Ghi kết quả

| File | WordCraft | GridCraft | PdfCraft | OnlyOffice (hiện tại) |
|---|---|---|---|---|
| luong.docx | | — | — | xem+sửa OK |
| luong.xlsx / lương T9 | — | | — | xem + convert PDF OK |
| PDF tài liệu | — | — | | preview ảnh WebP (không search được) |

Ghi Đạt/Lỗi + ảnh chụp vào đây hoặc vào `docs/WORDCRAFT_RESEARCH.md`.
Ngưỡng đề xuất: **xem** đạt là thay được; **in/convert + sửa** cứ giữ OnlyOffice.
