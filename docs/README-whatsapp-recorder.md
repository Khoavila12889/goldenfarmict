# README TỔNG HỢP — Bot Hermes ghi nhận WhatsApp (Golden Farm)

> Tài liệu cơ chế + quy trình vận hành của hệ thống bot ghi nhận đăng ký phòng họp,
> check-in, check-out từ group WhatsApp vào app GoldenFarmICT.
> Mọi thông số trong tài liệu này đã được đối chiếu trực tiếp với server thật
> ngày **2026-11-19** (lần kiểm tra gần nhất ~14:05). Không có giá trị bí mật
> (API key, bot secret) nào được ghi trong tài liệu này — chỉ ghi nơi chúng nằm.
>
> Bản sao của tài liệu này nằm ở 3 nơi:
> 1. `~/workspace/hermes_phase0/README-tong-hop-whatsapp-recorder.md` (máy trạm của trợ lý)
> 2. `/home/goldenfarmict/docs/README-whatsapp-recorder.md` (repo app, branch `wordcraft-viewer-151026`)
> 3. `/home/hermes/.hermes/profiles/gf-recorder/workspace/README-whatsapp-recorder.md` (cạnh ghi chú vận hành `OPS-WHATSAPP-RECORDER.md`)

---

## 1. Tổng quan

### 1.1. Mục đích

Trong group WhatsApp của văn phòng, các phòng ban đăng tin mượn phòng họp,
check-in khi vào phòng và check-out khi trả phòng bằng văn phong rất tự do
(ví dụ: *"PNS mượn phòng họp tầng 2 từ 10h - 10h30 ạ"*). Trước đây không ai
tổng hợp lại các tin này.

Hệ thống này dùng **Hermes Agent** (tác tử AI mã nguồn mở của Nous Research)
ghép nối vào WhatsApp qua cầu nối Baileys, **nghe 3 group trong phạm vi cho phép**,
tự phân loại các tin liên quan và ghi thành bản ghi có cấu trúc vào module
**"Thông báo WhatsApp"** của app GoldenFarmICT để admin theo dõi/xử lý.
Riêng **thông báo chính thức** (`thongbao`) được **định tuyến theo người
gửi**: chỉ thông báo từ **Nhung Nhân sự** mới **đăng thẳng lên bảng Thông
báo trên Dashboard** cho toàn công ty — không qua bước duyệt; thông báo từ
mọi người khác vào module "Thông báo WhatsApp" chờ admin duyệt (quyết định
của chủ hệ thống ngày 2026-11-19, mang tính "tạm" — mục 3.6).

### 1.2. Phạm vi thu thập — 4 loại bản ghi

| Loại | Ý nghĩa | Đích đến |
|---|---|---|
| `datlich` | Đăng ký / mượn phòng họp (kèm hủy đặt phòng — xem mục 3.4) | Module "Thông báo WhatsApp" (`wa_records`) |
| `checkin` | Vào phòng / bắt đầu sử dụng phòng họp | Module "Thông báo WhatsApp" (`wa_records`) |
| `checkout` | Trả phòng / họp xong, phòng trống | Module "Thông báo WhatsApp" (`wa_records`) |
| `thongbao` | Thông báo chính thức gửi toàn thể nhân viên (nghỉ lễ, họp toàn thể, quy định mới…) | Theo người gửi: **Nhung Nhân sự** → **Bảng Thông báo Dashboard** (`forum_posts`) — đăng thẳng, không duyệt; **mọi người khác** → Module "Thông báo WhatsApp" (`wa_records`) chờ admin duyệt |

Mọi tin khác trong group (trò chuyện, hỏi đáp, nhắc việc lặt vặt, thông báo
không đạt chuẩn trang trọng ở mục 3.4…) đều bị bỏ qua lặng lẽ. Báo cáo chung
chung (`baocao`) **không** nằm trong phạm vi — loại này vẫn tồn tại trong
schema của app nhưng bot không bao giờ tạo.

### 1.3. Các quyết định thiết kế chính (và lý do)

| Quyết định | Lý do |
|---|---|
| **Dùng số WhatsApp chính** của chủ tài khoản để ghép nối (quyết định của chủ tài khoản ngày 2026-11-19, sau khi đã được trình bày rủi ro) | Các group cần ghi đã có sẵn số này là thành viên; không cần thêm số mới vào group |
| **Bot im lặng tuyệt đối** — không bao giờ gửi bất kỳ tin WhatsApp nào (không xác nhận, không hỏi lại, không nhắc, không tổng hợp vào group) | Bot chỉ là thiết bị thu thập; mọi hiển thị/xử lý diễn ra trong app. Đây cũng là cơ sở để chấp nhận dùng số chính |
| **Nghe tất cả tin trong các group thuộc phạm vi rồi tự lọc** (không yêu cầu @mention) | Nhân viên giữ thói quen nhắn tự nhiên như cũ, không phải học cú pháp mới |
| **Ghi thẳng vào GoldenFarmICT**, không qua Google Sheet | Dữ liệu nằm trong hệ thống nội bộ, dùng chung cơ chế phân quyền sẵn có |
| **Bot không có công cụ mạng/thực thi** — nó chỉ ghi file JSON; một relay độc lập phía server đẩy file vào app | Thu hẹp bề mặt rủi ro: kể cả khi agent bị lừa bởi nội dung tin nhắn, nó cũng không tự gọi được API hay chạy lệnh |
| **Khóa phạm vi ở nhiều lớp** (cấu hình bridge + allowlist JID + skill) | Chỉ đúng các group trong allowlist (hiện 3 group) được xử lý; DM và group khác bị loại ngay ở cổng |
| **Chốt chặn gửi tin ở tầng code** (ngoài cấu hình và chỉ thị trong skill) | Hermes v0.23.2 không có công tắc "chỉ nghe" ở tầng cấu hình — chốt code là lớp đảm bảo cứng duy nhất (mục 3.3) |
| **Thông báo đăng thẳng lên Dashboard chỉ dành cho một người gửi** — Nhung Nhân sự (quyết định của chủ hệ thống ngày 2026-11-19 15:46, mang tính "tạm"; thay cho quyết định đăng-thẳng-cho-mọi-người ban sáng cùng ngày). Mọi thông báo khác vào module chờ admin duyệt | Thông báo của Nhân sự cần tới nhân viên ngay như khi đăng trong group; các nguồn khác chưa đủ tin cậy để bỏ qua bước duyệt. Giảm thiểu rủi ro đăng nhầm thêm bằng phân loại "precision-first" trong skill — nghi ngờ thì bỏ qua, không đăng (mục 3.4). Định tuyến theo số điện thoại người gửi, cấu hình bằng biến `WA_ANNOUNCE_DIRECT_PHONES` (mục 3.6) |
| **Đặt bot trên server nội bộ GoldenFarmICT** (không phải VPS) | Cùng máy với app đích; máy đã có sẵn Node; VPS chật đĩa hơn |

### 1.4. Rủi ro còn lại (đã biết và chấp nhận)

- Cầu nối Baileys là đường **không chính thức** (WhatsApp Web) → luôn tồn tại
  nguy cơ bị WhatsApp khóa số. Cơ chế im lặng + chỉ nghe làm giảm bề mặt rủi ro
  nhưng không triệt tiêu. Nút ngắt khẩn cấp: mục 4.8.
- Server nội bộ **chật RAM** (tổng ~7,7 GB, ~30 container; lúc kiểm tra chỉ còn
  ~2,2 GB available) — gateway của bot dùng ~310–340 MB, cần để mắt tuần đầu.
- Phiên WhatsApp là một **thiết bị liên kết** trên tài khoản chính: về nguyên
  tắc phiên nhìn thấy mọi cuộc trò chuyện của tài khoản; việc thu hẹp nằm ở
  cấu hình xử lý (chỉ 3 group trong phạm vi) + profile bị khóa công cụ (mục 5).

---

## 2. Sơ đồ kiến trúc

