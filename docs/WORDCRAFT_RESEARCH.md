# Thay OnlyOffice bằng WordCraft/GridCraft — nghiên cứu 15/10/2026

Branch: `wordcraft-viewer-151026` (tách từ `15092026@1ca84db`). Chỉ làm trên branch này.

## Repo tham khảo

- WordCraft: `https://github.com/storytold/wordcraft.git` — viết lại MS Word bằng pure Rust,
  12.5k star. Đọc/ghi `.docx`, import `.doc/.odt/.rtf/.html/.md`, export PDF.
  Chạy native (egui GPU) + browser qua WebAssembly (`apps/wordcraft-web`, `trunk serve`).
  License MIT/Apache-2.0. Đang **alpha**: 88% ribbon có command, tự đánh giá ~60% thay được
  Word cho việc thật.
- GridCraft: `https://github.com/storytold/gridcraft` — tương tự cho Excel, 4.9k star.
  XLSX là native format, 513/523 hàm, CLI + WASM web. Đang **alpha**, ~50% cho việc thật.
- PdfCraft: `https://github.com/storytold/pdfcraft` — đọc/sửa/sắp xếp/bảo vệ PDF bằng Rust,
  13.8k star. Xem + tìm kiếm + combine/split/protect tốt; tự nhận còn yếu Office-to-PDF
  và export Word mất layout. Thay được đúng chỗ đau hiện tại của project: preview PDF
  đang phải convert sang ảnh WebP (xem được nhưng không search/copy text).
- Cả hai đều có `*-cli convert` (docx/xlsx -> pdf/png/...) và MCP/JSON control channel.

## OnlyOffice đang dùng ở đâu (không được phá)

1. **Xem + sửa** tài liệu nội bộ: `OnlyOfficeViewer` (`frontend/src/components/OnlyOfficeViewer.jsx`)
   dùng ở `Documents.jsx`, `Todos.jsx`, Forum, `PublicSharePage.jsx`.
   Backend cấp config JWT qua `/documents/onlyoffice/config`, `/todos/onlyoffice/config`,
   `/forum/posts/.../onlyoffice/config`, `/shares/{token}/onlyoffice/config`.
2. **Convert Excel -> PDF** cho in công thức: `backend/app/routers/formulas.py`
   gọi `ConvertService.ashx` của Document Server.
3. Infra: service `onlyoffice` (`onlyoffice/documentserver:latest`) trong `docker-compose.yml`,
   JWT `ONLYOFFICE_SECRET`, proxy `/onlyoffice` ở nginx frontend.

## Kết luận: chỉ thay phần XEM, giữ OnlyOffice cho SỬA + CONVERT

- Được: dựng viewer **chỉ đọc** bằng bản web WASM của WordCraft/GridCraft (static site,
  host như frontend). Nhẹ hơn hẳn: không còn container DocumentServer nặng, không còn
  vòng JWT/callback/download server-to-server cho luồng xem. Hợp với pattern sẵn có
  của project (PDF đã xem bằng trang ảnh WebP để giảm tải DS).
- Chưa được: sửa đồng thời nhiều người, callback lưu bài, convert Excel->PDF cho phiếu
  in chính thức (CLI alpha, fidelity biểu đồ/SmartArt/pagination còn lệch Word/Excel thật).

## Kế hoạch pilot (làm dần trên branch này)

1. Build `wordcraft-web` + `gridcraft-web` release (`trunk build --release`), host thử nội bộ.
2. Thêm `CraftViewer.jsx` cạnh `OnlyOfficeViewer`: nhận signed download URL sẵn có,
   mở docx bằng WordCraft, xlsx bằng GridCraft; nút fallback "Mở bằng OnlyOffice".
3. Dùng trước cho PublicShare + xem file đính kèm chat/todo (luồng chỉ đọc).
4. So sánh fidelity trên file thật của công ty trước khi mở rộng; giữ nguyên mọi
   endpoint `*/onlyoffice/config` và `formulas.py` conversion.
