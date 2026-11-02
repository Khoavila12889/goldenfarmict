# Hướng dẫn module Đơn hàng

## Sử dụng

Mở menu **Đơn hàng**. Trang mặc định hiển thị đơn hôm nay, mới nhất ở trên.

- **Hôm nay**: đơn có ngày chứng từ hôm nay.
- **Chưa duyệt**: đơn có trạng thái chưa duyệt.
- **Tất cả**: tra cứu lịch sử; nên nhập từ khóa để thu hẹp kết quả.
- Ô tìm kiếm nhận số chứng từ, mã khách hàng hoặc tên khách hàng.
- Nhấn một thẻ đơn để xem khách hàng, trạng thái, tổng tiền và hàng hóa.

Trang tự làm mới sau 30 giây. Đơn mới trong phiên được viền cam và gắn nhãn
**MỚI**. Nút **Làm mới** cập nhật ngay lập tức.

## Bảo trì

- Backend proxy: `backend/app/routers/orders.py`.
- Frontend: `frontend/src/pages/Orders.jsx` và `Orders.css`.
- API nguồn: `/home/sales-bot-api/routes/zalo-personal.js`.
- Cấu hình: `SALES_BOT_API_URL`, `SALES_BOT_API_KEY` trong `.env`.
- Test/build trước triển khai:

```bash
python3 -m py_compile backend/app/routers/orders.py backend/main.py
cd /home/sales-bot-api && npm test
cd /home/goldenfarmict/frontend && npm run build
```

Chỉ rebuild/recreate `backend` và `frontend`; không down toàn bộ stack và không
đụng volume PostgreSQL.
