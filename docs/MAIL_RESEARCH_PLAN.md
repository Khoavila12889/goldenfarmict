# Ứng dụng nhận mail giống Outlook — Research & Plan

Ngày lập: 05/11/2026. Trạng thái: đề xuất, chưa code.

Mục tiêu: thêm module **Mail** vào GoldenFarm ICT, giao diện và luồng dùng gần Microsoft Outlook
(hộp thư 3 cột, folder, đọc/soạn/trả lời, tìm kiếm, thông báo), chạy được cả Web và app Capacitor.

---

## 1. Kết luận nhanh

- **Không tự viết mail server.** GoldenFarm là app nghiệp vụ; chỉ làm **lớp email client**
  kết nối mailbox có sẵn (Microsoft 365/Outlook, Gmail, hoặc IMAP/SMTP nội bộ).
- **Xây module trong stack hiện tại** (FastAPI + React 19 + PostgreSQL + Capacitor), tái dùng
  auth/session, phân quyền module, storage file, signed URL, SSE notification của project.
  Không dựng thêm một app Next.js thứ hai.
- Lấy **Zero (Mail-0)** làm tham chiếu UI/UX + ý tưởng tính năng (MIT), nhưng không fork vì
  stack khác (Next.js/tRPC/Drizzle) và sẽ phải làm lại toàn bộ tích hợp auth.
- Thứ tự làm: **IMAP/SMTP trước** (không phụ thuộc tenant admin), **Microsoft Graph OAuth sau**
  khi có xác nhận IT/M365.

---

## 2. Research open-source

| Giải pháp | Vai trò | Stack | License | Đánh giá cho project |
|---|---|---|---|---|
| **Zero / Mail-0** (`github.com/Mail-0/Zero`) | App email self-host, unified inbox, AI | Next.js, React, tRPC, Drizzle, PostgreSQL | MIT | UI/UX gần Outlook/Gmail nhất, có iOS app. Không nhúng trực tiếp được vào Vite/FastAPI; dùng làm reference + copy pattern component. |
| **Roundcube** | Webmail IMAP | PHP + DB | GPL-3 | Mature, plugin nhiều, LDAP. Nhúng iframe được nhưng lệch UI, thêm stack PHP. |
| **SnappyMail** | Webmail IMAP (fork RainLoop) | PHP, không cần DB | AGPL/MIT | Nhẹ, SPA. Cùng vấn đề stack/SSO. |
| **Cypht** | Webmail đa tài khoản, unified inbox | PHP | LGPL | Hợp nhu cầu nhiều hộp thư; vẫn là app PHP riêng. |
| **SOGo** | Groupware Exchange-like (mail+calendar+contacts, ActiveSync) | C/Objective-C + DB | GPL/LGPL | Dùng nếu cần thay Exchange thật; nặng, không phải app nhúng. |
| **Nextcloud Mail** | Webmail trong Nextcloud | PHP | AGPL | Chỉ dùng nếu công ty đã có Nextcloud; project chỉ import user từ Nextcloud, không có Nextcloud runtime. |
| **Stalwart / Mailcow / Mailu** | Mail server (SMTP/IMAP/JMAP) | Rust / Docker | AGPL/GPL/MIT | Chỉ cần nếu công ty muốn tự host hộp thư `@goldenfarm`. Không cần nếu dùng M365. |
| **Thunderbird / Mailspring** | Desktop client | C++/Electron | MPL/GPL | Không phải web app; tham khảo UX thread/search. |

**Chọn:** module tự viết trong GoldenFarm. Zero là nguồn tham khảo số 1 về bố cục 3 pane,
keyboard shortcut, thread view, AI gợi ý. Roundcube/SnappyMail là **phương án fallback**
nếu chỉ cần webmail gấp (iframe + SSO).

---

## 3. Kiến trúc & logic

