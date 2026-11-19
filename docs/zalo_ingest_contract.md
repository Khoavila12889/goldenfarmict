# Hợp đồng ingest — Bot Zalo cá nhân → module "Thông báo Zalo"

Bot Zalo cá nhân (`/home/zalo-personal-bot`, thư viện không chính thức zca-js,
đăng nhập bằng tài khoản Zalo cá nhân của chủ hệ thống) có một nhánh **bắt tin
thụ động**: tin nhắn trong các group thuộc danh sách bắt tin được phân loại
bằng LLM; nếu là **thông báo chính thức** thì ghi thành bản ghi tại module
**Thông báo Zalo** (route `/zalo-records`, module key `zalo-records`; quyền
xem/sửa do trang Phân quyền quyết định — giai đoạn phát triển chỉ cấp cho
admin). Người dùng xem/quản lý các bản ghi tại trang đó. Khác phía WhatsApp:
**không có định tuyến đăng thẳng Dashboard** — mọi thông báo đều vào module
chờ admin xem.

## Endpoint

```
POST /api/zalo-records/ingest
```

- Base URL phía relay (cùng server): `http://localhost:8000`.
- Xác thực: header `X-Bot-Secret: <secret>` — secret nằm trong file
  `.env.zalo` ở thư mục gốc của app trên server (biến `ZALO_BOT_SECRET`,
  chmod 600, KHÔNG nằm trong git; nạp vào container backend qua `env_file`
  trong docker-compose.yml, cạnh `.env.wa`). Tuyệt đối không ghi secret vào
  file này hay vào repo.
- Endpoint này KHÔNG chấp nhận session người dùng (X-User-*); chỉ bot-secret.
- Nếu server chưa cấu hình secret: trả `503`.
- **Idempotent theo `msg_id`**: cột `msg_id` có ràng buộc UNIQUE. Gửi lại
  cùng một `msg_id` → trả `200` kèm id của dòng đã có và cờ
  `"duplicate": true`, KHÔNG tạo bản ghi trùng. Relay coi đó là thành công.

## JSON body

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `record_type` | string | ✔ | v1 chỉ chấp nhận `thongbao` |
| `title` | string | ✔ | Tiêu đề thông báo — dòng tiêu đề/dòng đầu của tin hoặc tóm tắt ngắn trung thực. Thiếu/rỗng → `400` |
| `content` | string | ✔ | Toàn văn tin nhắn nguyên văn. Thiếu/rỗng → `400` |
| `sender_name` | string | | Tên hiển thị Zalo của người gửi (`dName` của sự kiện tin) |
| `sender_id` | string | | Zalo user id của người gửi (`uidFrom`) — định danh ổn định phía Zalo |
| `sender_phone` | string | | Sự kiện tin của zca-js **không** cung cấp số điện thoại → bot bỏ trống trường này, không bao giờ bịa |
| `group_name` | string | | Tên group Zalo nguồn (bot tra từ snapshot/API) |
| `group_id` | string | | ID group Zalo nguồn (`threadId`) |
| `raw_message` | string | | Nguyên văn tin nhắn gốc trong group (phục vụ đối chiếu) |
| `msg_id` | string | | ID tin nhắn Zalo (`msgId`) — khóa chống trùng hai lớp (bot + DB) |
| `source` | string | | Mặc định `zalo-bot` |

Ví dụ:

```json
{
  "record_type": "thongbao",
  "title": "THÔNG BÁO NGHỈ LỄ 2/9",
  "content": "THÔNG BÁO NGHỈ LỄ 2/9\nKính gửi toàn thể CBNV, công ty nghỉ lễ Quốc khánh từ ngày 01/09 đến hết ngày 02/09.",
  "sender_name": "Nguyen Van A",
  "sender_id": "1234567890123456789",
  "group_name": "Group GOLDEN FARM",
  "group_id": "851154979834534050",
  "raw_message": "THÔNG BÁO NGHỈ LỄ 2/9\nKính gửi toàn thể CBNV, công ty nghỉ lễ Quốc khánh từ ngày 01/09 đến hết ngày 02/09.",
  "msg_id": "1234567890",
  "source": "zalo-bot"
}
```

