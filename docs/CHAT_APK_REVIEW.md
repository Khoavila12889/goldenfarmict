# Rà soát Chat và APK — 15/10/2026

## Hiện trạng từ mã nguồn

- Android dùng Capacitor, app ID `com.goldenfarm.ict`, đóng gói toàn bộ frontend qua `dist`. Đây chưa phải ứng dụng chỉ có Chat; đăng nhập hiện chuyển về `/`.
- Native nhận máy chủ từ `server_url`; web dùng cấu hình build. Phiên đăng nhập dùng `sessionStorage`.
- Backend chat đã có hàng đợi giới hạn, commit trước broadcast, heartbeat, lịch sử cursor và URL tệp có chữ ký. Xem `CHAT_PRODUCTION.md` để biết giới hạn của bản nâng cấp có sẵn.
- Chưa thấy luồng đăng ký thiết bị, nhận push và mở phòng từ thông báo. WebSocket trong màn hình Chat không đủ để cung cấp thông báo khi ứng dụng bị đóng.
- Android hiện cấu hình SDK 36, min SDK 24 và Java 21 trong Gradle; release chưa có cấu hình ký trong `app/build.gradle`.

## Các sửa đổi trong lần rà soát này

1. Chọn `ws/wss` theo máy chủ đích. Trước đây WebView `https://localhost` làm server HTTP LAN bị đổi thành WSS.
2. Nhận diện native dựa trên kết quả Capacitor thay vì chỉ kiểm tra object tồn tại; tránh web có Capacitor shim sử dụng nhầm máy chủ lưu cũ.
3. Ảnh/tệp, preview và ảnh đang upload được ghép với máy chủ khi hiển thị. Payload gửi tin vẫn giữ URL tương đối có chữ ký vì backend kiểm tra định dạng này.
4. Khi có mạng trở lại hoặc màn hình hiển thị lại, thay socket cũ và kết nối lại; bỏ callback của socket đã bị thay thế. Cleanup gỡ listener và vô hiệu hóa socket trước khi đóng.
5. Không polling khi offline, màn hình ẩn hoặc socket bị từ chối với code 1008. Không mở thêm socket khi socket hiện hành OPEN/CONNECTING.

Chưa có kiểm thử tự động vòng đời WebView: các thay đổi reconnect cần nghiệm thu thiết bị thật. Resume qua `visibilitychange`/`online` chưa thay thế tích hợp native App lifecycle.

## Ưu tiên phát triển tiếp

| Ưu tiên | Hạng mục | Tiêu chí hoàn thành |
|---|---|---|
| P0 | Build Android tái lập | Khai báo trực tiếp Capacitor core/CLI tương thích, cập nhật lockfile trên máy build; sync assets, build debug rồi ký release bằng keystore quản lý riêng |
| P0 | Kiểm thử Android | Hai tài khoản gửi/nhận; đổi Wi-Fi/4G; khóa màn hình; resume; phiên hết hạn; ảnh/PDF; tải lịch sử |
| P1 | Thông báo nền | Đăng ký token thiết bị theo phiên, backend gửi push, thu hồi khi logout; chạm thông báo mở đúng phòng và kiểm tra quyền |
| P1 | Gửi lại an toàn | Lưu client message ID với ràng buộc unique phía DB trước khi bật tự động retry; kiểm thử mất mạng sau commit không tạo tin trùng |
| P1 | Đồng bộ sau gián đoạn | API lấy tin sau cursor, hợp nhất theo ID và giữ trang lịch sử đang xem; lưu read cursor/unread phía server |
| P1 | Phiên trên mobile | Xác định thời hạn phiên/refresh/logout và lưu credential qua cơ chế native phù hợp; tránh chuyển token sang localStorage chỉ để duy trì đăng nhập |
| P2 | Giảm tải khởi động | Chia route bằng dynamic import; cân nhắc entry riêng cho APK Chat sau khi chốt có giữ các module ICT khác không |
| P2 | Mở/lưu tài liệu native | Kiểm thử download trong WebView; bổ sung native file/share workflow nếu trình tải hiện tại không đáp ứng |

Backend CORS hiện có `allow_origin_regex=r".*"`; Android bật cleartext toàn ứng dụng. Trước phát hành bên ngoài, xác định danh sách origin và nhu cầu server HTTP LAN rồi thu hẹp cấu hình tương ứng. Đây là cấu hình chung, chưa thay đổi trong đợt sửa Chat.

## Xác minh tại workspace

- `node frontend/tests/chat-connection.test.js`: 4/4 đạt (HTTP LAN, HTTPS/web, native detection, signed attachment URL).
- `node --test frontend/tests/*.test.js`: cả hai file test đạt.
- `git diff --check`: đạt tại thời điểm sửa.
- Frontend build thành công vào `/tmp/goldenfarmict-chat-mobile-build`, 1.968 modules. JS toàn ứng dụng 1.547,68 kB, gzip 450,95 kB; còn cảnh báo bundle >500 kB.
- Backend unittest chưa chạy được: Python host thiếu `fastapi`. Không suy diễn kết quả kiểm thử của bản trước thành kết quả lần này.
- Không tìm thấy `java`/`adb` trong PATH và chưa có Capacitor CLI trong node_modules. Chưa build APK, sync Android, ký release hay kiểm thử thiết bị.
- Chưa deploy/restart dịch vụ, chạy migration hoặc thử tải trên production. Giữ nguyên các thay đổi có sẵn của người dùng và `frontend/dist` đang dùng.

## Nghiệm thu trước phát hành

1. Trên máy build có Java/Android SDK phù hợp cấu hình Gradle, cài dependency có lockfile và Capacitor CLI tương thích; build frontend, `cap sync android`, sau đó `gradlew assembleDebug` trong thư mục Android.
2. Cài APK trên hai điện thoại, đăng nhập hai tài khoản thuộc cùng phòng. Kiểm tra HTTPS và cấu hình HTTP LAN nếu sản phẩm vẫn hỗ trợ; sửa scheme WebSocket không tự giải quyết mọi chính sách mixed content của WebView.
3. Gửi tin rồi tắt mạng ngay; mở lại app và đối chiếu lịch sử trước khi gửi lại. Hiện chưa có idempotency lưu bền, không được coi tin chưa rõ kết quả là chưa ghi DB.
4. Kiểm tra ảnh đang upload, ảnh đã gửi, ghim, preview, mở PDF và tải file. Khóa màn hình, đổi mạng rồi mở lại; xác nhận không nhận tin trùng và kết nối phục hồi.
5. Kiểm thử phiên hết hạn, bị loại khỏi nhóm và server không truy cập được. Chỉ ký/phát hành khi các ca này đạt; push nền cần triển khai riêng.
