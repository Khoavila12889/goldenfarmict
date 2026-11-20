# Module "Chấm công Zalo & WhatsApp" (key: attendance)

Dashboard tổng hợp dữ liệu từ hai module nguồn — `wa_records` (WhatsApp /
Hermes) và `zalo_records` (Zalo / zalo-personal-bot) — trình bày **dạng
chấm công** để xem và xuất thống kê. Thêm 2026-11-20 theo yêu cầu chủ hệ
thống. Trang: `/attendance` (menu "Chấm công Zalo & WhatsApp", chỉ admin
thấy mặc định; cấp thêm qua Phân quyền — module `attendance`).

## Cách tổ chức dữ liệu

- **Tổng hợp chấm công** (`GET /api/attendance/summary`): mỗi dòng = một
  nhân viên × một ngày × một group × một nguồn. Ngày tính theo
  Asia/Ho_Chi_Minh từ `created_at`. Chỉ tính các loại sự kiện chấm công:
  `checkin`, `checkout`, `vitri` (tin chia sẻ vị trí phía Zalo). Cột: sự
  kiện đầu ngày + loại, sự kiện cuối ngày + loại, mốc check-in đầu tiên,
  mốc check-out cuối, tổng số sự kiện (kèm tách CI/CO/Vị trí), địa điểm
  (`place` trích từ tin chữ). Bản ghi `status='huy'` bị loại.
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

- `ChamCong`: Ngày, Nguồn, Group, Nhân viên, Sự kiện đầu + Loại đầu,
  Sự kiện cuối + Loại cuối, Check-in đầu tiên, Check-out cuối,
  Số sự kiện (CI/CO/Vị trí), Địa điểm. Giờ theo Asia/Ho_Chi_Minh.
- `SuKien`: Thời gian, Nguồn, Group, Nhân viên, Loại, Tiêu đề/Nội dung,
  Địa điểm, Toạ độ, Trạng thái.

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
