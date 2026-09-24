# Kiểm tra export draw.io — 23/09/2026

## Nguyên nhân và bản sửa

Container cũ dùng `jgraph/drawio:latest` nhưng JavaScript thực tế là **31.4.2**,
image build 01/09/2026, digest
`sha256:19d71d91d092e65132ea22b2e1cfcddf9716402a01386fbaae7190cf689adeb0`.
`PreConfig.js` không đặt EXPORT_URL; `Init.js` dùng
`window.EXPORT_URL || 'https://convert.diagrams.net/node/export'`.
Chromium tái hiện POST đến URL này khi Export PDF ở cả editor trực tiếp và iframe.
Yêu cầu được chặn trong kiểm thử với sơ đồ giả; không dùng phản hồi 403 giả lập
làm bằng chứng về mã HTTP thật của dịch vụ ngoài.

Tài liệu chính thức xác nhận bản <=31.4.2 dùng dịch vụ chỉ chấp nhận domain draw.io:
https://www.drawio.com/docs/security/diagrams-docker-app/
Tài liệu Docker về việc bỏ export-server:
https://github.com/jgraph/docker-drawio#removed-variables

Compose được ghim **31.4.4** cùng digest
`sha256:7b0cd0d943b6b46825ce42bc0f406e26b1f5155bf71892fc2095069c73a817d5`.
Đã kiểm tra image này ghi `window.EXPORT_URL = null` và
`isPrintPdfExport()` trả về true. Bỏ khai báo drawio-export và
DRAWIO_EXPORT_URL có sẵn trong working tree: không có container export đang chạy,
và biến này không cấu hình được nhánh export của image đã kiểm tra.

**Export as → PDF → Export mở luồng in của trình duyệt. Chọn Save as PDF để lưu.**
Đây không phải chức năng tải PDF trực tiếp từ export server. PDF không nhúng XML
để chỉnh sửa lại; lưu riêng `.drawio` nếu cần giữ dữ liệu sơ đồ.

## Phạm vi kiểm tra

- Không có AGENTS.md trong dự án hoặc các thư mục cha áp dụng.
- Đã đọc Compose, DrawioViewer.jsx, ToolsDrawio.jsx, API load/save XML,
  Dockerfile frontend và nginx.conf; đối chiếu Nginx trong container.
- Iframe không sandbox. URL dùng embed=1, proto=json, ui=min. Frontend đang chạy
  có URL draw.io tuyệt đối; postMessage xử lý init/load/save/autosave/exit.
  PNG/WebP/PDF dùng menu export bên trong editor, không qua handler download XML.
- CSP runtime và proxy nội bộ không chỉ ra hạn chế popup gây lỗi PDF.
  Log draw.io đã đọc không có lỗi render PDF; bản cũ POST ra dịch vụ ngoài.
- Không sửa code frontend/backend, PostgreSQL hoặc OnlyOffice.

## Triển khai và kết quả

`docker compose config --quiet` đạt. Chỉ chạy
`docker compose up -d --no-deps --pull never drawio`.
`nginx -t` đạt và reload Nginx trong frontend để resolve lại upstream.
Không rebuild/recreate frontend. Không xóa volume.

Kiểm thử lại sau triển khai bằng Chromium, editor trực tiếp cổng 8091 và
iframe của ứng dụng cổng 8088, tài nguyên iframe đi qua proxy `/drawio/` thật:

| Kiểm tra | Trực tiếp | Iframe |
| --- | --- | --- |
| Runtime | 31.4.4, EXPORT_URL=null | 31.4.4, EXPORT_URL=null |
| PDF từ trang in | 10.192 byte, 1 trang | 10.096 byte, 1 trang |
| PNG tải thực | 8.999 byte | 8.992 byte |
| WebP tải thực | 2.832 byte | 2.832 byte |
| XML tải thực | 1.102 byte | 1.095 byte |
| POST export bên ngoài | 0 | 0 |
| Save postMessage XML | Không áp dụng | Đạt |

PDF được kiểm tra bằng pdfinfo, pdftotext và render bằng pdftoppm: có hai khối,
đường nối và các nhãn của sơ đồ giả. File mẫu nằm trong `/tmp/drawio-check/`.
Container mới healthy; đây là kiểm tra bổ sung, không thay thế kiểm thử export.

## Chạy lại

Script cần Node.js và Playwright/Chromium (đã cài riêng vào thư mục tạm,
không thêm dependency vào frontend):

```sh
NODE_PATH=/tmp/drawio-check/node_modules \
PLAYWRIGHT_BROWSERS_PATH=/tmp/drawio-check/browsers \
node docs/drawio-export-check/verify.cjs
pdfinfo /tmp/drawio-check/embedded.pdf
pdftotext /tmp/drawio-check/embedded.pdf -
```

Script dùng session giả và mock API ứng dụng; không đọc/ghi dữ liệu nghiệp vụ.
Nó bắt instance editor để gọi các action menu thật. Trong headless, nó giữ cửa sổ
in mở, ghi nhận lời gọi window.print rồi dùng Chromium printToPDF trên trang in.
Chữ ký file PNG/WebP/XML được kiểm tra khi tải xuống.

## Phần cần kiểm tra trên máy người dùng

Hard refresh editor để tải JavaScript mới. Thử Export as → PDF → Export,
chọn Save as PDF trong hộp thoại in và mở file. Nếu trình duyệt chặn popup,
cho phép popup cho trang đang dùng rồi thử lại.

Chưa thao tác được hộp thoại in hệ điều hành trong headless. URL public của iframe
được ánh xạ tới Nginx nội bộ trong bài kiểm thử, nên chưa xác minh đường đi qua
proxy/TLS công khai. API dùng mock: chưa kiểm tra ghi vào storage SMB/FTP/GDrive
thật; nhánh lưu XML không bị sửa.