```
Browser / Capacitor
   │  REST + SSE (token session hiện có)
   ▼
FastAPI /api/mail/*  ──►  PostgreSQL (metadata, thread, trạng thái)
   │                         ▲
   │  asyncio worker         │
   ▼                         │
Mail Sync Engine ────────────┘
   ├── IMAP (imapclient + IDLE/poll)  ──► mailbox nội bộ / Gmail / M365 (IMAP bật)
   ├── SMTP (aiosmtplib)              ──► gửi thư
   └── Microsoft Graph (OAuth2, delta)──► M365/Outlook (khuyến nghị nếu có tenant)
        │
        └── storage/mail/... (raw .eml + attachment) ← signed URL tái dùng pattern chat
```

### 3.1 Tài khoản & xác thực
- Mỗi user GoldenFarm gắn 0..N `mail_accounts` (cá nhân hoặc hộp thư dùng chung).
- Hai kiểu kết nối:
  - `imap_smtp`: host/port/TLS + username + app password (khuyến khích app password, không lưu
    mật khẩu chính). Test kết nối trước khi lưu.
  - `microsoft_graph`: OAuth2 authorization-code + refresh token, scope `Mail.ReadWrite`,
    `Mail.Send`, `offline_access`. Cần tenant admin consent.
- Token/app password mã hoá **AES-GCM** bằng key từ env (`MAIL_SECRET_KEY`, sinh key riêng,
  không dùng `SESSION_SECRET`).
- Không tin `user_code` client gửi lên; luôn resolve identity từ `verify_session`
  (xem `backend/app/core/auth.py:195`) và kiểm tra account thuộc user.

### 3.2 Đồng bộ (sync engine)
- Worker chạy nền trong backend (asyncio task, khởi động ở `main.py` cạnh
  `start_chat_runtime`), hoặc process riêng nếu tải lớn.
- Lần đầu: `SELECT folder`, lấy UID/UIDVALIDITY, backfill N mail gần nhất (mặc định 500,
  cấu hình theo account) — không tải toàn bộ hộp thư.
- Tăng dần:
  - `IDLE` nếu server hỗ trợ; fallback poll mỗi 60–120s.
  - Graph: `delta` query + `subscription` webhook (hoặc poll delta nếu chưa mở webhook công khai).
- Bắt buộc xử lý: `UIDVALIDITY` đổi → reset folder; dedupe theo `Message-ID` + UID;
  expunge/flag changes; folder mapping (`INBOX`, `Sent`, `Drafts`, `Trash`, `Junk`, custom).
- Mỗi account có `mail_sync_state` (last_uid, uidvalidity, last_sync_at, cursor_graph).
- Ghi DB theo batch; lỗi 1 message không làm hỏng cả folder.
- Sau khi sync: phát event qua `core/events.py` (SSE sẵn có) để UI cập nhật badge/unread.

### 3.3 Message, thread, MIME
- Lưu raw `.eml` vào `backend/storage/mail/{account_id}/{folder}/{uid}.eml` (an toàn, có thể
  re-index), DB lưu metadata + body đã parse.
- Parse bằng `mail-parser` (hoặc stdlib `email` + `charset_normalizer`):
  subject decode, From/To/Cc/Bcc, date, `Message-ID`, `In-Reply-To`, `References`, flags.
- Thread: ghép theo `References`/`In-Reply-To`; fallback normalize subject
  (bỏ `Re:`, `Fwd:`, `[EXT]`, gộp theo đối tác + khoảng thời gian).
- Body: lưu `text_plain`, `text_html` (đã sanitize), `snippet` (255 ký tự).
- Attachment: lưu file + metadata (filename, mime, size, content_id); tái dùng
  `signed_file_url` trong `backend/app/core/chat_files.py:31` cho URL tải.
- HTML an toàn: sanitize bằng `bleach`/`nh3`, chặn script/iframe/form; ảnh remote mặc định
  chặn, có nút "Hiển thị ảnh"; link mở tab ngoài.

