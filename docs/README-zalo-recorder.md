# Thông báo Zalo — bot Zalo cá nhân → module GoldenFarmICT

Tài liệu tổng hợp hệ thống **bắt thông báo chính thức từ group Zalo** vào
module **Thông báo Zalo** của GoldenFarmICT, xây ngày 2026-11-19. Đây là hệ
song sinh của hệ WhatsApp (xem `docs/README-whatsapp-recorder.md`), nhưng
nguồn tin là **bot Zalo cá nhân có sẵn** của chủ hệ thống — không dựng thêm
tiến trình nghe lén thứ hai.

> ⚠️ **Rủi ro nền tảng (đọc trước):** bot dùng **zca-js — API Zalo Web không
> chính thức** — đăng nhập bằng **tài khoản Zalo cá nhân của chủ hệ thống**.
> Zalo có thể hạn chế/khóa tài khoản dùng API không chính thức bất cứ lúc
> nào; phiên đăng nhập nằm trong `credentials.json` của bot (mode 600).
> Toàn bộ thiết kế dưới đây giữ nguyên tắc: **chỉ MỘT listener duy nhất**
> trên tài khoản, nhánh bắt tin **hoàn toàn thụ động** (không gửi/trả
> lời/phản ứng bất kỳ tin nào), và **không đụng** vào hai chức năng đang
> chạy thật của bot: thông báo đơn hàng mới và hệ lệnh `!`.

---

## 1. Kiến trúc tổng thể

```
Group Zalo (trong ZALO_CAPTURE_GROUPS)
        │  sự kiện message (zca-js listener — tiến trình bot sẵn có)
        ▼
/home/zalo-personal-bot  (Node, systemd: zalo-personal-bot.service)
  ├─ (gốc) thông báo ĐƠN HÀNG MỚI mỗi 60s → group "Bot GF TEST api"
  ├─ (gốc) hệ lệnh !  (!don/!kh/!sp/!ai/!db/!vps/…)
  └─ (mới) src/capture/zalo-capture.js — nhánh bắt tin THỤ ĐỘNG
        │  phân loại LLM (9Router) → chỉ "thông báo chính thức"
        ▼  ghi 1 file JSON / thông báo
/home/zalo-personal-bot/zalo-outbox/  (+ sent/, failed/)
        │  gf-zalo-relay.timer (mỗi 1 phút, root)
        ▼  POST + X-Bot-Secret (đọc từ .env.zalo)
POST /api/zalo-records/ingest  →  bảng zalo_records
        ▼
Trang "Thông báo Zalo" (/zalo-records) — admin xem/xử lý
```

Ba lớp chống trùng: (1) bot bỏ qua msg_id đã xử lý (file seen), (2) ingest
idempotent theo `msg_id` UNIQUE ở DB, (3) relay coi `duplicate: true` là
thành công.

## 2. Dedupe — dẹp hai tiến trình chạy trùng (2026-11-19)

