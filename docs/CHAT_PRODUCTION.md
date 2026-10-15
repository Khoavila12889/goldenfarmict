# Chat: bản nâng cấp ngày 15/10/2026

Mục tiêu là hệ thống 500 tài khoản, với bài nghiệm thu 500 kết nối đồng thời trên staging. Chưa chứng nhận sức chịu tải thực tế từ số lượng socket giả lập.

## Luồng dữ liệu

1. Client hiển thị tin chờ xác nhận. Backend kiểm tra kiểu dữ liệu, giới hạn nội dung 10.000 ký tự và quyền thành viên.
2. Hàng đợi tối đa 10.000 tin, ghi PostgreSQL theo lô 32 tin / khoảng 50 ms. SQL chạy trong thread pool, giới hạn statement 5 giây và lock 2 giây cho transaction ghi tin.
3. Chỉ sau commit, backend mới phát tin chính thức tới các tab/thành viên. Hết lượt retry hoặc queue đầy sẽ trả `message_error`, không phát thành công giả.
4. Client mất kết nối trước xác nhận hiển thị trạng thái chưa rõ kết quả. Người dùng kiểm tra lịch sử trước khi gửi lại. Chưa có cơ chế retry từ client với khóa idempotency lưu bền.
5. Lịch sử trả 50 tin gần nhất theo thứ tự thời gian; `before=created_at|id` tải trang cũ mà không bị lệch khi có tin mới. ID phân định các tin cùng timestamp. Response có `has_more`, `next_cursor`. `offset` giữ tương thích nhưng tính từ tin mới nhất.

Queue nằm trong RAM; tiến trình bị kill có thể mất tin chưa xác nhận. Tin đã commit còn trong database, dù fan-out gặp sự cố. Reconnect tải lại cửa sổ gần nhất; người dùng tải lịch sử cũ để xem khoảng gián đoạn dài. Chưa có transactional outbox hoặc đảm bảo giao realtime đúng một lần.

## Cá nhân, nhóm và tốc độ

- Chat cá nhân đúng hai tài khoản. Khóa transaction advisory theo cặp tài khoản ngăn hai request tạo hai phòng mới; dùng lại phòng đã tồn tại. Không tự gộp/xóa phòng trùng từ trước.
- Nhóm tối đa 500 thành viên; thêm người khóa dòng phòng trước khi tính giới hạn. Quyền quản lý giữ nguyên owner/admin và trưởng phòng đối với phòng ban.
- Danh sách phòng lọc quyền ở SQL, lấy tin cuối qua subquery có index, tải thành viên/tên theo lô. Kiểm thử phòng nhóm dùng ba SELECT, không tăng theo số tin/phòng.
- Socket có khóa gửi và timeout; gửi thành công không còn được tính như heartbeat nhận từ client. Reconnect có jitter tránh kết nối dồn cùng thời điểm.
- Docker image mới giới hạn frame WebSocket 64 KiB và queue frame 16. Các cờ này cần recreate backend mới có hiệu lực.

## Tệp và lưu trữ

- Upload chat đọc theo khối 256 KiB, tối đa 10 MiB; xóa tệp dở khi lỗi. Ghi tệp qua thread để tránh chặn event loop.
- URL tệp có chữ ký HMAC, hạn 24 giờ, chỉ được cấp qua API chat đã xác thực hoặc realtime sau kiểm tra thành viên. URL thô không tải được nữa. Link là bearer capability: ai có link hợp lệ có thể dùng tới hết hạn; thu hồi thành viên không thu hồi link đã phát ngay lập tức. Không đưa link vào log hay chia sẻ ngoài phạm vi cần thiết.
- Database và archive chỉ lưu URL gốc; khi tải lịch sử, backend ký URL mới. Mở lại phòng nếu link hết hạn. Client/backend cần phát hành cùng phiên bản để upload gửi chữ ký đúng.
- Giữ `SESSION_SECRET` ổn định và bí mật; nếu thiếu dùng `ONLYOFFICE_SECRET` theo cơ chế phiên hiện tại. Đổi secret làm các link cũ hết hiệu lực.
- PostgreSQL và `backend/uploads/chat` phải được backup cùng recovery set. ZIP archive hiện có là chức năng lưu trữ theo thời gian, không thay thế backup database + file. Không bật tự xóa dữ liệu hoặc tự chạy archive trong bản nâng cấp này.
- Theo dõi dung lượng file, tăng trưởng DB, tuổi backup và kiểm thử restore định kỳ. Chưa tự dọn file đã upload nhưng chưa gửi.

## Kết quả kiểm thử và cách chạy lại