```
                          SERVER NỘI BỘ GOLDEN FARM (AlmaLinux, LAN 10.0.0.114, Tailscale 100.71.228.86)
                          ┌────────────────────────────────────────────────────────────────────────────────┐
                          │                                                                                │
 [Group WhatsApp]         │   [Hermes Agent v0.23.2 — cài trực tiếp trên host, user `hermes`]              │
  3 group trong phạm vi:  │    ┌──────────────────┐   WebSocket    ┌───────────────────────────────┐      │
  - VP (Không có NV Tỉnh) │    │ Bridge Baileys   │◄──────────────►│ WhatsApp (thiết bị liên kết  │      │
  - GOLDEN FARM           │    │ bridge.js        │   (phiên đã    │ của số chính)                │      │
  - Văn phòng             │    │ port 127.0.0.1:  │    ghép nối)   └───────────────────────────────┘      │
        │                 │    │ 3010             │                                                        │
        │ tin nhắn        │    └────────┬─────────┘                                                        │
        ▼                 │             │ chỉ tin của 3 group trong phạm vi mới qua cổng (allowlist JID,             │
 ════════════════════════ │ ════════════╪══════════ DM disabled, require_mention=false) ══════════════════ │
   WhatsApp cloud         │             ▼                                                                  │
                          │    ┌──────────────────┐   gọi model (HTTPS)                                    │
                          │    │ Agent + Skill    │──────────────► https://api.goldenfarm.com.vn/v1        │
                          │    │ wa-room-recorder │                (9Router, model cx/gpt-5.6-sol)          │
                          │    │ (IM LẶNG: final  │                                                        │
                          │    │  response rỗng;  │   MỌI tin gửi ra đều bị GF SENDBLOCK chặn ở bridge ──┐ │
                          │    │  chỉ ghi file)   │                                                    │ │
                          │    └────────┬─────────┘                                                    │ │
                          │             │ 1 file JSON / bản ghi                                        │ │
                          │             ▼                                                              │ │
                          │    wa-outbox/  (workspace của profile gf-recorder)                         │ │
                          │             │                                                              │ │
                          │    ┌────────┴─────────┐  systemd timer, mỗi 1 phút                         │ │
                          │    │ Relay            │  /usr/local/sbin/gf-wa-relay.py (root)             │ │
                          │    │ gf-wa-relay      │  đọc WA_BOT_SECRET từ .env.wa trong tiến trình     │ │
                          │    └────────┬─────────┘                                                    │ │
                          └─────────────┼──────────────────────────────────────────────────────────────┘ │
                                        │ POST http://localhost:8000/api/wa-records/ingest     │
                                        │ header X-Bot-Secret                                    │
                                        ▼                                                              │
                          ┌──────────────────────────────┐      ┌──────────────────────────────┐    │
                          │ App GoldenFarmICT (Docker)   │      │ Người dùng app               │    │
                          │ backend :8000 → bảng         │─────►│ Module "Thông báo WhatsApp"  │    │
                          │ wa_records (PostgreSQL,      │ feed │ route /wa-records            │    │
                          │ container goldenfarm-        │      │ Phân quyền: hiện chỉ admin   │    │
                          │ postgres, db goldenfarmict)  │      └──────────────────────────────┘    │
                          │ frontend :8088               │                                         │
                          └──────────────────────────────┘                                         │
                                                                                     gf-sendblock.log ◄┘
                                                                                     (log các lần gửi bị chặn)
```

Các chặng chính:

1. **Group → Bridge:** nhân viên nhắn trong group như bình thường. Bridge
   Baileys (Node.js, trong thư mục `scripts/whatsapp-bridge` của Hermes) giữ
   kết nối WebSocket thường trực tới WhatsApp với tư cách thiết bị liên kết.
2. **Bridge → Agent:** bridge chạy ở cổng nội bộ `127.0.0.1:3010`. Chỉ tin từ
   JID thuộc allowlist (3 group) mới được chuyển cho agent; DM bị vô hiệu ở cả hai lớp
   (bridge và adapter).
3. **Agent + Skill:** gateway (dịch vụ `hermes-gateway-gf-recorder.service`)
   chạy agent với skill `wa-room-recorder`; model `cx/gpt-5.6-sol` qua gateway
   9Router tự host phân loại + trích xuất. Đầu ra duy nhất: file JSON.
4. **Outbox → Relay:** relay root-owned quét thư mục `wa-outbox/` mỗi phút,
   POST vào ingest API bằng bot secret; thành công → chuyển file sang `sent/`,
   lỗi → giữ lại thử tiếp, 10 lần lỗi → `failed/`.
5. **Ingest → DB → Module:** backend ghi vào bảng `wa_records`; admin xem ở
   module "Thông báo WhatsApp" (route `/wa-records`).

---

## 3. Cơ chế từng thành phần

### 3.1. Ghép nối & phiên đăng nhập WhatsApp

- Hermes **v0.23.2** (bản stable 2026.9.24, commit `ae2a81ccc00e`) được cài
  **trực tiếp trên host** (không container) bằng script cài chính thức, dưới
  user hệ thống riêng **`hermes`** (uid 1003), thư mục cài
  `/home/hermes/.hermes/hermes-agent`.
- Profile dùng cho bot: **`gf-recorder`** tại
  `/home/hermes/.hermes/profiles/gf-recorder`, bị khóa còn **5/26 toolset**
  cho cả CLI lẫn WhatsApp: `file, memory, skills, todo, session_search`
  (File, Memory, Skills, Task Planning, Session Search) — **không có
  Terminal, không Browser, không thực thi mã** (mặc định gốc của Hermes cho
  WhatsApp vốn gồm cả terminal — đã gỡ).
- Ghép nối hoàn tất **2026-11-19 12:44** bằng cách quét QR tại terminal của
  server (phiên tmux `wa-pair`). Thông tin đăng nhập nằm trong
  `whatsapp/session/` của profile (file lõi `creds.json`, quyền 600). Mã lỗi
  **515** xuất hiện trong log ngay sau khi quét là WhatsApp chủ động yêu cầu
  client khởi động lại một nhịp trong bắt tay — hành vi bình thường, không
  phải lỗi; ngay sau đó log ghi "Pairing complete. Credentials saved."
- Hệ quả thiết kế cần nhớ: bridge **bỏ qua mọi tin do chính chủ tài khoản gửi
  trong group** (cơ chế `from_me` của bridge ở chế độ bot, lý do ghi log là
  `from_me_group`). Bot chỉ ghi tin của **người khác** — khi nghiệm thu không
  được dùng tin của chính chủ tài khoản để test.

### 3.2. Khóa phạm vi (intake)

Cấu hình nằm trong `config.yaml` của profile (đoạn `platforms.whatsapp.extra`)
và được mirror trong `.env` của profile:

| Khóa | Giá trị | Ý nghĩa |
|---|---|---|
| `WHATSAPP_MODE` (.env) | `bot` | Bắt buộc: chế độ `self-chat` mặc định ban đầu loại bỏ mọi tin không phải của chính chủ → không thể ghi group |
| `group_policy` | `allowlist` | Chỉ các group trong allowlist mới được xử lý |
| `group_allow_from` | `["120363421346130787@g.us", "120363420637565910@g.us", "120363405283973589@g.us"]` | Đúng **ba** JID: "GROUP GOLDEN FARM - VP (Không có NV Tỉnh)", "GROUP GOLDEN FARM", "GROUP GOLDEN FARM - Văn phòng" |
| `group_allowed_chats` | cùng 3 JID như trên | **Cấp quyền ở lớp admission của gateway** (mục 3.2.1): mọi người gửi trong các group này đều qua được lớp kiểm tra thứ hai. Chỉ áp dụng cho tin group — DM không bao giờ nhìn thấy danh sách này. Thêm 2026-11-19 15:19 (backup `config.yaml.bak-20261119151913`) |
| `dm_policy` | `disabled` | Tin nhắn riêng bị tắt ở cả bridge lẫn adapter |
| `whatsapp.unauthorized_dm_behavior` | `ignore` | DM lạ bị bỏ qua lặng lẽ (không trả lời mã ghép nối) |
| `require_mention` | `false` | Nghe tất cả tin trong group rồi tự lọc (quyết định của chủ tài khoản) |
| `send_read_receipts` | `false` | Không gửi tick xanh "đã đọc" |
| `display.platforms.whatsapp.tool_progress` | `off` | Không hiện bong bóng trạng thái xử lý |
| `display.platforms.whatsapp.interim_assistant_messages` | `false` | Không gửi tin tạm thời |
| `reply_prefix` | `""` | Không tiền tố trả lời |
| `home_channel` | chat của chính chủ tài khoản | Tránh việc Hermes đòi đặt home channel với người lạ |
| `allow_admin_from` / `group_allow_admin_from` | JID của chủ tài khoản | Lệnh quản trị chỉ từ chủ tài khoản |
| `WHATSAPP_ALLOWED_USERS` | **cố ý KHÔNG đặt** | Sender-allowlist theo từng cá nhân — không dùng, vì quyền vào group được cấp theo **chat** qua `group_allowed_chats` (xem dưới). ⚠️ Bài học 2026-11-19: KHÔNG đặt biến này **không** tự nó cho phép thành viên group — gateway còn một lớp admission thứ hai (mục 3.2.1) từng từ chối mọi thành viên khi cả hai cơ chế đều trống |

Tài khoản có mặt trong 5 group; 3 group ở trên được mở cổng (phạm vi ban đầu
chỉ có group "GROUP GOLDEN FARM - VP (Không có NV Tỉnh)" làm pilot, mở rộng
lên 3 group ngày 2026-11-19 theo yêu cầu của chủ tài khoản). Hai group còn
lại (đều tên "GOLDEN FARM COMPANY") không được xử lý.

### 3.2.1. Lớp admission thứ hai của gateway (session envelope) — và bản sửa 2026-11-19

Ngoài cổng intake ở mục 3.2, gateway Hermes v0.23.2 còn **kiểm tra lại một
lớp thứ hai** trước khi giao tin cho agent: `gateway/session_envelope.py`
gọi `runner._is_user_authorized_for_source(...)` (logic ở
`gateway/authz_mixin.py` → `_principal_authorized`). Khác với intake, lớp
này **không** uỷ quyền cho chính sách riêng của adapter WhatsApp
(`enforces_own_access_policy` chỉ được tin khi lời gọi cho phép delegation —
đường envelope thì không), và nó cũng **không** đối chiếu `group_allow_from`
theo chat: nó so danh sách đó với **user_id của người gửi** nên không bao
giờ khớp.

Hệ quả đã xảy ra thật: với `WHATSAPP_ALLOWED_USERS` để trống, **mọi** tin
của thành viên group đều bị lớp này từ chối —
`Native admission refused: permission_denied (user_not_authorized)` — trước
khi tới agent. Cả 3 tin thật ngày 2026-11-19 (14:30, 14:37, 14:39) đều
chết ở đây; mọi bản ghi "thành công" trước đó đều từ file outbox thả tay.
(Ba payload 190 ký tự mà GF SENDBLOCK chặn ở 14:30/14:37/14:39 chính là
tin *thông báo từ chối* cố định mà gateway định gửi sau mỗi lần refusal —
không phải agent trả lời.)

