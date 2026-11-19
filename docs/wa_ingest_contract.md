# Hợp đồng ingest — Bot Hermes → module "Thông báo WhatsApp"

Bot Hermes (profile `gf-recorder`, chạy trên server nội bộ) ghi bản ghi trích từ
group WhatsApp vào GoldenFarmICT qua endpoint dưới đây. Người dùng xem/quản lý
các bản ghi tại trang **Thông báo WhatsApp** (route `/wa-records`, module key
`wa-records`; quyền xem/sửa do trang Phân quyền quyết định — giai đoạn phát
triển chỉ cấp cho admin).

## Endpoint

```
POST /api/wa-records/ingest
```

- Base URL phía bot (cùng server): `http://localhost:8000` (hoặc qua frontend
  proxy nếu cần).
- Xác thực: header `X-Bot-Secret: <secret>` — secret nằm trong file `.env.wa`
  ở thư mục gốc của app trên server (biến `WA_BOT_SECRET`, chmod 600, KHÔNG
  nằm trong git). Tuyệt đối không ghi secret vào file này hay vào repo.
- Endpoint này KHÔNG chấp nhận session người dùng (X-User-*); chỉ bot-secret.
- Nếu server chưa cấu hình secret: trả `503`.

## JSON body

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `record_type` | string | ✔ | Một trong `datlich`, `checkin`, `checkout`, `baocao` (lưu vào `wa_records`). Bot Hermes dùng 3 loại đầu (đặt phòng họp / vào phòng / trả phòng); `baocao` giữ trong schema, bot không dùng. **Ngoại lệ:** `thongbao` cũng được ingest chấp nhận nhưng KHÔNG lưu vào `wa_records` — xem mục riêng bên dưới |
| `title` | string | ✔* | Tiêu đề ngắn. *Ít nhất một trong `title`/`content` phải có |
| `content` | string | ✔* | Nội dung chi tiết đã trích xuất |
| `sender_name` | string | | Tên người gửi trong group |
| `sender_phone` | string | | Số điện thoại người gửi (định dạng quốc tế nếu có) |
| `group_name` | string | | Tên group WhatsApp nguồn |
| `scheduled_at` | string (ISO 8601) | | Chỉ dùng cho `datlich`. Nên kèm múi giờ, vd `2026-11-20T09:00:00+07:00` |
| `place` | string | | Địa điểm dạng chữ (kho, chi nhánh, địa chỉ...) |
| `lat` | number | | Vĩ độ, -90..90. Tùy chọn — check-in/check-out phòng họp không có GPS; nếu gửi kèm sẽ được kiểm tra khoảng |
| `lng` | number | | Kinh độ, -180..180. Tùy chọn như `lat` |
| `raw_message` | string | | Nguyên văn tin nhắn gốc trong group (phục vụ đối chiếu) |
| `source` | string | | Mặc định `hermes`; để trống nếu không chắc |

## Ví dụ

Đặt lịch:

```json
{
  "record_type": "datlich",
  "title": "Giao hàng siêu thị ABC",
  "content": "Giao 20 thùng sữa cho siêu thị ABC, liên hệ chị Lan",
  "sender_name": "Nguyen Van A",
  "sender_phone": "84901234567",
  "group_name": "KD - Sieu thi",
  "scheduled_at": "2026-11-20T09:00:00+07:00",
  "place": "Kho B",
  "raw_message": "mai 9h giao 20 thung sua sieu thi ABC kho B nha"
}
```

Check-in:

```json
{
  "record_type": "checkin",
  "title": "Check-in kho B",
  "content": "Đã tới kho B nhận hàng",
  "sender_name": "Tran Van B",
  "sender_phone": "84907654321",
  "group_name": "Kho van",
  "place": "Kho B",
  "lat": 10.762622,
  "lng": 106.660172,
  "raw_message": "da toi kho B"
}
```

Báo cáo:

```json
{
  "record_type": "baocao",
  "title": "Xe nâng kho A hỏng",
  "content": "Xe nâng số 2 không khởi động được, cần bảo trì",
  "sender_name": "Le Van C",
  "group_name": "Ky thuat",
  "raw_message": "xe nang so 2 kho A hong roi"
}
```

Check-out (trả phòng họp — không có tọa độ):

```json
{
  "record_type": "checkout",
  "title": "Check-out phòng họp tầng 2 — Nguyen Van A",
  "content": "PNS trả phòng họp tầng 2, kết thúc lúc 10:30",
  "sender_name": "Nguyen Van A",
  "group_name": "GROUP GOLDEN FARM - VP (Không có NV Tỉnh)",
  "place": "Phòng họp tầng 2",
  "raw_message": "PNS trả phòng họp tầng 2 rồi ạ"
}
```

## Loại `thongbao` — đăng thẳng lên bảng Thông báo Dashboard

Từ 2026-11-19 (quyết định của chủ hệ thống: đăng thẳng, **không qua duyệt**),
ingest chấp nhận thêm `record_type = "thongbao"` và rẽ nhánh: thay vì ghi vào
`wa_records`, nó tạo một bài trong bảng **`forum_posts`** — chính là bảng
Thông báo (Forum) hiện trên Dashboard của app. CHECK của `wa_records` giữ
nguyên 4 loại cũ; `thongbao` không bao giờ xuất hiện trong module
"Thông báo WhatsApp".

Ánh xạ trường (payload → `forum_posts`):