### 3.4 Soạn / gửi / nháp
- Draft lưu server (bảng `mail_drafts`) + sync xuống folder Drafts nếu provider hỗ trợ.
- Gửi qua SMTP (`aiosmtplib`, STARTTLS/SSL) hoặc Graph `sendMail`.
- Outbox pattern: ghi `mail_outbox` → worker gửi → cập nhật trạng thái (queued/sent/failed).
  Tránh mất mail khi mất mạng (quan trọng với app di động).
- Reply/Reply-all/Forward dựng header chuẩn (`In-Reply-To`, `References`, `Subject`).
- Đính kèm dùng upload hiện có, giới hạn size theo provider (Gmail 25MB, M365 3–150MB tuỳ
  cấu hình), cảnh báo trước khi gửi.

### 3.5 Tìm kiếm
- Giai đoạn 1: PostgreSQL `tsvector` trên subject + body text + từng người gửi/nhận,
  `unaccent` + `pg_trgm` cho tiếng Việt không dấu; lọc theo folder/date/from/unread/has-attachment.
- Giai đoạn 2 (nếu > vài trăm nghìn mail): Meilisearch (dễ self-host, hỗ trợ tiếng Việt tốt hơn).
- Không phụ thuộc search phía IMAP (mỗi provider hành vi khác nhau).

### 3.6 Realtime & thông báo
- Web: SSE `/api/events` hiện có → event `mail:new`, `mail:unread`, `mail:sync`.
- App: badge ở nav; giai đoạn sau thêm FCM (Capacitor push) khi có cấu hình Firebase.
- Unread count theo folder, cache ngắn, không query DB mỗi lần render.

### 3.7 Offline (Capacitor)
- Web/native dùng chung REST. Cache danh sách + nội dung gần nhất trong IndexedDB
  (hoặc SQLite plugin) để xem offline; gửi khi có mạng qua outbox.
- Không cần sync engine chạy trên thiết bị — server là nguồn chuẩn.

---

## 4. Data model (PostgreSQL)

```
mail_accounts(id, employee_code, provider, email_address, display_name,
              imap_host, imap_port, imap_tls, smtp_host, smtp_port, smtp_tls,
              username, secret_encrypted, oauth_refresh_encrypted, oauth_expires_at,
              sync_enabled, sync_limit, created_at, updated_at)
mail_sync_state(account_id PK, folder_path, uidvalidity, last_uid, last_sync_at,
                graph_delta_cursor, status, last_error)
mail_folders(id, account_id, path, name, role, unread_count, total_count, sort_order)
mail_messages(id, account_id, folder_id, uid, message_id, thread_id,
              subject, snippet, from_name, from_email, to_json, cc_json, bcc_json,
              sent_at, received_at, is_read, is_starred, is_draft, has_attachment,
              size_bytes, raw_path)
mail_message_bodies(message_id PK, text_plain, text_html_sanitized)
mail_attachments(id, message_id, filename, mime_type, size_bytes, content_id, storage_path)
mail_threads(id, account_id, subject_norm, last_message_at, message_count, unread_count)
mail_drafts(id, account_id, employee_code, in_reply_to, to_json, cc_json, bcc_json,
            subject, body_html, attachments_json, updated_at)
mail_outbox(id, account_id, draft_id, payload_json, status, attempts, last_error,
            created_at, sent_at)
mail_rules(id, account_id, employee_code, name, conditions_json, actions_json,
           enabled, sort_order)
mail_contacts(id, account_id, email, display_name, last_used_at, use_count)
```

Chỉ mục: `(account_id, folder_id, received_at DESC)`, `(account_id, thread_id)`,
GIN `tsvector`, `(account_id, message_id)` unique-ish để dedupe.

---

## 5. API đề xuất