**Cơ chế đúng mà mã nguồn dành cho việc này:** `_chat_scoped_grant` trong
`authz_mixin.py` cấp quyền **theo chat** cho tin group khi `chat_id` nằm
trong `platforms.<platform>.extra.group_allowed_chats` ở config.yaml
(đường env tương đương `group_allowed_chats_env` không được plugin
WhatsApp khai báo — `plugins/platforms/whatsapp/gateway_env.py` chỉ khai
`WHATSAPP_ALLOWED_USERS` / `WHATSAPP_ALLOW_ALL_USERS` — nên đường config
là đường duy nhất). Cấp theo chat nghĩa là: **mọi thành viên** của các
group trong danh sách đều được nhận, thành viên mới vào group tự có hiệu
lực, không phải liệt kê từng người; và vì grant chỉ chạy cho tin group,
**DM vẫn bị từ chối** như trước (thêm một lớp nữa: `dm_policy: disabled`
đã chặn DM ngay ở intake).

**Bản sửa đã áp (2026-11-19 15:19, chủ hệ thống đã duyệt):** thêm khóa
`group_allowed_chats` = đúng 3 JID của phạm vi vào
`platforms.whatsapp.extra` trong `config.yaml` của profile (backup
`config.yaml.bak-20261119151913`), restart
`hermes-gateway-gf-recorder.service` → "✓ whatsapp connected" 15:19:28;
`gf-sendblock.log` tăng 14 → 16 dòng (cặp thông báo tắt/khởi động gửi về
chủ tài khoản, đều bị chặn — chốt chặn nguyên vẹn). Khi đổi phạm vi group
(mục 4.4), **phải sửa cả khóa này** cùng lúc với `group_allow_from`.

### 3.3. Im lặng tuyệt đối — 3 lớp + 1 chốt cứng

1. **Lớp cổng (intake):** như mục 3.2 — ngoài 3 group trong phạm vi, không tin nào tới
   được agent; DM bị `ignore` nên không phát sinh phản hồi ghép nối.
2. **Lớp hiển thị & hành vi:** tắt read receipts, tool progress, interim
   messages; và **Rule 0 trong skill** buộc câu trả lời cuối (final response)
   của agent trên mọi lượt WhatsApp phải **rỗng** — đầu ra duy nhất được phép
   là thao tác ghi file.
3. **Lớp code — chốt chặn GF SENDBLOCK (lớp đảm bảo cứng):** Hermes v0.23.2
   không có công tắc observe-only/no-reply ở tầng cấu hình, nên một bản vá
   cục bộ đã được áp vào `scripts/whatsapp-bridge/bridge.js`:
   - Mọi đường gửi tin (text / sửa tin / media / vị trí / poll) đều chảy qua
     một hàm duy nhất `sendWithTimeout()` → `sock.sendMessage()`. Guard nằm
     ngay đầu hàm này: nếu đang bật, nó **nuốt mọi lần gửi**, trả về một
     "thành công giả" (id `GF-BLOCKED-<timestamp>`) để phía gọi không thử lại
     hay báo lỗi, và ghi log (timestamp, JID đích, độ dài payload — **không
     ghi nội dung**) vào `scripts/whatsapp-bridge/gf-sendblock.log`.
   - Endpoint `/typing` (trạng thái "đang nhập…") cũng bị chặn tương tự —
     không phát tín hiệu presence.
   - **Fail-closed:** chốt bật trừ khi biến môi trường `GF_WA_SEND_BLOCK=0`
     (mặc định không đặt = bật). Bản gốc trước vá được lưu ở
     `bridge.js.pre-sendblock.bak` cùng thư mục.
   - **Bằng chứng thực tế:** vài giây sau khi gateway kết nối lúc go-live
     (2026-11-19 13:30:51), chính Hermes định gửi tin thông báo khởi động về
     JID của chủ tài khoản — log ghi `BLOCKED sendMessage to=<JID chủ tài
     khoản> payload_len=56`. Không có gì tới được WhatsApp. (3 dòng BLOCKED
     trước đó trong cùng log là bài test khô với số giả lúc 13:27.)

### 3.4. Skill ghi nhận — phân loại & trích xuất

- File: `/home/hermes/.hermes/profiles/gf-recorder/skills/goldenfarm/wa-room-recorder/SKILL.md`
  (skill `wa-room-recorder`, version **1.3.0** — 1.2.0 thêm loại `thongbao`;
  1.3.0 bắt buộc kèm `sender_phone` trong MỌI bản ghi vì app định tuyến
  `thongbao` theo số người gửi; trạng thái **enabled** — kiểm chứng bằng
  `hermes -p gf-recorder skills list`).
- **Rule 0 — Absolute silence:** không bao giờ gửi tin; final response rỗng;
  tin không phải bản ghi → không làm gì cả, kết thúc lượt trống; không bao
  giờ hỏi lại người gửi khi thiếu thông tin (ghi phần có được, admin đối
  chiếu trong app).
