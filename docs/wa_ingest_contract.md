# Hợp đồng ingest — Bot Hermes → module "Thông báo WhatsApp"

Bot Hermes (profile `gf-recorder`, chạy trên server nội bộ) ghi bản ghi trích từ
group WhatsApp vào GoldenFarmICT qua endpoint dưới đây. Người dùng xem/quản lý
các bản ghi tại trang **Thông báo WhatsApp** (route `/wa-records`, module key
`wa-records`, mặc định chỉ admin/head/deputy).

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
| `record_type` | string | ✔ | Một trong `datlich`, `checkin`, `baocao` |
| `title` | string | ✔* | Tiêu đề ngắn. *Ít nhất một trong `title`/`content` phải có |
| `content` | string | ✔* | Nội dung chi tiết đã trích xuất |
| `sender_name` | string | | Tên người gửi trong group |
| `sender_phone` | string | | Số điện thoại người gửi (định dạng quốc tế nếu có) |
| `group_name` | string | | Tên group WhatsApp nguồn |
| `scheduled_at` | string (ISO 8601) | | Chỉ dùng cho `datlich`. Nên kèm múi giờ, vd `2026-11-20T09:00:00+07:00` |
| `place` | string | | Địa điểm dạng chữ (kho, chi nhánh, địa chỉ...) |
| `lat` | number | ✔ với `checkin` | Vĩ độ, -90..90 |
| `lng` | number | ✔ với `checkin` | Kinh độ, -180..180 |
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

## Phản hồi

- `200`: `{"success": true, "id": <id bản ghi mới>}`
- `400`: dữ liệu không hợp lệ (thiếu `record_type`/`title`/`content`,
  `scheduled_at` sai định dạng, tọa độ ngoài khoảng, `checkin` thiếu lat/lng).
  Body: `{"detail": "..."}`.
- `401`: thiếu hoặc sai `X-Bot-Secret`.
- `503`: server chưa cấu hình `WA_BOT_SECRET`.

## Phía app (tham khảo)

- `GET /api/wa-records?record_type=&status=&q=&date_from=&date_to=&page=&page_size=`
  → `{"data": [...], "total": n, "page": p, "page_size": s}` (mới nhất trước).
- `GET /api/wa-records/{id}` → `{"data": {...}}`
- `PATCH /api/wa-records/{id}/status` body `{"status": "moi" | "daxuly" | "huy"}`
- Ba endpoint trên dùng session X-User-* và yêu cầu quyền module `wa-records`.
- Trạng thái: `moi` (mới) · `daxuly` (đã xử lý) · `huy` (đã hủy).
- Bảng dữ liệu: `wa_records` (migration `backend/migrations/20261118_wa_records.sql`).