| Method | Endpoint | Việc |
|---|---|---|
| GET | `/api/mail/accounts` | Danh sách hộp thư của tôi |
| POST | `/api/mail/accounts` | Thêm IMAP/SMTP (test kết nối trước khi lưu) |
| POST | `/api/mail/accounts/{id}/test` | Test IMAP+SMTP |
| POST | `/api/mail/oauth/microsoft/start` | Trả URL consent |
| GET | `/api/mail/oauth/microsoft/callback` | Đổi code → refresh token |
| DELETE | `/api/mail/accounts/{id}` | Xoá kết nối (không xoá mail đã index) |
| GET | `/api/mail/folders?account_id=` | Folder + unread |
| GET | `/api/mail/messages?account_id=&folder=&q=&filter=&cursor=` | Danh sách phân trang |
| GET | `/api/mail/messages/{id}` | Chi tiết (tự đánh dấu đã đọc) |
| GET | `/api/mail/threads/{id}` | Cả thread |
| POST | `/api/mail/messages/{id}/flags` | read/star/move/trash/junk |
| POST | `/api/mail/drafts` · PATCH · DELETE | Nháp |
| POST | `/api/mail/drafts/{id}/send` | Gửi |
| POST | `/api/mail/attachments` | Upload (tái dùng service hiện có) |
| GET | `/api/mail/search?...` | Tìm kiếm |
| POST | `/api/mail/sync` | Trigger sync account |
| CRUD | `/api/mail/rules` | Bộ lọc |
| SSE | `/api/events` | event `mail:new` |
| GET | `/api/mail/files/...` | Signed URL tải attachment/raw |

Quyền: thêm module `mail` vào bảng phân quyền 3-tier hiện có; route mới có gate
`MODULE_MAP['/mail'] = 'mail'` trong `frontend/src/components/Layout.jsx`.

---

## 6. UI/UX giống Outlook

- Route `/mail`, nav item `Mail` (icon `Mail` của lucide-react), thêm vào `allNavItems`
  trong `Layout.jsx` và `MODULE_MAP`.
- Layout desktop ≥1024px: 3 cột
  1. **Folder rail** (trái, 200–240px): account switcher, Inbox/Sent/Drafts/Trash/Junk,
     custom folder, unread badge, nút "Soạn thư".
  2. **Message list** (giữa, ~40%): nhóm theo ngày, avatar tròn, người gửi đậm nếu chưa đọc,
     subject, snippet, giờ, đính kèm/star; chọn nhiều, hover actions.
  3. **Reading pane** (phải): header + action bar (Reply/Reply all/Forward, star, archive,
     delete, more), body HTML sanitize, attachment chips, thread gập/mở.
- Tablet: 2 cột; mobile <768px: list toàn màn hình → mở chi tiết, folder dạng drawer,
  touch target ≥36px.
- Composer: panel nổi góc phải (desktop) / full-screen (mobile), To/Cc/Bcc có autocomplete
  từ `mail_contacts` + `employees.email`, subject, editor đơn giản (contenteditable),
  đính kèm, lưu nháp tự động.
- Đồng bộ ngôn ngữ UI tiếng Việt như các module hiện có (`docs/HDSD_*.md`).
- File CSS riêng `Mail.css`, biến CSS theo palette hiện tại của project.

---

## 7. Bảo mật

- App password / refresh token mã hoá at-rest; không log secret; rotate key có kế hoạch.
- HTML email sanitize; chặn tracking pixel/ảnh remote mặc định; cảnh báo link lạ.
- Chống phishing cơ bản: hiển thị domain thật của người gửi, cảnh báo display-name giả,
  banner "thư từ ngoài tổ chức".
- Attachment: giới hạn loại/size, quét ClamAV nếu có, không thực thi; tải qua signed URL TTL.
- Rate limit endpoint gửi mail + đăng nhập account; audit log thao tác xoá/gửi.
- Nếu tự host mail server: bắt buộc SPF/DKIM/DMARC, TLS, chống open relay; ưu tiên Stalwart.

---

## 8. Lộ trình