- **Phân loại** mỗi tin trong các group thuộc phạm vi vào đúng một trong: `datlich`,
  `checkin`, `checkout`, `thongbao`, hoặc *không phải bản ghi* (hỏi "mai phòng có ai đặt
  chưa?" là câu hỏi, không phải đặt phòng → bỏ qua).
- **`thongbao` — thông báo chính thức (từ version 1.2.0):** phân loại theo
  chuẩn **precision-first** — tin phải mang nhiều tín hiệu trang trọng:
  marker rõ ("thông báo", "TB:", "kính gửi/thân gửi", dòng tiêu đề riêng);
  lĩnh vực trang trọng (nghỉ lễ, họp toàn thể, quy định/chính sách mới,
  tuyển dụng, lương/thưởng, an toàn lao động, bảo trì hệ thống); văn phong
  trang trọng kèm ngày hiệu lực ("kể từ ngày…", "áp dụng từ…"); tiền tố ký
  tên phòng ban ("PNS:", "Hành chính:", "Ban Giám đốc:"); văn bản có cấu
  trúc nhiều câu. **Nghi ngờ → KHÔNG phân loại `thongbao`** (bỏ qua hẳn):
  thông báo từ người gửi được phép đăng thẳng sẽ lên bảng Thông báo toàn
  công ty **không qua duyệt**, đăng nhầm một tin tán gẫu thành "thông báo
  chính thức" tệ hơn bỏ sót một thông báo. Từ version 1.3.0, mọi bản ghi
  (mọi loại) **bắt buộc** kèm `sender_phone` lấy từ định danh người gửi do
  bridge cung cấp (số/JID) — không bao giờ bịa; chỉ bỏ trống khi envelope
  thật sự không có số.
  Thứ tự ưu tiên: tin khớp `datlich`/`checkin`/`checkout` thì luôn là bản
  ghi phòng, không bao giờ là `thongbao`.
  - `title`: dòng tiêu đề/dòng đầu của chính tin nếu có; không có thì tóm
    tắt ngắn trung thực từ nội dung tin — **không bịa** sự kiện/ngày/tên.
  - `content`: **toàn văn tin, nguyên văn** (Dashboard hiện đúng như đã viết).
  - Không `scheduled_at`, không `place`, không tọa độ.
- **Trích xuất theo văn phong lỏng tiếng Việt, không bao giờ bịa:**
  - Phòng ban/đội: lấy nguyên tiền tố như đã viết (`PNS`, `MKT`, `Thu mua`,
    `R&D`…) — không tự mở rộng viết tắt.
  - Phòng → `place`: như tin ghi ("phòng họp tầng 2"); chỉ nói "phòng họp"
    thì place là `Phòng họp`.
  - Ngày: "hôm nay" = ngày của tin; "ngày mai/mai" = +1; "19/11" = dd/mm năm
    hiện tại; thứ trong tuần = lần xuất hiện tiếp theo. Múi giờ
    Asia/Ho_Chi_Minh.
  - Giờ: chấp nhận `10h`, `10h30`, `10:00`, `1g30pm` (=13:30), `2g30pm`
    (=14:30). Thiếu giờ kết thúc thì ghi rõ "không rõ giờ kết thúc" trong
    content — **không tự invent giờ kết thúc**.
  - `scheduled_at` (chỉ cho `datlich`): ISO 8601 kèm `+07:00`, lấy ngày +
    giờ bắt đầu.
  - Người đặt: tên người gửi từ envelope của tin → `sender_name`.
- **Trường hợp đặc biệt:**
  - Một tin có nhiều khung giờ ("10h-10h30 & 15h30-16h30") → **mỗi khung một
    bản ghi** (nhiều file).
  - **Hủy đặt phòng** → ghi một bản ghi `datlich` với tiêu đề bắt đầu bằng
    `HỦY:` để admin đối chiếu trong app.
  - Check-in/check-out: lấy giờ theo timestamp của tin (trừ khi tin ghi giờ
    khác); **không có `scheduled_at`, không có `lat`/`lng`** — sự kiện phòng
    họp không có GPS, tuyệt đối không bịa tọa độ.
- **Đầu ra:** mỗi bản ghi = 1 file JSON UTF-8 trong
  `workspace/wa-outbox/` của profile, tên dạng
  `wa-<yyyymmddHHMMSS>-<loại>-<4 chữ số ngẫu nhiên>.json`.

**Ví dụ 1 — đặt phòng (mẫu thật trong group):**

Tin gốc: `PNS mượn phòng họp tầng 2 từ 10h - 10h30 ạ` (gửi 2026-11-20, người gửi Nguyen Van A)

```json
{
  "record_type": "datlich",
  "sender_name": "Nguyen Van A",
  "group_name": "GROUP GOLDEN FARM - VP (Không có NV Tỉnh)",
  "title": "PNS đặt phòng họp tầng 2 10:00–10:30 20/11",
  "content": "PNS đặt phòng họp tầng 2, ngày 20/11, 10:00–10:30. Người đặt: Nguyen Van A.",
  "scheduled_at": "2026-11-20T10:00:00+07:00",
  "place": "Phòng họp tầng 2",
  "raw_message": "PNS mượn phòng họp tầng 2 từ 10h - 10h30 ạ",
  "source": "hermes"
}
```

**Ví dụ 2 — đặt phòng với giờ am/pm và ngày dd/mm:**

Tin gốc: `MKT mượn phòng họp từ 1g30pm-2g30pm 19/11 nhé`

```json
{
  "record_type": "datlich",
  "sender_name": "<tên người gửi>",
  "group_name": "GROUP GOLDEN FARM - VP (Không có NV Tỉnh)",
  "title": "MKT đặt phòng họp 13:30–14:30 19/11",
  "content": "MKT đặt phòng họp, ngày 19/11, 13:30–14:30. Người đặt: <tên người gửi>.",
  "scheduled_at": "2026-11-19T13:30:00+07:00",
  "place": "Phòng họp",
  "raw_message": "MKT mượn phòng họp từ 1g30pm-2g30pm 19/11 nhé",
  "source": "hermes"
}
```

**Ví dụ 3 — check-out:**

Tin gốc: `Họp xong rồi, trả phòng họp tầng 2 ạ`

```json
{
  "record_type": "checkout",
  "sender_name": "<tên người gửi>",
  "group_name": "GROUP GOLDEN FARM - VP (Không có NV Tỉnh)",
  "title": "Check-out phòng họp tầng 2 — <tên người gửi>",
  "content": "Trả phòng họp tầng 2, lúc <giờ của tin>.",
  "place": "Phòng họp tầng 2",
  "raw_message": "Họp xong rồi, trả phòng họp tầng 2 ạ",
  "source": "hermes"
}
```

### 3.5. Relay file → ingest

- Script: `/usr/local/sbin/gf-wa-relay.py` — **root sở hữu**, agent (user
  `hermes`) không sửa được; chạy bởi `gf-wa-relay.service` kích hoạt bởi
  **`gf-wa-relay.timer` mỗi 1 phút** (enabled + active).
- Mỗi lần chạy: quét `wa-outbox/*.json` → POST từng file tới
  `http://localhost:8000/api/wa-records/ingest` với header `X-Bot-Secret`.
  Secret được đọc **trong tiến trình** từ `/home/goldenfarmict/.env.wa`
  (biến `WA_BOT_SECRET`) — không bao giờ in ra log hay màn hình.
- Chính sách kết quả:
  - HTTP 200 → chuyển file vào `wa-outbox/sent/`, log `OK ... -> ingest id=<id>`.
  - Lỗi (JSON hỏng, API từ chối, mất kết nối…) → giữ file, tăng bộ đếm lần
    thử trong `/var/lib/gf-wa-relay/state.json`, thử lại ở phút sau.
  - Đủ **10 lần lỗi** → chuyển vào `wa-outbox/failed/` (cách ly file độc,
    tránh lặp vô hạn) và log `QUARANTINE`.
- Log: `/var/log/gf-wa-relay.log`.
- Đã kiểm chứng đầu-cuối ngày 2026-11-19: file datlich [TEST] thả vào outbox
  → relay tự chạy → bản ghi **id=6** xuất hiện trong DB với `scheduled_at`
  đổi múi giờ đúng (10:00+07:00 → 03:00Z) → file nằm trong `sent/`. Đường lỗi
  cũng đã test bằng file JSON hỏng (bị giữ + log `FAIL ... attempt 1/10`).

### 3.6. Phía app GoldenFarmICT — ingest, schema, phân quyền

- Repo `/home/goldenfarmict`, branch `wordcraft-viewer-151026`; backend
  container `goldenfarm-backend` (host port 8000), frontend
  `goldenfarm-frontend` (host port 8088), DB container `goldenfarm-postgres`
  (database `goldenfarmict`).
- **Ingest:** `POST /api/wa-records/ingest` — xác thực **chỉ** bằng header
  `X-Bot-Secret` so khớp hằng-thời-gian với `WA_BOT_SECRET`; **không** chấp
  nhận session người dùng. Chưa cấu hình secret → `503`; secret sai/thiếu →
  `401`; `record_type` sai → `400`; check-in thiếu tọa độ → nay **không**
  lỗi (xem dưới).
- **Định tuyến `thongbao` theo người gửi (từ 2026-11-19 15:46):** ingest
  chấp nhận `record_type = "thongbao"` và rẽ nhánh theo **số điện thoại
  người gửi** — quyết định của chủ hệ thống, mang tính "tạm" (trước đó vài
  giờ mọi `thongbao` đều đăng thẳng):
  - **Khớp danh sách đăng thẳng** → hàm `_ingest_announcement` trong
    `wa_records.py` ghi thẳng một hàng vào **`forum_posts`** — cùng
    bảng/cùng cách ghi với chức năng Thông báo (Forum) của app:
    - `title` = trường `title` của payload — **bắt buộc, rỗng → `400`**
      (áp dụng cho cả hai đường).
    - `content` = trường `content`; trống thì dùng `raw_message`.
    - `author_code = 'wa-bot'`, `author_name = 'WhatsApp · <sender_name>'`
      (cột của `forum_posts` là varchar không giới hạn, không có FK trên
      `author_code`; `author_name` được cắt an toàn ở 255 ký tự).
    - `target_type = 'all'`, `target_value = ''`, `is_pinned = 0`, không
      file đính kèm; `created_at`/`updated_at` ghi bằng `CURRENT_TIMESTAMP`
      đúng như `forum.py`, và bắn cùng sự kiện realtime
      `events.publish_sync("forum_post_added", {"id": ...})` để Dashboard
      đang mở tự cập nhật.
    - Phản hồi: `{"success": true, "id": <id bài forum>, "forum_post_id": <id>}`
      — relay vẫn hiểu như ingest thường (200 → file vào `sent/`).
    - **Không có bước duyệt:** bài hiện ngay cho toàn công ty. Truy vết
      nguồn (người gửi, group, nguyên văn tin) nằm ở file JSON gốc trong
      `wa-outbox/sent/` + `author_name` trên bài. Admin vẫn sửa/xóa bài
      trên Dashboard như mọi thông báo khác.
  - **Không khớp / thiếu số** → lưu vào **`wa_records`** như bản ghi
    thường (trạng thái `moi`, đủ các trường chuẩn gồm `sender_phone`,
    `group_name`, `raw_message`) cho admin duyệt trong module "Thông báo
    WhatsApp" (badge **Thông báo**, có trong bộ lọc loại). Phản hồi:
    `{"success": true, "id": <id bản ghi>}` như các loại khác. CHECK của
    `wa_records` đã gồm `thongbao` từ migration
    `20261119_wa_records_thongbao.sql`.
  - **Cơ chế khớp:** `sender_phone` của payload được chuẩn hoá (chỉ giữ
    chữ số; đầu `0` → `84`; bỏ tiền tố `00`) rồi so với danh sách trong
    biến môi trường **`WA_ANNOUNCE_DIRECT_PHONES`** (file `.env.wa`, phân
    tách bằng dấu phẩy, chuẩn hoá cùng cách). Hiện danh sách chỉ có **một
    số của Nhung Nhân sự** (phòng Nhân Sự, mã NV 10122; giá trị cụ thể nằm
    trong `.env.wa`, không ghi vào tài liệu này). Biến chưa cấu hình/rỗng
    → danh sách trống → **không ai đăng thẳng** (fail-safe về phía module).
    Muốn thêm người đăng thẳng: thêm số vào biến này rồi recreate backend
    (`docker compose up -d backend`).
  - Đã kiểm chứng 2026-11-19 (bản đăng-thẳng-cho-mọi-người): file
    `thongbao` [TEST] thả vào outbox → sau ~40 giây có bài trên
    `forum_posts` với đúng các trường trên, admin thấy qua
    `GET /api/forum/posts` và xóa được qua API; payload thiếu title →
    `400`, không tạo bài; `datlich` qua relay vẫn vào `wa_records` (id=7).
  - Đã kiểm chứng 2026-11-19 (bản định tuyến theo người gửi): số của
    Nhung ở cả hai dạng (quốc tế và đầu 0) → `forum_posts` +1 mỗi lần
    (ids 4, 5 — đã xóa qua admin API, bảng trở về 1 bài thật); số khác →
    `wa_records` id=8 (`thongbao`/`moi`); thiếu số → id=9; `datlich` hồi
    quy → id=10; title rỗng → `400` ở cả hai đường; lọc module theo
    `thongbao` trả đúng 2 bản ghi.
- **Bảng `wa_records`** (kiểu dữ liệu đúng chuẩn, không theo thói quen VARCHAR
  của các bảng cũ): `id BIGINT`, `record_type VARCHAR(20)` CHECK ∈
  (`datlich`,`checkin`,`baocao`,`checkout`,`thongbao`), `sender_name TEXT`,
  `sender_phone VARCHAR(32)`, `group_name TEXT`, `title TEXT`,
  `content TEXT`, `scheduled_at TIMESTAMPTZ`, `place TEXT`,
  `lat`/`lng NUMERIC(10,7)`, `raw_message TEXT`,
  `source VARCHAR(32)` mặc định `hermes`, `status VARCHAR(20)` CHECK ∈
  (`moi`,`daxuly`,`huy`) mặc định `moi`, `created_at TIMESTAMPTZ`. Index trên
  `created_at DESC` và `record_type`.
  - Tọa độ là **tùy chọn**: bản thiết kế ban đầu bắt buộc lat/lng cho
    `checkin`, nhưng check-in phòng họp không bao giờ có GPS — giữ nguyên thì
    mọi check-in thật đều bị ingest trả 400. Nay nếu gửi kèm tọa độ thì vẫn
    kiểm tra khoảng hợp lệ (−90..90 / −180..180); giao diện chỉ hiện link bản
    đồ khi có tọa độ.
- **Hợp đồng dữ liệu:** `docs/wa_ingest_contract.md` trong repo app (endpoint,
  header, schema JSON, ví dụ từng loại, mã lỗi, và mục mô tả đường
  file → relay → ingest).
- **Module "Thông báo WhatsApp"** (module key `wa-records`, route
  `/wa-records`): trang feed mới-nhất-trước, badge theo loại (Đặt lịch /
  Check-in / Check-out / Báo cáo / Thông báo), lọc theo loại + trạng thái + khoảng ngày
  (lọc theo `created_at`) + tìm kiếm, xem chi tiết kèm tin gốc, đổi trạng
  thái (Đã xử lý / Hủy / Mở lại). Đăng ký đủ 4 chạm chuẩn của app
  (MODULE_MAP, ALL_MODULES, DEFAULT_ROLE_MODULE_PERMS, route guard).
- **Phân quyền:** quyền hiệu lực của app gộp 3 tầng
  `user_permissions > department_permissions > role_permissions`. Module này
  được quản lý hoàn toàn qua trang **Phân quyền**; trạng thái hiện tại (giai
  đoạn phát triển): **chỉ admin** — `role_permissions`: admin view=1/edit=1,
  head/deputy/user đều 0/0; backend kiểm tra thuần theo quyền (`can_view` để
  đọc, `can_edit` để đổi trạng thái), không hard-code theo vai trò. Lưu ý kỹ
  thuật đã xử lý ở commit `ffa1232`: `DEFAULT_ROLE_MODULE_PERMS` của app tự
  điền-bổ-sung và seed lại quyền mặc định cho head/deputy mỗi lần backend
  khởi động, nên `wa-records` đã được gỡ khỏi defaults của head/deputy —
  nếu không, việc thu quyền trong DB sẽ bị cấp lại sau mỗi lần restart.

---

## 4. Quy trình vận hành

> Quy ước: các lệnh phía Hermes chạy dưới user `hermes`. Từ root:
> `sudo -u hermes -H bash -lc '<lệnh>'`. Lệnh qua `systemctl --user` cần thêm
> `XDG_RUNTIME_DIR=/run/user/1003`. Ghi chú vận hành rút gọn nằm tại
> `workspace/OPS-WHATSAPP-RECORDER.md` của profile.

### 4.1. Kiểm tra sức khỏe hằng ngày

| Kiểm tra | Lệnh / nơi xem | Kỳ vọng |
|---|---|---|
| Gateway còn chạy | `hermes -p gf-recorder gateway status` | `Active: active (running)` |
| Gateway có lỗi gần đây | `logs/gateway.log`, `logs/agent.log`, `logs/errors.log` trong profile; hoặc `journalctl --user -u hermes-gateway-gf-recorder.service` | Không có 401 (key), không disconnect lặp lại |
| Bridge đang nghe | `ss -tlnp \| grep 3010` | `127.0.0.1:3010` bởi tiến trình node của bridge |
| Relay còn chạy | `systemctl list-timers gf-wa-relay.timer` | Có mốc NEXT trong ~1 phút |
| Relay có lỗi | `tail /var/log/gf-wa-relay.log` | Toàn dòng `OK`; dòng `FAIL` phải có lý do rõ và không lặp mãi một file |
| Outbox có kẹt | `ls .../workspace/wa-outbox/*.json` | Thường rỗng (file được xử lý trong ≤1 phút); `sent/` tăng dần; `failed/` phải rỗng |
| Có lần gửi tin nào bị chặn | `tail scripts/whatsapp-bridge/gf-sendblock.log` | Không dòng mới ngoài kỳ vọng; **có dòng mới = có thứ gì đó đã cố gửi tin — cần xem lại** |
| Bản ghi có vào app | Mở module "Thông báo WhatsApp" (tài khoản admin) | Bản ghi mới nhất khớp hoạt động trong group |
| RAM của gateway | `systemctl --user show hermes-gateway-gf-recorder.service -p MemoryCurrent` | ~310–340 MB; host còn ~2 GB available là mức chật quen thuộc |

### 4.2. Khởi động / dừng / khởi động lại gateway

```bash
sudo -u hermes -H bash -lc 'hermes -p gf-recorder gateway status'
sudo -u hermes -H bash -lc 'hermes -p gf-recorder gateway start'
sudo -u hermes -H bash -lc 'hermes -p gf-recorder gateway stop'
sudo -u hermes -H bash -lc 'hermes -p gf-recorder gateway restart'
# Tương đương qua systemd:
sudo -u hermes env XDG_RUNTIME_DIR=/run/user/1003 systemctl --user status hermes-gateway-gf-recorder.service
```

Service đã `enabled` + user `hermes` đã bật **linger** → tự lên sau khi máy
khởi động lại, không cần ai đăng nhập.

Relay không cần thao tác thường ngày; khi cần chạy ngay một lượt:
`systemctl start gf-wa-relay.service`.

### 4.3. Quy trình nghiệm thu tin thật (acceptance)

1. Nhờ **một thành viên khác** trong một group thuộc phạm vi đăng một tin thật, ví dụ:
   *"Em mượn phòng họp tầng 2 từ 15h–16h hôm nay"* — **không** dùng tin của
   chính chủ tài khoản (bridge bỏ qua tin `from_me`, mục 3.1).
2. Trong ~1–2 phút (agent xử lý + relay chu kỳ 1 phút), mở app bằng tài
   khoản admin → module **Thông báo WhatsApp** (nhớ Ctrl+F5 nếu vừa rebuild
   frontend).
3. Đối chiếu: loại = Đặt lịch; tiêu đề có phòng ban + phòng + khung giờ +
   ngày; `scheduled_at` đúng giờ bắt đầu (+07:00); `raw_message` nguyên văn.
4. Thử tiếp một tin check-in và một tin check-out tương tự; kiểm tra badge
   và việc đổi trạng thái (Đã xử lý) trong app.
5. Kiểm tra `gf-sendblock.log` không phát sinh dòng mới và group không nhận
   bất kỳ tin nào từ bot.

### 4.4. Đổi/thêm/bớt group trong phạm vi

Phạm vi hiện tại là **3 group** (danh sách ở mục 3.2). Muốn thêm/bớt/thay group:

1. Lấy JID của group mới (dạng `120363...@g.us`) — liệt kê các group của tài
   khoản bằng một script Baileys dùng một lần với auth state đã lưu (cách đã
   dùng ngày 2026-11-19), hoặc xem trong log/cấu hình khi bot được thêm vào
   group.
2. Sửa **4 nơi** cho khớp nhau:
   - `config.yaml` của profile: `platforms.whatsapp.extra.group_allow_from`
   - `config.yaml` của profile: `platforms.whatsapp.extra.group_allowed_chats`
     (cùng danh sách JID — thiếu khóa này thì tin group bị lớp admission từ
     chối `user_not_authorized`, xem mục 3.2.1)
   - `.env` của profile: `WHATSAPP_GROUP_ALLOWED_USERS`
   - `SKILL.md` của skill `wa-room-recorder`: tên group + JID ở phần đầu và
     trường `group_name` trong quy tắc output.
3. `hermes -p gf-recorder gateway restart`, rồi nghiệm thu lại theo 4.3.

### 4.5. Cấp quyền xem module cho vai trò khác

1. Đăng nhập app bằng tài khoản admin → trang **Phân quyền**.
2. Chọn vai trò (head / deputy / user…) → module **Thông báo WhatsApp**
   (`wa-records`) → tick **Xem** (`can_view`) và/hoặc **Sửa** (`can_edit` —
   quyền đổi trạng thái bản ghi).
3. Có hiệu lực ngay, không cần sửa code hay restart (quyền được đọc từ bảng
   `role_permissions` theo từng request). Thu hồi cũng tại đây.

### 4.6. Đổi API key của gateway (9Router)

1. Tạo key mới trong dashboard của gateway:
   **https://api.goldenfarm.com.vn/dashboard** (mục API Keys) — nên tạo key
   riêng cho bot (hiện tại bot đã có key riêng) để khóa/giới hạn độc lập,
   không dùng chung key của n8n hay dịch vụ khác.
2. Thay giá trị biến `GOLDENFARM_API_KEY` trong `.env` của profile
   `/home/hermes/.hermes/profiles/gf-recorder/.env` (giữ quyền file 600).
   Không dán key vào chat/tài liệu/git.
3. Kiểm tra key mới mà không cần agent:
   `curl -H "Authorization: Bearer <key>" https://api.goldenfarm.com.vn/v1/models`
   → kỳ vọng HTTP 200 và model `cx/gpt-5.6-sol` có trong danh sách.
4. `hermes -p gf-recorder gateway restart`; xem `logs/gateway.log` xác nhận
   không còn 401 và model được warm-up.
5. Thu hồi key cũ trong dashboard.

### 4.7. Sau khi `hermes update` — BẮT BUỘC làm

Bản vá GF SENDBLOCK nằm trong file `bridge.js` thuộc cây mã nguồn của Hermes
→ **bản cập nhật có thể ghi đè mất chốt chặn**. Sau mỗi lần update:

1. Kiểm tra chốt còn không:
   `grep -n "GF SENDBLOCK" /home/hermes/.hermes/hermes-agent/scripts/whatsapp-bridge/bridge.js`
2. Nếu mất: áp lại bản vá (đối chiếu với `bridge.js.pre-sendblock.bak` để
   thấy đúng vị trí: đầu hàm `sendWithTimeout()` và endpoint `/typing`;
   logic fail-closed trừ khi `GF_WA_SEND_BLOCK=0`; log vào
   `gf-sendblock.log`), rồi `node --check bridge.js`.
3. Kiểm tra lại các khóa cấu hình phạm vi trong `config.yaml` (mục 3.2) —
   update có thể migrate config.
4. Restart gateway; xác nhận bridge kết nối ở port 3010; theo dõi
   `gf-sendblock.log` và group trong những ngày đầu (kỳ vọng: không tin gửi
   ra nào; một dòng BLOCKED của thông báo khởi động là dấu hiệu chốt đang
   hoạt động đúng).

### 4.8. Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Gateway không chạy | Service dừng / máy vừa reboot mà linger chưa bật / lỗi config | `gateway status` → xem `logs/gateway.log` + `errors.log` → `gateway start`. Kiểm tra `loginctl show-user hermes -p Linger` = yes |
| Gateway chạy nhưng không ghi bản ghi nào | Bridge mất kết nối WhatsApp; hoặc tin test do chính chủ tài khoản gửi (bị bỏ qua theo thiết kế); hoặc group chưa đúng JID | Xem log bridge trong `gateway.log` có "whatsapp connected" không; test bằng tin của **người khác**; đối chiếu JID ở mục 3.2 |
| Tin thật trong group không được ghi; `gateway.log` có `user_not_authorized` / `Native admission refused` | Lớp admission thứ hai của gateway (mục 3.2.1) từ chối người gửi: grant theo chat chưa có hoặc thiếu JID của group | Kiểm tra `platforms.whatsapp.extra.group_allowed_chats` trong `config.yaml` của profile có đủ JID các group trong phạm vi không (đây là nơi phải sửa — `WHATSAPP_ALLOWED_USERS` để trống là **đúng thiết kế** khi đã có grant theo chat); sửa xong restart gateway rồi test lại bằng tin của thành viên khác |
| WhatsApp rớt phiên (log báo not connected / yêu cầu đăng nhập lại) | Phiên liên kết bị hủy từ điện thoại, hoặc WhatsApp ép đăng nhập lại | Ghép nối lại: mở tmux trên server (`sudo -u hermes -H tmux attach -t wa-pair` hoặc tạo phiên mới), chạy `hermes whatsapp`, chọn chế độ số cá nhân, quét QR bằng điện thoại (WhatsApp → Cài đặt → Thiết bị liên kết). **Đừng Ctrl+C** trong tmux; thoát bằng Ctrl+B rồi D |
| Không SSH được vào server qua Tailscale nhưng máy vẫn sống trên LAN | `tailscaled` trên server bị treo (đã xảy ra 2026-11-18, kéo dài ~16 giờ trong khi ping LAN 10.0.0.114 vẫn 3/3) | Tại console máy hoặc SSH qua LAN: `sudo systemctl restart tailscaled` rồi `tailscale status`. VPS qua cùng đường tunnel vẫn đáp = lỗi nằm ở tailscaled của máy này, không phải đường truyền |
| Bridge báo port bận / không kết nối được ở port 3000 | Port 3000 trên host đã bị một dịch vụ node không liên quan chiếm từ 10/2026 | Đang dùng **3010** qua khóa `platforms.whatsapp.extra.bridge_port` — **không** kill tiến trình ở port 3000 (không thuộc hệ thống này). Nếu 3010 cũng bận: đổi sang port trống khác trong config rồi restart gateway |
| File bản ghi nằm trong `wa-outbox/failed/` | JSON hỏng hoặc ingest từ chối 10 lần liên tiếp | Đọc lý do ở `/var/log/gf-wa-relay.log` (dòng `FAIL`/`QUARANTINE`) → sửa nội dung file (hoặc sửa phía app nếu là lỗi ingest) → **đổi tên file** (để bộ đếm lần thử tính lại từ đầu; bộ đếm nằm ở `/var/lib/gf-wa-relay/state.json`) → thả lại vào thư mục gốc `wa-outbox/` → chờ relay chạy (≤1 phút) hoặc `systemctl start gf-wa-relay.service` |
| Ingest trả 401 | Secret phía relay và phía app lệch nhau, hoặc `.env.wa` bị đổi | Đối chiếu biến `WA_BOT_SECRET` trong `/home/goldenfarmict/.env.wa` với cấu hình app (chỉ so khớp, không in giá trị ra nơi công khai); kiểm tra backend đã restart sau khi đổi secret chưa |
| Ingest trả 503 | App chưa nạp được `WA_BOT_SECRET` | Kiểm tra file `.env.wa` tồn tại, quyền 600, và compose có `env_file` trỏ đúng; restart backend |
| RAM host tăng cao | Gateway ~310–340 MB là bình thường; host vốn chật | Kiểm tra `MemoryCurrent` của service (mục 4.1); nếu gateway phình bất thường → restart gateway và theo dõi; không kill các container khác khi chưa rõ nguyên nhân |
| **Cần ngắt khẩn cấp ngay** | Bot có hành vi lạ / nghi bị khóa số / sự cố bảo mật | **Kill switch 1 (nhanh nhất, phía điện thoại):** WhatsApp → Cài đặt → Thiết bị liên kết → gỡ thiết bị của Hermes — phiên chết ngay bất kể server ra sao. **Kill switch 2 (phía server):** `hermes -p gf-recorder gateway stop` |

### 4.9. Tối ưu vận hành bền bỉ — logrotate, restart hằng tuần, cảnh báo failed/ (bổ sung 2026-11-19)

Ba cơ chế "cài rồi quên" được bổ sung cùng ngày go-live để hệ thống chạy lâu dài không cần ngó ngàng:

**a) Cắt log tự động (logrotate).** Cấu hình: `/etc/logrotate.d/gf-hermes`. Chính sách cho mọi file log của hệ: **daily, giữ 7 bản, nén (compress), copytruncate** (gateway/bridge giữ file log đang mở — copytruncate cắt tại chỗ, không đổi inode nên tiến trình không bị mất log), `missingok`, `notifempty`. Phạm vi file:

