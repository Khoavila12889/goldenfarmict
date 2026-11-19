# gf-wa-relay — relay file → ingest cho bot Hermes

Bản nguồn của dịch vụ relay chạy trên server nội bộ. Bản đang chạy được cài tại:

- Script: `/usr/local/sbin/gf-wa-relay.py`
- Units: `/etc/systemd/system/gf-wa-relay.service`, `/etc/systemd/system/gf-wa-relay.timer`
  (timer bật, chu kỳ 1 phút: `systemctl status gf-wa-relay.timer`)
- Log: `/var/log/gf-wa-relay.log`

Nhiệm vụ: quét thư mục `wa-outbox/` trong workspace của profile Hermes
`gf-recorder`, POST từng file JSON bản ghi (đặt phòng họp / check-in /
check-out) tới `POST /api/wa-records/ingest` bằng `X-Bot-Secret` đọc từ
`/home/goldenfarmict/.env.wa`. Thành công → file vào `wa-outbox/sent/`;
thất bại → giữ file, ghi log, thử lại lần sau; 10 lần thất bại → `wa-outbox/failed/`.

Hợp đồng dữ liệu: `docs/wa_ingest_contract.md`.
