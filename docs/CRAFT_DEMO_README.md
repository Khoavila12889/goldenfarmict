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

1. Cài Rust + trunk (một lần): `cargo install trunk`, thêm target `wasm32-unknown-unknown`.
2. Clone + chạy 3 bản web (mỗi cái một terminal, port khác nhau):
   ```bash
   git clone https://github.com/storytold/wordcraft
   cd wordcraft/apps/wordcraft-web && trunk serve            # :8771
   git clone https://github.com/storytold/gridcraft
   cd gridcraft/apps/gridcraft-web && trunk serve --port 8772
   git clone https://github.com/storytold/pdfcraft
   cd pdfcraft/apps/pdfcraft-web && trunk serve --port 8773
   ```
   Không có Rust thì thay bằng release `*-web-*.zip` (static site, serve bằng nginx/`npx serve`).
3. Checkout branch này, chạy webapp như bình thường, mở `/craft-demo`.
4. Mỗi tab đã điền sẵn URL localhost — nếu đổi port thì sửa trong ô URL.
5. Trong khung iframe dùng **file picker của app** để mở file công ty, đối chiếu với
   OnlyOffice ở module Tài liệu, ghi kết quả vào checklist trong trang.

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