| Pha | Thời lượng gợi ý | Phạm vi | Kết quả |
|---|---|---|---|
| **P0** | 1.5–2 tuần | Bảng DB + account IMAP/SMTP + sync poll + folder/list/detail + xem attachment + quyền `mail` | Đọc mail thật trên Web |
| **P1** | 2–3 tuần | Soạn/gửi SMTP, draft, reply/forward, flags, search PG, badge + SSE, mobile layout | Dùng hằng ngày được |
| **P2** | 3–4 tuần | Microsoft Graph OAuth + delta/webhook, thread view, rules, contacts, outbox, offline cache | Ngang Outlook cơ bản |
| **P3** | sau | AI tóm tắt/soạn gợi ý, lịch, hộp thư dùng chung, import/migration, push FCM | Nâng cao |

Ước lượng tổng MVP khả dụng (P0+P1): **4–6 tuần** cho 1–2 dev quen codebase.

---

## 9. Ý tưởng skill cho agent (theo format `.claude/skills/<name>/SKILL.md`)

Có thể tạo 6 skill tái dùng cho các phiên code sau:

1. **`mail-imap-sync-engineer`**
   - Trigger: thiết kế/sửa sync IMAP, UIDVALIDITY, IDLE, dedupe, folder mapping.
   - Nội dung: state machine sync, batch commit, retry/backoff, test với GreenMail/Dovecot.
2. **`outlook-like-mail-ui`**
   - Trigger: dựng/sửa UI 3 pane, composer, responsive mail.
   - Nội dung: blueprint component, breakpoint, a11y, giữ convention `Layout.jsx`/CSS project.
3. **`mail-mime-security`**
   - Trigger: parse MIME, sanitize HTML, attachment.
   - Nội dung: checklist bleach/nh3, chặn remote image, signed URL TTL, giới hạn size/type.
4. **`mail-oauth-graph`**
   - Trigger: tích hợp Microsoft Graph / Gmail OAuth.
   - Nội dung: flow consent, scope tối thiểu, mã hoá refresh token, delta + subscription.
5. **`mail-db-migration`**
   - Trigger: thêm bảng/index mail, backfill.
   - Nội dung: SQLAlchemy model + migration idempotent + index + rollback plan.
6. **`mail-e2e-fixtures`**
   - Trigger: viết test mail.
   - Nội dung: GreenMail container, fixture .eml (HTML, attachment, charset VN, thread), pytest.

Mỗi skill nên ngắn (40–80 dòng), có frontmatter `name` + `description` rõ trigger, workflow
đánh số, guardrail "không tin input client, không log secret, không phá module khác".

---

## 10. Quyết định cần chốt trước khi code

1. Hộp thư thật của công ty đang ở đâu: **Microsoft 365/Exchange**, Gmail, hay mail server nội bộ?
   (Quyết định IMAP trước hay Graph OAuth là ưu tiên.)
2. Có cần **tự host mail server** (`@goldenfarm` domain) hay chỉ là client?
3. Có cần **hộp thư dùng chung** (sales@, hr@) và phân quyền theo phòng ban không?
4. Có yêu cầu **AI** (tóm tắt/gợi ý trả lời) ngay từ đầu hay để P3?
5. Có cần **calendar/contacts** (giống Outlook đầy đủ) hay chỉ mail?

---

## 11. Phụ lục — thư viện Python đề xuất

```
imapclient>=3.0        # IMAP sync (chạy trong thread)
aiosmtplib>=3.0        # gửi SMTP async
mail-parser>=3.15      # parse MIME/header/thread
bleach>=6.1 hoặc nh3   # sanitize HTML
cryptography>=42       # AES-GCM mã hoá token
msal>=1.28             # Microsoft Graph OAuth (nếu dùng M365)
httpx>=0.27            # Graph REST/delta
```

Test: `GreenMail` (IMAP/SMTP giả) hoặc Dovecot container; fixture `.eml` tiếng Việt có
attachment và thread.