Kết quả tại workspace ngày 15/10/2026: **11/11 tests đạt**, build frontend thành công (Vite, 1.967 module), `git diff --check` đạt. Chưa chạy migration index, PostgreSQL integration, bài tải mạng 500 tài khoản hoặc deploy.

`backend/tests/chat/test_production_chat.py` chạy bằng unittest, SQLite trong RAM, mock thao tác persistence và 500 socket giả. Test override DATABASE_URL tới cổng không phục vụ để không chạm DB production. Phủ commit trước xác nhận, lỗi/retry, queue đầy, shutdown không ghi đôi, phân trang khi có tin mới, quyền xem phòng, số SELECT, phòng cá nhân, chữ ký file và đa tab.

```bash
cd backend
python -m unittest discover -s tests/chat -v
```

Build frontend vào thư mục riêng để giữ nguyên `frontend/dist` hiện hành:

```bash
cd frontend
npm run build -- --outDir /tmp/goldenfarmict-chat-build
```

SQLite không kiểm chứng khóa advisory hay query planner PostgreSQL. Cần test PostgreSQL trên staging: tạo đồng thời cùng cặp direct phải ra một phòng; lỗi DB không có xác nhận giả; khởi động lại sau commit không mất lịch sử; thêm thành viên cạnh tranh không vượt 500; người bị loại khỏi nhóm không được đọc/gửi sau khi cache được vô hiệu hóa.

## Nghiệm thu 500 người dùng

Dùng `tools/chat_load_test.py` trên staging riêng, credentials JSON riêng có quyền hạn chế, 500 mã nhân viên khác nhau và phòng test thực sự chứa các tài khoản đó. Không dùng 500 socket chung tài khoản admin. Script tạo tin thật và chỉ in thống kê, không in token.

```bash
python tools/chat_load_test.py --url wss://STAGING/api/chat/ws \
  --credentials /secure/chat-test-users.json --users 500 --messages 3 \
  --duration 30 --p95-ms 2000 --confirm-staging
```

Mục tiêu nghiệm thu (chưa phải số đo): đủ 500 kết nối, đủ số tin xác nhận, không lỗi, p95 send→ack ≤2 giây. Đối soát message content có tiền tố run_id trong DB sau test. Chạy riêng nhóm 500 người, nhiều nhóm nhỏ và direct; mở nhiều tab; ngắt mạng/reconnect; kiểm tra lịch sử và file 10 MiB. Đo thêm p95 API lịch sử/danh sách phòng, event-loop lag, CPU/RAM, DB pool, queue, tốc độ ổ đĩa và phản hồi người nhận. Chạy soak 30–60 phút và lỗi DB/restart có kiểm soát trước khi ký nghiệm thu.

## Triển khai và rollback

1. Xem diff, đặc biệt workspace có thay đổi ngoài chat sẵn từ trước. Lưu image/revision hiện hành và backup DB + uploads; kiểm tra restore.
2. Khởi đầu một backend worker. Redis bridge hiện có chưa đồng bộ invalidation cache thành viên giữa các worker; chưa nghiệm thu scale nhiều worker. Cache quyền có TTL 60 giây, cache người nhận 30 giây; thay đổi thành viên qua API vô hiệu hóa trong process hiện hành.
3. Index tùy chọn ở `backend/migrations/20261015_chat_history_indexes.sql`; chạy từng lệnh autocommit trên PostgreSQL sau khi kiểm tra tài nguyên. Không chạy trong transaction. Kiểm tra index valid và EXPLAIN trước/sau; bản sửa không cần đổi cột hoặc xóa dữ liệu.
4. Build/recreate chỉ backend và frontend trong cửa sổ phát hành được duyệt. Backend hiện bind-mount source, nhưng tiến trình uvicorn không dùng reload. Thay cờ WebSocket trong Dockerfile cần build image backend, không chỉ restart.
5. Kiểm tra health HTTP, hai tài khoản gửi/nhận thật, file hợp lệ/URL thô bị từ chối, đổi phòng/tải lịch sử, lỗi gửi có phản hồi, `/api/chat/perf-stats` bằng admin. Quan sát queue `failed`, `dropped` và độ trễ.
6. Rollback đồng bộ backend/frontend về bản lưu trước release. Index chỉ bổ sung nên có thể giữ. Không rollback bằng reset toàn bộ workspace, không down stack hoặc xóa volume.

Frontend hiện còn cảnh báo bundle toàn ứng dụng >500 kB; tối ưu chia route toàn hệ thống là công việc riêng. Chưa thay đổi unread lưu bền, tìm kiếm toàn văn, audit thành viên, chống spam theo tài khoản hay quét malware của tệp. Các mục này cần xác định chính sách sản phẩm trước khi bổ sung.