- `profiles/gf-recorder/logs/*.log` (gateway.log, agent.log, errors.log và các log chẩn đoán) — khối riêng có `su hermes hermes`;
- `profiles/gf-recorder/whatsapp/bridge.log`, `profiles/gf-recorder/gateway-starts.log`;
- `scripts/whatsapp-bridge/gf-sendblock.log`;
- `/var/log/gf-wa-relay.log` (relay vẫn tự cắt ở ~5 MB như cũ — logrotate bổ sung giới hạn 7 ngày).

Kiểm tra cấu hình mà không thay đổi thật: `logrotate -d /etc/logrotate.d/gf-hermes` (đã kiểm chứng 2026-11-19: exit 0, đủ 10 file log, không lỗi).

**b) Restart gateway định kỳ — Chủ Nhật 03:00.** Unit hệ thống `gf-hermes-weekly-restart.timer` (+ `.service` oneshot đi kèm) tại `/etc/systemd/system/`, lịch `OnCalendar=Sun 03:00` giờ máy (Asia/Ho_Chi_Minh) cộng trễ ngẫu nhiên tối đa 120 giây. Service chạy đúng mẫu lệnh restart thủ công ở mục 4.2 nhưng từ root qua `runuser -u hermes` + `systemctl --user restart hermes-gateway-gf-recorder.service` (kèm `XDG_RUNTIME_DIR=/run/user/1003`). Mục đích: xả RAM cho cầu nối Baileys (giữ WebSocket 24/7, có xu hướng phình bộ nhớ sau vài tuần; toàn service ~310–340 MB). Hiện tượng kèm theo là **bình thường**: gateway ngắt kết nối WhatsApp vài chục giây rồi tự kết nối lại; thông báo khởi động gửi về số chủ tài khoản vẫn bị GF SENDBLOCK chặn như mọi lần restart. Xem lần chạy kế tiếp: `systemctl list-timers gf-hermes-weekly-restart.timer` (lần đầu: CN 2026-11-22 ~03:01 +07). Tắt cơ chế: `systemctl disable --now gf-hermes-weekly-restart.timer`.

