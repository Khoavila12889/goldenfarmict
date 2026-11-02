# Univer SDK cho GoldenFarm

Ứng dụng độc lập dùng Univer Sheets Core Preset và Facade API, làm nền để phát triển bảng tính cho dự án. Có dữ liệu mẫu, công thức, chỉnh sửa ô, lưu thủ công vào localStorage và tải snapshot JSON. Giao diện bao ngoài tiếng Việt; thanh công cụ Univer dùng tiếng Anh.

## Docker Compose

Chạy từ thư mục gốc dự án, sau khi được phép triển khai trên VPS:

```bash
docker compose --profile univer config --quiet
docker compose --profile univer up -d --build --no-deps univer-web
docker compose --profile univer ps univer-web
curl -fsS http://127.0.0.1:8774/healthz
```

Profile `univer` không được khởi động trong lần `docker compose up` mặc định. Chỉ build/recreate service `univer-web`; không cần restart backend, frontend hoặc database. `/healthz` kiểm tra HTTP; cần mở trình duyệt để kiểm tra SDK và công thức.

Mặc định chỉ truy cập từ VPS tại `http://127.0.0.1:8774`. Từ máy cá nhân có thể dùng SSH tunnel:

```bash
ssh -L 8774:127.0.0.1:8774 user@vps
```

Sau đó mở `http://localhost:8774`. Có thể cấu hình `UNIVER_PORT` và `UNIVER_BIND_ADDRESS` trong `.env` nếu cần. Ứng dụng mẫu chưa có đăng nhập; chỉ công khai sau khi đã bổ sung kiểm soát truy cập phù hợp.

Dừng riêng ứng dụng bằng `docker compose --profile univer stop univer-web`. Dữ liệu localStorage nằm trên trình duyệt, không nằm trong container/volume và không được backup cùng database. Đổi host/port sẽ tạo vùng lưu trình duyệt khác. Bấm **Lưu trên trình duyệt** trước khi tải lại; chưa có tự động lưu. JSON là snapshot Univer, không phải XLSX.

## Phát triển

Yêu cầu Node.js 22 trở lên:

```bash
cd univer-web
npm ci
npm run dev -- --host 127.0.0.1
# Kiểm tra bản production:
npm run build
```

`src/sdk.js` đóng gói vòng đời SDK: `createSpreadsheet(container, snapshot)` trả về `univerAPI`, `getSnapshot()` và `dispose()`. Có thể truyền snapshot JSON từ API của dự án để khởi tạo; gọi `getSnapshot()` để lưu và `dispose()` khi gỡ component. `src/main.js` hiện chỉ là ứng dụng mẫu lưu cục bộ. Khi thêm lưu backend, cần kiểm tra quyền truy cập tài liệu ở server và xử lý xung đột phiên bản.

Giữ tất cả package `@univerjs/*` cùng phiên bản; commit `package-lock.json` sau khi cập nhật. Docker dùng `npm ci`, build qua Vite và phục vụ bundle bằng Nginx, không cần CDN lúc chạy. Có thể thêm preset filter, validation, conditional formatting theo nhu cầu.

Chưa tích hợp Docs/Slides, mở file Excel, cộng tác thời gian thực, backend lưu tài liệu hoặc module Documents của GoldenFarm. Các tính năng Pro/server cần đánh giá dependency và điều kiện sử dụng riêng trước khi thêm.

## Tài liệu tham khảo

Kiểm tra khi bổ sung: Compose config hợp lệ, build production thành công; smoke test Chromium xác nhận render canvas, công thức tổng `450000`, lưu localStorage, xuất JSON, khôi phục sau reload và thông báo khi bộ nhớ bị chặn. Chưa build image/chạy container trên VPS. Vite cảnh báo bundle chính lớn (~1,82 MB gzip); Nginx bật gzip cho JS/CSS.

- [Repository và giấy phép Univer](https://github.com/dream-num/univer)
- [Cài đặt và Preset Mode](https://docs.univer.ai/guides/sheets/getting-started/installation)
- [Facade API](https://docs.univer.ai/guides/sheets/getting-started/facade)

Univer SDK là thư viện nhúng; service này là ứng dụng mẫu tự xây dựng bằng SDK, không phải Univer Server.
