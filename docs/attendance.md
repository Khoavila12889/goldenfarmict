# Module "Chấm công Zalo & WhatsApp" (key: attendance)

Dashboard tổng hợp dữ liệu từ hai module nguồn — `wa_records` (WhatsApp /
Hermes) và `zalo_records` (Zalo / zalo-personal-bot) — trình bày **dạng
chấm công** để xem và xuất thống kê. Thêm 2026-11-20 theo yêu cầu chủ hệ
thống. Trang: `/attendance` (menu "Chấm công Zalo & WhatsApp", chỉ admin
thấy mặc định; cấp thêm qua Phân quyền — module `attendance`).

## Cách tổ chức dữ liệu

Giờ giấc tính theo **giờ gửi tin gốc** `msg_at` khi có (Zalo: bot đính kèm
từ `data.ts`; bản ghi cũ được backfill từ timestamp trong tên file outbox),
thiếu thì lùi về `created_at` (giờ relay nạp tin, theo đợt ~1 phút — kém
chính xác, chỉ còn ở bản ghi WhatsApp cũ/bản ghi lỗi).

- **Tổng hợp chấm công** (`GET /api/attendance/summary`): mỗi dòng = một
  nhân viên × một ngày × một group × một nguồn. Ngày tính theo
  Asia/Ho_Chi_Minh từ `created_at`. Chỉ tính các loại sự kiện chấm công:
  `checkin`, `checkout`, `vitri` (tin chia sẻ vị trí phía Zalo).
  **Quy tắc giờ IN/OUT (chốt 2026-11-20): mỗi user trong ngày có đúng một
  giờ IN và một giờ OUT** — IN là tín hiệu chấm công đầu tiên trong ngày
  (check-in chữ hoặc vị trí đầu tiên), OUT là tín hiệu cuối cùng (check-out
  chữ hoặc vị trí cuối); loại tín hiệu luôn hiển thị kèm giờ. Thống kê có
  thêm Thời gian = OUT − IN (`duration_minutes`), tổng số sự kiện (tách
  CI/CO/Vị trí) và địa điểm (`place` trích từ tin chữ). Bản ghi
  `status='huy'` bị loại.
- **Chi tiết sự kiện** (`GET /api/attendance/events`): toàn bộ bản ghi hai
  nguồn (mọi loại, gồm `datlich`/`baocao`/`thongbao`), mới nhất trước.
- **Danh sách group** (`GET /api/attendance/groups`): group theo nguồn +
  số bản ghi — nuôi bộ lọc group của trang.
- Bộ lọc dùng chung: `source` (zalo|whatsapp), `group_name`, `q` (tìm
  trong người gửi/tiêu đề/nội dung/địa điểm), `date_from`, `date_to`
  (ngày VN), riêng events có thêm `types` (phẩy, thuộc
  datlich|checkin|baocao|checkout|thongbao|vitri). Phân trang
  `page`/`page_size` (tối đa 100).

## Xuất Excel

`GET /api/attendance/export.xlsx` — theo đúng bộ lọc đang chọn, tối đa
10.000 dòng mỗi phần. Hai sheet:

- `ChamCong`: Ngày, Nhân viên, Giờ IN + Loại IN, Giờ OUT + Loại OUT,
  Thời gian (giờ:phút), Số sự kiện (CI/CO/Vị trí), Địa điểm. Giờ theo
  Asia/Ho_Chi_Minh. Không có cột Nguồn/Group —
  group đang lọc nằm ở dòng phạm vi đầu sheet (chủ hệ thống yêu cầu
  2026-11-20: nguồn/group hiển thị ở tiêu đề trang, không lặp theo dòng).
- `SuKien`: Thời gian, Nhân viên, Loại, Tiêu đề/Nội dung, Địa điểm,
  Toạ độ, Trạng thái.

Style openpyxl như export module Công việc (todos). Tên file:
`cham-cong-<date_from>-<date_to>.xlsx`.

## Mã nguồn

- Backend: `backend/app/routers/attendance.py` (UNION hai bảng, không
  nhân bản dữ liệu; đăng ký trong `backend/main.py`, quyền mặc định +
  danh mục module trong `backend/app/routers/auth.py`).
- Frontend: `frontend/src/pages/Attendance.jsx` + `Attendance.css`
  (CSS kế thừa khuôn `ZaloRecords.css`, tiền tố `at-`), gọi API qua
  `frontend/src/services/api.js`, route + menu trong `App.jsx` /
  `components/Layout.jsx`.