**c) Cảnh báo khi bản ghi kẹt ở failed/ (GF ALERT).** Relay `/usr/local/sbin/gf-wa-relay.py` đã vá (đánh dấu `GF ALERT` trong code; bản trước vá: `/usr/local/sbin/gf-wa-relay.py.bak-20261119152402`): **chỉ khi** một file bị chuyển vào `wa-outbox/failed/` (hết 10 lần thử), relay bắn đúng **một** POST tới webhook khai trong `/etc/gf-wa-relay-alert.conf` (root, quyền 600; dạng key=value: `WEBHOOK_URL=`, `CHAT_ID=` — CHAT_ID tùy chọn). Payload JSON tương thích Telegram Bot API: `{"text": "Báo động: Có bản ghi WhatsApp bị kẹt tại thư mục failed: <tên file>", "chat_id": "<CHAT_ID>"}` (trường `chat_id` chỉ có khi đã khai). Timeout 5 giây; mọi lỗi cảnh báo đều bị bắt và ghi vào log relay — **relay không bao giờ hỏng vì cảnh báo**. Khi `WEBHOOK_URL` để trống (trạng thái hiện tại): không POST đi đâu cả, log relay ghi một dòng `ALERT (chua cau hinh webhook): <tên file>` để người bảo trì vẫn thấy khi đọc log. Đã test đầu-cuối 2026-11-19 bằng listener HTTP nội bộ trên chính server (payload nhận đúng nguyên văn, cả hai nhánh có/không webhook) rồi dọn sạch dữ liệu test. Cách nối Telegram sau này: tạo bot qua @BotFather, lấy chat id của người nhận, điền `WEBHOOK_URL=https://api.telegram.org/bot<TOKEN>/sendMessage` và `CHAT_ID=<id>` vào file conf — không cần sửa code, hiệu lực ngay từ lần relay kế tiếp (relay đọc conf mỗi lần chạy). Zalo ZNS yêu cầu mẫu tin được duyệt trước nên không dùng được payload tự do này; webhook trung gian khác chỉ cần nhận POST JSON có trường `text`.