| Payload | `forum_posts` | Ghi chú |
|---|---|---|
| `title` | `title` | **Bắt buộc, không được rỗng** — thiếu/rỗng trả `400` |
| `content` | `content` | Trống thì dùng `raw_message` |
| `sender_name` | `author_name` | Ghi thành `WhatsApp · <sender_name>` (cắt an toàn ở 255 ký tự); thiếu tên thì chỉ ghi `WhatsApp` |
| — | `author_code` | Luôn là `wa-bot` (cột không có FK — dùng để nhận diện nguồn) |
| — | `target_type` / `target_value` | Luôn `all` / `''` — hiện cho toàn công ty |
| — | `is_pinned`, đính kèm | `0`; `attachment_*` rỗng/`0` |
| — | `created_at` / `updated_at` | `CURRENT_TIMESTAMP`, giống hệt `forum.py` |

Sau khi insert, ingest bắn sự kiện realtime `forum_post_added` (đúng lời gọi
của `forum.py`) để các Dashboard đang mở tự cập nhật. Bài đăng là bài forum
thường: admin sửa/xóa được trên Dashboard; người dùng bình luận được như mọi
thông báo. Truy vết nguồn (người gửi, group, nguyên văn tin) nằm ở file JSON
gốc mà relay lưu trong `wa-outbox/sent/` sau khi ingest trả 200.

Phía bot (skill `wa-room-recorder` ≥ 1.2.0): chỉ phân loại `thongbao` cho
thông báo **chính thức** theo chuẩn precision-first (marker "thông báo"/"kính
gửi", lĩnh vực trang trọng như nghỉ lễ/quy định/tuyển dụng, ngày hiệu lực,
ký tên phòng ban…); nghi ngờ thì bỏ qua. `title` là dòng tiêu đề/dòng đầu
của tin (hoặc tóm tắt ngắn trung thực), `content` là **toàn văn tin nguyên
văn**. Không gửi `scheduled_at`/`place`/tọa độ cho loại này.

Ví dụ:

```json
{
  "record_type": "thongbao",
  "title": "THÔNG BÁO NGHỈ LỄ 2/9",
  "content": "THÔNG BÁO NGHỈ LỄ 2/9\nKính gửi toàn thể CBNV, công ty nghỉ lễ Quốc khánh từ ngày 01/09 đến hết ngày 02/09.",
  "sender_name": "Nguyen Van A",
  "group_name": "GROUP GOLDEN FARM",
  "raw_message": "THÔNG BÁO NGHỈ LỄ 2/9\nKính gửi toàn thể CBNV, công ty nghỉ lễ Quốc khánh từ ngày 01/09 đến hết ngày 02/09.",
  "source": "hermes"
}
```

Phản hồi cho `thongbao`: `200` với
`{"success": true, "id": <id bài forum>, "forum_post_id": <id bài forum>}`
(relay coi như ingest thường: 200 → chuyển file vào `sent/`).

## Phản hồi

- `200`: `{"success": true, "id": <id bản ghi mới>}` (với `thongbao`: id của
  bài forum + thêm trường `forum_post_id`, xem mục riêng ở trên)
- `400`: dữ liệu không hợp lệ (thiếu `record_type`/`title`/`content`,
  `scheduled_at` sai định dạng, tọa độ ngoài khoảng; riêng `thongbao`:
  thiếu/rỗng `title`).
  Body: `{"detail": "..."}`.
- `401`: thiếu hoặc sai `X-Bot-Secret`.
- `503`: server chưa cấu hình `WA_BOT_SECRET`.

## Đường vận chuyển (file → relay → ingest)

Bot Hermes KHÔNG gọi endpoint trực tiếp và KHÔNG bao giờ gửi tin WhatsApp.
Luồng ghi thực tế:

1. Skill `wa-room-recorder` của profile `gf-recorder` trích xuất bản ghi từ
   group pilot (JID `120363421346130787@g.us`) và ghi MỖI bản ghi thành MỘT
   file JSON (đúng các trường ở bảng trên) vào thư mục
   `/home/hermes/.hermes/profiles/gf-recorder/workspace/wa-outbox/`.
2. Dịch vụ `gf-wa-relay` (systemd timer, mỗi 1 phút, script
   `/usr/local/sbin/gf-wa-relay.py`; bản nguồn trong `tools/wa-relay/` của
   repo này) quét thư mục, POST từng file tới endpoint ingest với header
   `X-Bot-Secret` (đọc từ `.env.wa`, không ghi vào log). Thành công (200):
   file chuyển vào `wa-outbox/sent/`. Thất bại: giữ nguyên file, ghi log
   `/var/log/gf-wa-relay.log`, thử lại ở lần chạy sau; sau 10 lần thất bại
   file chuyển vào `wa-outbox/failed/` để xem tay.

## Phía app (tham khảo)

- `GET /api/wa-records?record_type=&status=&q=&date_from=&date_to=&page=&page_size=`
  → `{"data": [...], "total": n, "page": p, "page_size": s}` (mới nhất trước).
- `GET /api/wa-records/{id}` → `{"data": {...}}`
- `PATCH /api/wa-records/{id}/status` body `{"status": "moi" | "daxuly" | "huy"}`
- Ba endpoint trên dùng session X-User-* và yêu cầu quyền module `wa-records`.
- Trạng thái: `moi` (mới) · `daxuly` (đã xử lý) · `huy` (đã hủy).
- Bảng dữ liệu: `wa_records` (migration `backend/migrations/20261118_wa_records.sql`).
