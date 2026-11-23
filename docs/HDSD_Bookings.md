# 📘 HƯỚNG DẪN SỬ DỤNG PHÂN HỆ ĐẶT LỊCH (BOOKINGS)

*(Dành cho người dùng cuối – End-user)*

---

## I. TỔNG QUAN

Phân hệ Đặt lịch cho phép nhân viên đặt trước và quản lý tài nguyên dùng chung: **xe công ty** và **phòng họp**. Lịch được hiển thị trực quan theo khung giờ trong ngày.

---

## II. GIAO DIỆN CHÍNH

### 1. Thanh điều hướng ngày
- Dùng nút **‹ ›** hoặc click vào ngày hiện tại để mở lịch chọn ngày khác.
- Lịch tự động mở ở ngày hôm nay.

### 2. Bộ lọc
- **Loại tài nguyên**: Xe / Phòng họp / Tất cả.
- **Trạng thái**: Đang sử dụng / Đã kết thúc.

### 3. Lưới đặt lịch
- Cột trái: khung giờ (07:00 – 19:00).
- Mỗi tài nguyên là một cột riêng.
- Booking hiển thị dưới dạng thanh màu theo khung giờ đã đặt.

---

## III. HƯỚNG DẪN THAO TÁC

### 1. Đặt lịch mới

1. Nhấn nút **Đặt lịch mới**.
2. Điền thông tin:
   - **Tài nguyên**: Chọn xe hoặc phòng họp.
   - **Mục đích**: Lý do sử dụng (bắt buộc).
   - **Ngày**: Nhập DD/MM/YYYY.
   - **Giờ**: Chọn giờ bắt đầu và giờ kết thúc.
   - **Ghi chú**: Thông tin thêm (tùy chọn).
3. Nhấn **Đặt lịch**.

### 2. Kết thúc / Hủy lịch
- Click vào booking trên lưới → chọn **Kết thúc** nếu đã dùng xong.
- Hệ thống tự động đánh dấu *Đã hết giờ* khi quá khung giờ kết thúc.

### 3. Đăng ký công tác
Chuyển tab sang **Công tác** để đăng ký lịch công tác tỉnh (xem riêng).

---

## IV. QUYỀN HẠN

| Vai trò | Quyền |
|---------|-------|
| **Admin** | Quản lý tài nguyên (thêm/xóa xe, phòng họp), xem mọi booking |
| **Nhân viên** | Đặt lịch, xem lịch của mình và đồng nghiệp |

---

## V. QUY TẮC CHỐNG TRÙNG GIỜ (áp dụng từ 2026-11-23)

Hai lịch được coi là **trùng giờ** khi: cùng một tài nguyên, cùng một ngày, cả hai đang ở trạng thái đang sử dụng (active), và khoảng giờ giao nhau — lịch mới bắt đầu trước khi lịch cũ kết thúc VÀ kết thúc sau khi lịch cũ bắt đầu. Đặt **sát giờ** nhau (một lịch kết thúc đúng lúc lịch kia bắt đầu, ví dụ đặt 13:30–14:00 sau lịch 13:00–13:30) thì **không** trùng, được đặt bình thường.

- **Trong form đặt lịch:** ngay khi chọn tài nguyên/ngày/giờ, hệ thống tự kiểm tra. Nếu trùng: hiện cảnh báo đỏ ghi rõ tên người đã đặt và khung giờ của họ, đồng thời khóa nút "Đặt lịch". Dưới ô chọn giờ có danh sách **các khung giờ đã có người đặt trong ngày** (thẻ màu đỏ, kèm tên người đặt) để chọn giờ trống trước khi gửi.
- **Phía máy chủ:** API tạo lịch cũng kiểm tra lại và từ chối lịch trùng (HTTP 409, kèm thông báo tên người và khung giờ bị trùng), nên không thể lách bằng cách gọi API trực tiếp. Giờ kết thúc phải sau giờ bắt đầu.

---