---

## 5. Bảo mật

### 5.1. Bí mật nằm ở đâu (chỉ vị trí — không có giá trị trong tài liệu này)

| Bí mật | Vị trí | Quyền | Ghi chú |
|---|---|---|---|
| API key gateway 9Router của bot | Biến `GOLDENFARM_API_KEY` trong `/home/hermes/.hermes/profiles/gf-recorder/.env`; `config.yaml` chỉ tham chiếu qua `key_env` | File 600, chủ sở hữu `hermes` | Key **riêng cho bot**, tạo trong dashboard 9Router; không dùng chung với n8n/dịch vụ khác; không sao chép sang nơi khác |
| Bot secret của ingest | Biến `WA_BOT_SECRET` trong `/home/goldenfarmict/.env.wa` | File 600, **không nằm trong git** (đã gitignore; compose nạp qua `env_file`) | Relay đọc trong tiến trình khi chạy; backend so khớp hằng-thời-gian; không in ra log |
| Phiên WhatsApp (credentials Baileys) | `/home/hermes/.hermes/profiles/gf-recorder/whatsapp/session/` (`creds.json` 600) | Chỉ user `hermes` | Tương đương "mật khẩu đăng nhập" của thiết bị liên kết — mất thư mục này = phải quét QR lại; lộ thư mục này = người khác mạo danh được phiên |

### 5.2. Ai truy cập được gì

- **User `hermes`** (chạy agent + gateway + bridge): đọc được phiên WhatsApp,
  `.env` của profile, workspace/outbox. Agent bị khóa ở 5 toolset, không có
  terminal/browser/code-exec.
- **Root**: chạy relay (`/usr/local/sbin/gf-wa-relay.py` root-owned — agent
  không sửa được đường đẩy dữ liệu), đọc `.env.wa`, quản trị toàn hệ thống.
- **App GoldenFarmICT**: ingest chỉ nhận bot-secret (không nhận session người
  dùng); đọc/ghi module theo phân quyền — hiện chỉ admin (mục 3.6).
- **Các group trong phạm vi**: mọi thành viên đều được bot "nghe" (theo allowlist JID);
  thành viên cần biết group có bot ghi nhận — nên thông báo một lần trong
  group khi vận hành chính thức.
- **Chủ tài khoản**: giữ kill switch phía điện thoại (gỡ thiết bị liên kết).

### 5.3. Rủi ro còn lại & giảm thiểu đã áp

- **Khóa số do cầu nối không chính thức:** giảm thiểu bằng im lặng tuyệt đối
  + chốt chặn code + chỉ nghe 3 group trong phạm vi; không triệt tiêu được. Đây là lý do
  phải theo dõi sát những ngày đầu và giữ sẵn 2 kill switch (mục 4.8).
- **Phiên nằm trên số chính:** phiên liên kết về nguyên tắc truy cập được
  toàn bộ tài khoản; giảm thiểu bằng khóa intake (chỉ 3 group trong phạm vi tới được
  agent), DM disabled hai lớp, profile khóa công cụ, và chốt chặn gửi.
- **Tin nhắn là dữ liệu không tin cậy:** nội dung group có thể chứa câu chữ
  cố tình lừa agent (prompt injection). Giảm thiểu: agent không có công cụ
  nguy hiểm, đầu ra duy nhất là file JSON theo schema cố định, relay + ingest
  kiểm tra lại schema/type trước khi ghi DB, admin duyệt bản ghi trong app.
- **`hermes update` ghi đè bản vá:** xem quy trình bắt buộc ở mục 4.7.

---

## 6. Trạng thái & việc còn lại

### 6.1. Đã hoàn thành (kiểm chứng trên hệ thật)

- ✅ Hermes v0.23.2 cài trên server nội bộ, profile `gf-recorder` khóa 5 toolset.
- ✅ Ghép nối WhatsApp với số chính (2026-11-19 12:44), phiên đã kiểm chứng
  kết nối lại thành công bằng chính credentials đã lưu.
- ✅ Khóa phạm vi: 3 group trong allowlist (`120363421346130787@g.us`, `120363420637565910@g.us`, `120363405283973589@g.us`) — mở rộng từ 1 group ngày 2026-11-19, DM disabled,
  require_mention=false.
- ✅ Skill `wa-room-recorder` enabled; relay `gf-wa-relay.timer` chạy mỗi
  phút, đã kiểm chứng đầu-cuối bằng bản ghi test.
- ✅ Chốt chặn GF SENDBLOCK đã áp + test khô + **chặn thật** thông báo khởi
  động của Hermes ở go-live.
- ✅ API key riêng của bot đã cấu hình và kiểm chứng (GET /v1/models → 200,
  `cx/gpt-5.6-sol` có trong danh sách; gateway warm-up nhận ngữ cảnh 372k token).
- ✅ **Sửa lớp admission 2026-11-19 15:19**: thêm `group_allowed_chats` (3 JID)
  vào `platforms.whatsapp.extra` — trước đó lớp admission thứ hai của
  gateway từ chối **mọi** tin thật của thành viên group
  (`user_not_authorized`, mục 3.2.1). Restart sạch, "✓ whatsapp connected"
  15:19:28, `gf-sendblock.log` 14 → 16 dòng như kỳ vọng. Kiểm chứng hiệu
  lực cấu hình qua `hermes -p gf-recorder config get`; bằng chứng sống cuối
  cùng (tin thật đầu tiên được admission chấp nhận) chờ tin phối hợp nghiệm
  thu ở mục 6.3 — trong 5 phút theo dõi ngay sau restart không có tin thật
  nào đến.
- ✅ **Go-live 2026-11-19 13:30:44**: `hermes-gateway-gf-recorder.service`
  active + enabled + linger; bridge kết nối ở port 3010; footprint
  ~310–340 MB RAM.
- ✅ Module "Thông báo WhatsApp" live trong app; phân quyền hiện chỉ admin.
- ✅ **Tính năng thông báo `thongbao` (2026-11-19):** skill 1.2.0 phân loại
  thông báo chính thức; ingest rẽ nhánh đăng thẳng lên bảng Thông báo
  Dashboard (`forum_posts`, target toàn công ty, không duyệt — quyết định
  của chủ hệ thống). Đã test đầu-cuối bằng dữ liệu tổng hợp và dọn sạch
  (mục 3.6); gateway đã restart để nạp skill mới (14:45, chốt chặn
  SENDBLOCK vẫn chặn thông báo tắt/mở dịch vụ như thường lệ).
- ✅ **Định tuyến `thongbao` theo người gửi (2026-11-19 15:46, quyết định
  "tạm" của chủ hệ thống):** chỉ thông báo từ **Nhung Nhân sự** (số trong
  `WA_ANNOUNCE_DIRECT_PHONES` ở `.env.wa`) mới đăng thẳng lên Dashboard;
  mọi thông báo khác vào `wa_records` chờ admin duyệt (migration thêm
  `thongbao` vào CHECK; module có badge + bộ lọc "Thông báo"). Skill lên
  **1.3.0** (bắt buộc `sender_phone` mọi bản ghi); gateway restart 15:52
  nạp bản mới, SENDBLOCK vẫn chặn cặp tin tắt/mở như thường lệ. Ma trận
  test đầy đủ đạt (mục 3.6).

### 6.2. Dữ liệu test đang có trong bảng

10 bản ghi **[TEST]** (ids **1–10**) được tạo trong quá trình xây dựng/kiểm
chứng — đều ghi rõ [TEST], xóa tự do trong app:

| id | Loại | Trạng thái | Nguồn gốc |
|---|---|---|---|
| 1 | datlich | daxuly | Test ingest + PATCH trạng thái lúc xây module |
| 2 | checkin | moi | Test ingest (có tọa độ mẫu) |
| 3 | baocao | moi | Test ingest (loại baocao — bot thật không tạo) |
| 4 | checkout | moi | Test khi thêm loại checkout (không tọa độ) |
| 5 | checkin | moi | Test check-in phòng họp không tọa độ |
| 6 | datlich | moi | Test đầu-cuối qua relay (file → ingest) |
| 7 | datlich | moi | Test hồi quy khi thêm nhánh `thongbao` (2026-11-19) — module không có endpoint xóa cứng nên giữ lại cùng nhóm [TEST] này |
| 8 | thongbao | moi | Test định tuyến theo người gửi (2026-11-19): số KHÁC số đăng thẳng → vào module |
| 9 | thongbao | moi | Test định tuyến: thongbao THIẾU sender_phone → vào module (fail-safe) |
| 10 | datlich | moi | Test hồi quy datlich khi thêm định tuyến thongbao |