## Phản hồi

- `200`: `{"success": true, "id": <id bản ghi>}`; nếu trùng `msg_id`:
  `{"success": true, "id": <id bản ghi đã có>, "duplicate": true}`.
- `400`: dữ liệu không hợp lệ (`record_type` khác `thongbao`, thiếu/rỗng
  `title` hoặc `content`). Body: `{"detail": "..."}`.
- `401`: thiếu hoặc sai `X-Bot-Secret`.
- `503`: server chưa cấu hình `ZALO_BOT_SECRET`.

## Đường vận chuyển (bot → file → relay → ingest)

Bot KHÔNG gọi endpoint trực tiếp và nhánh bắt tin KHÔNG bao giờ gửi/trả
lời/phản ứng bất kỳ tin Zalo nào.

1. Nhánh bắt tin (`src/capture/zalo-capture.js` trong `/home/zalo-personal-bot`)
   chạy bên trong tiến trình bot, móc vào sự kiện tin nhắn TRƯỚC bộ lọc lệnh
   `!`: chỉ xét tin group thuộc `ZALO_CAPTURE_GROUPS` (biến trong `.env` của
   bot), bỏ qua tin của chính tài khoản và tin bắt đầu bằng `!`. Phân loại
   "thông báo chính thức" bằng LLM qua 9Router (cùng tích hợp các lệnh
   `!chat` của bot dùng; model cấu hình ở `ZALO_CAPTURE_MODEL`) theo chuẩn
   precision-first — nghi ngờ thì BỎ QUA, lỗi LLM thì không ghi gì
   (fail-closed). Mỗi quyết định được ghi metadata (msg_id, group, người
   gửi, kết luận, tiêu đề) vào `zalo-capture.log` cạnh bot — không ghi nội
   dung tin.
2. Thông báo đạt chuẩn → ghi MỘT file JSON (đúng các trường ở bảng trên,
   tên `zalo-<yyyymmddHHMMSS>-thongbao-<4 số>.json`) vào
   `/home/zalo-personal-bot/zalo-outbox/`. Bot chống trùng bằng file
   `zalo-capture-seen.json` (danh sách msg_id đã xử lý, tối đa 5.000 mục).
3. Dịch vụ `gf-zalo-relay` (systemd timer, mỗi 1 phút, script
   `/usr/local/sbin/gf-zalo-relay.py`; bản nguồn trong `tools/zalo-relay/`
   của repo này) quét thư mục, POST từng file tới endpoint ingest với header
   `X-Bot-Secret` (đọc từ `.env.zalo`, không ghi vào log). Thành công (200,
   kể cả `duplicate: true`): file chuyển vào `zalo-outbox/sent/`. Thất bại:
   giữ nguyên file, ghi log `/var/log/gf-zalo-relay.log`, thử lại ở lần chạy
   sau; sau 10 lần thất bại file chuyển vào `zalo-outbox/failed/` và bắn
   cảnh báo GF ALERT (cùng file cấu hình `/etc/gf-wa-relay-alert.conf` với
   relay WhatsApp; chưa cấu hình webhook thì chỉ ghi log).

## Phía app (tham khảo)

- `GET /api/zalo-records?record_type=&status=&q=&date_from=&date_to=&page=&page_size=`
  → `{"data": [...], "total": n, "page": p, "page_size": s}` (mới nhất trước).
- `GET /api/zalo-records/{id}` → `{"data": {...}}`
- `PATCH /api/zalo-records/{id}/status` body `{"status": "moi" | "daxuly" | "huy"}`
- Ba endpoint trên dùng session X-User-* và yêu cầu quyền module
  `zalo-records` (xem cần `can_view`, sửa cần `can_edit`, admin luôn được
  phép; hàng `role_permissions`: admin 1/1, head/deputy/user 0/0).
- Trạng thái: `moi` (mới) · `daxuly` (đã xử lý) · `huy` (đã hủy).
- Bảng dữ liệu: `zalo_records` (migration
  `backend/migrations/20261119_zalo_records.sql`).