## VI. ĐẶT PHÒNG QUA GROUP WHATSAPP (tự động từ 2026-11-23)

Nhân viên chỉ cần nhắn tin đặt phòng trong group WhatsApp đặt phòng họp như bình thường (ví dụ: "Phòng Kế Toán mượn phòng họp từ 14h-15h hôm nay 23/11"). Hệ thống ghi nhận sẽ **tự động tạo lịch trong phân hệ này sau khoảng 1 phút**:

- **Phòng**: tin ghi "tầng 2" → phòng họp Tầng 2; chỉ ghi "phòng họp" → phòng họp mặc định.
- **Ngày/giờ**: lấy từ nội dung tin (giờ bắt đầu và giờ kết thúc như tin ghi).
- **Người đặt**: khớp tên nhân viên trong danh bạ nếu trùng khớp chính xác; tiêu đề lịch dạng "Mượn phòng họp — <Phòng ban>", ghi chú đính kèm nội dung tin WhatsApp và số bản ghi nguồn.

**Các trường hợp KHÔNG tự tạo lịch** — bản ghi WhatsApp được giữ ở trạng thái "Mới" trong module Thông báo WhatsApp để admin xử lý tay:

- Khung giờ **trùng** với một lịch đang có.
- Tin **hủy** lịch.
- Tin không rõ giờ kết thúc, hoặc không rõ ngày/giờ bắt đầu.

---

## VII. GHI CHÚ KỸ THUẬT (cho quản trị/phát triển)

- **Backend**: `backend/app/routers/bookings.py` — REST `/api/bookings` (GET danh sách theo ngày/loại/trạng thái, POST tạo, PUT đổi trạng thái), `/api/bookings/resources`, `/api/bookings/dates`, `/api/bookings/overlap` (trả `{overlap, conflicts[]}` gồm tên + khung giờ của các lịch trùng).
- **Chống trùng giờ phía server** nằm trong `create_booking` (commit `d2e2b2a`): so sánh giờ dạng `HH:MM` (24h, cùng ngày) — `start_time < giờ kết thúc của lịch kia AND end_time > giờ bắt đầu của lịch kia`, chỉ tính lịch `status='active'`.
- **Frontend**: `frontend/src/pages/booking/BookingPage.jsx` + `components/booking/BookingDialog.jsx` (cảnh báo trực tiếp, thẻ khung giờ đã đặt, khóa nút gửi khi trùng), `hooks/useBookings.js` (kiểm tra trùng một lần nữa trước khi POST), `services/api.js` (`checkOverlap`, `getBookings`).
- **Tự động hóa WhatsApp** nằm phía ingest: `backend/app/routers/wa_records.py`, hàm `_auto_create_booking` (commit `60c08b5`) — chạy ngay sau khi một bản ghi `datlich` được nạp; lỗi ở bước này không làm hỏng việc nạp bản ghi. Giờ kết thúc được tách từ tiêu đề/nội dung theo các mẫu `HH:MM–HH:MM`, `Xh–Xh`, `Xam/pm–Xam/pm`. Tạo lịch thành công → bản ghi WhatsApp chuyển trạng thái `daxuly`; các trường hợp ở mục VI giữ nguyên `moi`.
- **Bảng dữ liệu**: `bookings` (resource_id, title, employee_id, full_name, department, book_date dạng `YYYY-MM-DD`, start_time/end_time dạng `HH:MM`, status `active`/`finished`, notes, created_at) và `resources` (type `car`/`meeting_room`).
- **Vận hành 2026-11-23**: 3 lịch WhatsApp đầu tiên (Thiết Kế 13:00–13:30, Kế Toán 14:00–15:00, MKT 15:00–16:00) được chuyển tay trước khi bật tự động; lịch TPSG 9:30–11:30 cùng ngày được thêm tay vì tin gốc ngày 21/11 bị mất trong sự cố ghi nhận. Từ sau commit `60c08b5`, mọi lịch đặt qua WhatsApp đều tự động.