Bài **forum [TEST-THONG-BAO]** dùng để nghiệm thu nhánh `thongbao`
(forum_posts id=2) đã **xóa qua API ngay sau khi kiểm chứng**. Hai bài
[TEST] đăng thẳng khi nghiệm thu định tuyến theo người gửi (forum ids 4, 5)
cũng đã **xóa qua admin API** — bảng `forum_posts` hiện còn đúng **1 bài
thật**: thông báo Quốc tế Nam giới 19/11 của GF Nhung NS (id=3).

### 6.3. Việc còn lại

- ⏳ **Nghiệm thu tin thật** (mục 4.3): một tin mượn phòng/check-in/check-out
  thật từ **thành viên khác** trong một group thuộc phạm vi rơi vào module — đây là mốc
  nghiệm thu cuối cùng còn thiếu. Lớp admission đã được sửa (mục 3.2.1) nên
  tin thật giờ mới có đường tới agent; chỉ còn chờ một tin đăng phối hợp để
  xác nhận sống.
- ⏳ Theo dõi sát group + `gf-sendblock.log` + RAM trong tuần đầu vận hành.
- ⏳ Thông báo một lần trong các group thuộc phạm vi rằng group có bot ghi nhận (khuyến
  nghị về minh bạch với thành viên).
- ⏳ Khi ổn định: cân nhắc mở quyền xem module cho trưởng/phó phòng qua
  trang Phân quyền (mục 4.5).

### 6.4. Lịch sử commit liên quan (repo app, branch `wordcraft-viewer-151026`)

| Commit | Nội dung |
|---|---|
| `68f0013` | Module "Thông báo WhatsApp": bảng `wa_records` + ingest bot (X-Bot-Secret) + trang feed |
| `ffa1232` | Phân quyền qua trang Phân quyền; giai đoạn phát triển chỉ admin (gỡ defaults head/deputy) |
| `e0e6375` | Thêm loại bản ghi `checkout` + nới tọa độ check-in thành tùy chọn + relay file→ingest + cập nhật hợp đồng ingest |
| `501b500` | Nhánh `thongbao`: ingest đăng thẳng thông báo lên bảng Thông báo Dashboard (`forum_posts`) + cập nhật hợp đồng ingest (skill v1.2.0 nằm phía Hermes, ngoài git app) |
| `fc19dab` | Định tuyến `thongbao` theo người gửi: chỉ số trong `WA_ANNOUNCE_DIRECT_PHONES` mới đăng thẳng Dashboard, còn lại vào `wa_records` chờ duyệt (migration thêm `thongbao` vào CHECK; badge + bộ lọc "Thông báo" trong module; skill v1.3.0 nằm phía Hermes, ngoài git app) |

Phía Hermes (profile/skill/send-block/relay) không nằm trong git của app —
cấu hình chuẩn để tra cứu chính là tài liệu này + `OPS-WHATSAPP-RECORDER.md`
+ các file `.bak` cạnh file cấu hình trên server.

---

## 7. Phụ lục — bảng tra cứu nhanh

| Hạng mục | Giá trị |
|---|---|
| Server | Nội bộ Golden Farm — LAN `10.0.0.114`, Tailscale `100.71.228.86`, AlmaLinux 9.8 |
| Hermes | v0.23.2 (stable, commit `ae2a81ccc00e`), cài host tại `/home/hermes/.hermes/hermes-agent`, user `hermes` (uid 1003) |
| Profile | `gf-recorder` — `/home/hermes/.hermes/profiles/gf-recorder` |
| Toolsets được phép | `file, memory, skills, todo, session_search` (5/26) |
| Gateway service | `hermes-gateway-gf-recorder.service` (systemd **user** service của `hermes`, enabled + linger; unit tại `~/.config/systemd/user/`) |
| Lệnh gateway | `hermes -p gf-recorder gateway status\|start\|stop\|restart` (dưới user `hermes`) |
| Bridge | `scripts/whatsapp-bridge/bridge.js` (trong cây hermes-agent), nghe `127.0.0.1:3010` (khóa `bridge_port`; port 3000 bận bởi dịch vụ lạ — không đụng) |
| Phiên WhatsApp | `profiles/gf-recorder/whatsapp/session/` — ghép nối 2026-11-19 12:44, số chính của chủ tài khoản |
| Các group trong phạm vi | "GROUP GOLDEN FARM - VP (Không có NV Tỉnh)" — `120363421346130787@g.us`; "GROUP GOLDEN FARM" — `120363420637565910@g.us`; "GROUP GOLDEN FARM - Văn phòng" — `120363405283973589@g.us` |
| Khóa phạm vi chính | `group_policy=allowlist`, `dm_policy=disabled`, `require_mention=false`, `WHATSAPP_MODE=bot` (config.yaml `platforms.whatsapp.extra` + mirror trong profile `.env`) |
| Model | Provider `goldenfarm`: `cx/gpt-5.6-sol` @ `https://api.goldenfarm.com.vn/v1` (9Router; dashboard `https://api.goldenfarm.com.vn/dashboard`) |
| API key | Biến `GOLDENFARM_API_KEY`, profile `.env` (600) — key riêng của bot |
| Skill | `wa-room-recorder` v1.3.0 — `profiles/gf-recorder/skills/goldenfarm/wa-room-recorder/SKILL.md` (enabled; đổi skill xong phải restart gateway để nạp bản mới) |
| Outbox | `profiles/gf-recorder/workspace/wa-outbox/` (+ `sent/`, `failed/`) |
| Relay | `/usr/local/sbin/gf-wa-relay.py` (root) + `gf-wa-relay.timer` (mỗi 1 phút); state `/var/lib/gf-wa-relay/state.json`; tối đa 10 lần thử |
| Bot secret | Biến `WA_BOT_SECRET`, `/home/goldenfarmict/.env.wa` (600, ngoài git) |
| Danh sách đăng thẳng thông báo | Biến `WA_ANNOUNCE_DIRECT_PHONES` trong cùng `.env.wa` — hiện chỉ có số của Nhung Nhân sự; rỗng = không ai đăng thẳng. Đổi xong phải `docker compose up -d backend` |
| Ingest | `POST /api/wa-records/ingest` (header `X-Bot-Secret`); relay gọi qua `http://localhost:8000` |
| App | `/home/goldenfarmict`, branch `wordcraft-viewer-151026`; backend :8000, frontend :8088, PostgreSQL container `goldenfarm-postgres` db `goldenfarmict` |
| Bảng dữ liệu | `wa_records` — loại: datlich/checkin/baocao/checkout/thongbao; trạng thái: moi/daxuly/huy. `thongbao` vào bảng này khi người gửi KHÔNG thuộc danh sách đăng thẳng (chờ admin duyệt) |
| Bảng Thông báo Dashboard | `forum_posts` (router `forum.py`, hộp Thông báo trên Dashboard) — chỉ `thongbao` từ người gửi trong `WA_ANNOUNCE_DIRECT_PHONES` (hiện: Nhung Nhân sự) mới đăng thẳng vào đây, không duyệt: `author_code='wa-bot'`, `author_name='WhatsApp · <người gửi>'`, `target_type='all'`; admin sửa/xóa như bài thường |
| Module app | "Thông báo WhatsApp", key `wa-records`, route `/wa-records`; quyền hiện tại: chỉ admin |
| Hợp đồng ingest | `/home/goldenfarmict/docs/wa_ingest_contract.md` |
| Ghi chú vận hành rút gọn | `profiles/gf-recorder/workspace/OPS-WHATSAPP-RECORDER.md` |
| Send-block | Vá trong `bridge.js` (đầu `sendWithTimeout()` + endpoint `/typing`); bật trừ khi `GF_WA_SEND_BLOCK=0`; bản gốc: `bridge.js.pre-sendblock.bak`; **áp lại sau mọi `hermes update`** |
| Log gateway/agent | `profiles/gf-recorder/logs/gateway.log`, `agent.log`, `errors.log`; hoặc `journalctl --user -u hermes-gateway-gf-recorder.service` |
| Log relay | `/var/log/gf-wa-relay.log` |
| Logrotate | `/etc/logrotate.d/gf-hermes` — daily, giữ 7 bản, compress, copytruncate cho mọi log của hệ (mục 4.9) |
| Restart định kỳ | `gf-hermes-weekly-restart.timer` (+ `.service`) — Chủ Nhật 03:00 giờ máy, trễ ngẫu nhiên ≤120 giây, restart gateway để xả RAM (mục 4.9) |
| Cảnh báo failed/ | Hook `GF ALERT` trong relay; cấu hình `/etc/gf-wa-relay-alert.conf` (root, 600) — hiện **chưa nối webhook** (URL trống, chỉ ghi log); bản relay trước vá: `gf-wa-relay.py.bak-20261119152402` (mục 4.9) |
| Log chốt chặn | `scripts/whatsapp-bridge/gf-sendblock.log` (timestamp, JID đích, độ dài payload — không nội dung) |
| Kill switch | 1) Điện thoại: WhatsApp → Thiết bị liên kết → gỡ thiết bị Hermes. 2) Server: `hermes -p gf-recorder gateway stop` |

---

*Tài liệu được tổng hợp ngày 2026-11-19 từ trạng thái thật của hệ thống.
Khi có thay đổi lớn (đổi group, đổi key, update Hermes, mở quyền module),
cập nhật cả 3 bản sao của tài liệu này.*