Khi khảo sát (2026-11-19), tài khoản Zalo bị nghe bởi **HAI** unit systemd
chạy cùng một thư mục/mã nguồn/phiên đăng nhập từ 2026-10-29 —
`zalo-bot.service` (PID 1105) và `zalo-personal-bot.service` (PID 1164) —
đúng điều README gốc của dự án bot cấm ("chỉ chạy một listener Zalo Web
trên cùng tài khoản"): nguy cơ thông báo/lệnh trả lời trùng và tranh chấp
phiên.

Đã xử lý:

- **Giữ `zalo-personal-bot.service`** — tên khớp thư mục dự án
  `/home/zalo-personal-bot`, unit được tăng cường tốt hơn (chờ
  `network-online.target`, `KillSignal=SIGINT` khớp handler của bot,
  `UMask=0077`, `Restart=on-failure`).
- **`zalo-bot.service`: đã stop + disable** (file unit vẫn giữ nguyên trên
  đĩa, chỉ gỡ symlink kích hoạt — khôi phục được khi cần).
- Khởi động lại bản giữ **một lần, sạch**: MainPID 3731618, `NRestarts=0`,
  đúng **1** tiến trình node, log đăng nhập thành công, notifier đơn hàng
  tiếp tục chu kỳ 60 giây.

Lưu ý vận hành: notifier đơn hàng hiện thường xuyên báo
`Sales Bot API list failed: 500` — nguyên nhân ở tầng truy vấn WMS phía
`/home/sales-bot-api` ("canceling statement due to statement timeout" khi
phân trang đơn trong ngày), **có từ trước** (hàng nghìn lần từ 2026-10-29;
buổi sáng vẫn có lượt gửi đơn thành công). Việc dedupe giảm một nửa tải
truy vấn đó. Đây là việc riêng của sales-bot-api/WMS, không thuộc gói này.

## 3. Snapshot danh sách group

Ngay sau mỗi lần đăng nhập thành công, bot gọi `api.getAllGroups()` +
`api.getGroupInfo()` và ghi **`/home/zalo-personal-bot/groups.snapshot.json`**
(mode 600, chỉ ở máy chủ — không gửi đi đâu) gồm `group_id`, `name`,
`totalMember` của mọi group tài khoản tham gia (lần đầu: **80 group**).
Mục đích: (a) chủ hệ thống chọn phạm vi bắt tin từ danh sách thật;
(b) nhánh bắt tin tra tên group theo ID mà không gọi API thừa.
Lỗi ghi snapshot được nuốt trong try/catch — không bao giờ ảnh hưởng bot.

## 4. Nhánh bắt tin thụ động (`src/capture/zalo-capture.js`)

- Móc vào `api.listener.on("message")` **trước** bộ lọc lệnh `!`, chạy
  fire-and-forget trong try/catch toàn phần — không thể chặn/crash listener,
  notifier hay xử lý lệnh.
- Điều kiện xét: tin **group** (`ThreadType.Group`), **không** phải tin của
  chính tài khoản (`isSelf`), **không** bắt đầu bằng `!`, group nằm trong
  allowlist, nội dung là text, chưa từng xử lý (seen-file).
- **Allowlist:** biến `ZALO_CAPTURE_GROUPS` trong `.env` của bot (ID group,
  phân tách dấu phẩy). Khởi đầu chỉ có **4387335651004809871 — "Bot GF TEST
  api"** (group thử nghiệm 1 thành viên). Thêm group: sửa biến này rồi
  `systemctl restart zalo-personal-bot.service`.
- **Phân loại:** gọi 9Router qua đúng client sẵn có của bot
  (`src/9router/client.js`, cùng base URL + key các lệnh `!chat` dùng),
  model ở biến `ZALO_CAPTURE_MODEL`. Chuẩn **precision-first** (gương phân
  loại `thongbao` phía WhatsApp): marker "thông báo/TB:/kính gửi", lĩnh vực
  trang trọng (nghỉ lễ, họp toàn thể, quy định/chính sách, tuyển dụng,
  lương/thưởng, an toàn, bảo trì hệ thống), văn phong trang trọng, ngày
  hiệu lực, chữ ký phòng ban, văn bản có cấu trúc. Hỏi đáp/trò chuyện/đặt
  phòng họp/thông báo đơn hàng KHÔNG phải thông báo. Nghi ngờ → bỏ qua.
  Lỗi/timeout LLM → không ghi gì (fail-closed).
  - ⚠️ **Model thực tế:** `cx/gpt-5.6-sol` có trong danh sách model của
    9Router instance này nhưng route `cx/*` (Codex) **từ chối Chat
    Completions** ("model is not supported when using Codex with a
    ChatGPT account" — cả `cx/gpt-5.5` cũng vậy). Vì thế
    `ZALO_CAPTURE_MODEL=ag/gemini-3.8-flash` — model mặc định sẵn có của
    bot, đã qua harness kiểm thử 4/4 (thông báo NS thật → bắt; chat thường
    → bỏ; đặt phòng → bỏ; văn bản giống thông báo đơn hàng → bỏ).
- **Bản ghi:** một file `zalo-outbox/zalo-<yyyymmddHHMMSS>-thongbao-<4 số>.json`
  với `record_type=thongbao`, `sender_name`/`sender_id` từ sự kiện tin,
  `group_name`/`group_id`, `title` (dòng đầu/tóm tắt trung thực từ LLM),
  `content` + `raw_message` nguyên văn, `msg_id`, `source=zalo-bot`.
  Sự kiện zca-js **không có số điện thoại người gửi** → `sender_phone` bỏ
  trống, không bao giờ bịa.
- **Log quyết định:** `zalo-capture.log` cạnh bot — chỉ metadata (thời gian,
  msg_id, group, người gửi, kết luận skip/captured + lý do, tiêu đề).
  Không ghi nội dung tin nhắn.

## 5. Relay (`gf-zalo-relay`)

- `/usr/local/sbin/gf-zalo-relay.py` + `gf-zalo-relay.service`/`.timer`
  (mỗi 1 phút) — gương đúng `gf-wa-relay.py`: đọc secret trong tiến trình
  từ `/home/goldenfarmict/.env.zalo` (không in/không log), POST từng JSON
  trong `zalo-outbox/` tới `http://localhost:8000/api/zalo-records/ingest`.
- 200 → chuyển file vào `zalo-outbox/sent/`; lỗi → giữ file, đếm lần thử
  trong `/var/lib/gf-zalo-relay/state.json`, thử lại phút sau; **10 lần →
  `zalo-outbox/failed/`** + bắn **GF ALERT** dùng chung file cấu hình
  `/etc/gf-wa-relay-alert.conf` với relay WhatsApp (nội dung: "Báo động:
  Có bản ghi Zalo bị kẹt tại thư mục failed: <file>"; chưa cấu hình webhook
  thì chỉ ghi log).
- Log `/var/log/gf-zalo-relay.log` (relay tự xoay ở ~5 MB; đồng thời có
  block trong `/etc/logrotate.d/gf-hermes`: daily, giữ 7, compress,
  copytruncate).

## 6. Module app "Thông báo Zalo"

- **Bảng `zalo_records`** — migration
  `backend/migrations/20261119_zalo_records.sql`: như `wa_records` nhưng chỉ
  một loại `thongbao`, thêm `sender_id`/`group_id`, và `msg_id UNIQUE`.
- **Router** `backend/app/routers/zalo_records.py`:
  `POST /api/zalo-records/ingest` (bot-secret, idempotent — hợp đồng ở
  `docs/zalo_ingest_contract.md`), `GET /api/zalo-records` (lọc
  status/q/date_from/date_to + phân trang), `GET /{id}`,
  `PATCH /{id}/status`. Quyền theo đúng khuôn `wa_records`: admin luôn
  được; role khác cần quyền module `zalo-records` (`can_view` để đọc,
  `can_edit` để đổi trạng thái).
- **Secret:** `ZALO_BOT_SECRET` trong `/home/goldenfarmict/.env.zalo`
  (chmod 600, git-ignore bởi pattern `.env.*`), nạp qua `env_file` của
  service backend trong `docker-compose.yml` (cạnh `.env.wa`). Secret được
  sinh trên server, không qua chat/log/repo.
- **Đăng ký module (4 chạm, như wa-records):** `ALL_MODULES` + grant mặc
  định admin trong `backend/app/routers/auth.py`; `MODULE_MAP` + mục nav
  (chỉ role admin) trong `frontend/src/components/Layout.jsx`; route
  `AdminRoute requiredModule="zalo-records"` trong `frontend/src/App.jsx`;
  hàng `role_permissions`: **admin 1/1, head/deputy/user 0/0** — giai đoạn
  phát triển chỉ admin xem được, cấp thêm quyền ở trang Phân quyền.
- **Frontend** `frontend/src/pages/ZaloRecords.jsx` (+ `.css`): gương
  `WaRecords.jsx` — danh sách thẻ, badge "Thông báo", lọc trạng thái/tìm
  kiếm/khoảng ngày, modal chi tiết (nguyên văn tin, group + ID, người gửi +
  Zalo ID, msg_id) và các nút đổi trạng thái. API client:
  `getZaloRecords`/`getZaloRecord`/`updateZaloRecordStatus` trong
  `frontend/src/services/api.js`.

## 7. Kiểm thử đã chạy (2026-11-19)

- Harness phân loại (không qua Zalo): 4/4 đúng (xem §4).
- Pipeline: file `[TEST-ZALO]` vào `zalo-outbox/` → relay → DB **+1** dòng
  đủ trường, file vào `sent/`; gửi lại cùng `msg_id` → **+0**, log relay có
  `duplicate`.
- Ingest: secret sai → **401**; thiếu secret → **401**; `title` rỗng →
  **400**.
- Quyền: admin GET list → **200** (thấy bản ghi test); tài khoản head
  (10135) GET → **403**; admin PATCH trạng thái qua lại → **200**.
- Dòng `[TEST-ZALO]` (id 1) được **giữ lại** trong bảng cùng các dòng test
  khác để admin tự xóa trên giao diện.
- Bot sau mọi thay đổi: 1 listener, đăng nhập OK, notifier quay đều,
  `NRestarts=0`, không lỗi mới trong journal.

## 8. Vận hành nhanh

| Việc | Cách làm |
|---|---|
| Thêm group vào phạm vi bắt tin | Thêm ID vào `ZALO_CAPTURE_GROUPS` trong `/home/zalo-personal-bot/.env`, `systemctl restart zalo-personal-bot.service` |
| Xem danh sách group của tài khoản | `/home/zalo-personal-bot/groups.snapshot.json` (tự làm mới mỗi lần bot đăng nhập) |
| Xem quyết định bắt tin | `/home/zalo-personal-bot/zalo-capture.log` |
| Xem log relay | `/var/log/gf-zalo-relay.log`; trạng thái thử lại: `/var/lib/gf-zalo-relay/state.json` |
| File kẹt | `zalo-outbox/failed/` — sửa nguyên nhân, chuyển file về `zalo-outbox/` để relay gửi lại |
| Cấp quyền xem module | Trang Phân quyền của app, module "Thông báo Zalo" |
| Dừng bắt tin khẩn cấp | Đặt `ZALO_CAPTURE_GROUPS=` (rỗng) trong `.env` của bot rồi restart bot — hoặc dừng `gf-zalo-relay.timer` để ngừng chuyển dữ liệu vào app |

## 9. File đã đổi / sao lưu

- Bot (`/home/zalo-personal-bot`, không phải git repo → sao lưu theo mốc
  thời gian): `src/index.js.bak-20261119-zalo`,
  `.env.bak-20261119-zalo`; file mới: `src/capture/zalo-capture.js`,
  `zalo-outbox/`, `zalo-capture-seen.json`, `groups.snapshot.json`.
- App (git, branch `wordcraft-viewer-151026`): router + migration + trang
  frontend + đăng ký module + tài liệu này + `docs/zalo_ingest_contract.md`
  + bản nguồn relay ở `tools/zalo-relay/`; các file bị sửa đều có bản
  `*.bak-20261119-zalo` cạnh bên (không commit).
- Hệ thống: unit `gf-zalo-relay.service`/`.timer` (enabled),
  `/usr/local/sbin/gf-zalo-relay.py`, block logrotate trong
  `/etc/logrotate.d/gf-hermes`; `zalo-bot.service` đã disable (file unit
  giữ nguyên).
