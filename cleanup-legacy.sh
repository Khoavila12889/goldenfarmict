#!/usr/bin/env bash
# cleanup-legacy.sh — DỌN DẸP OnlyOffice + Craft SAU KHI đã nghiệm thu Grist.
# ⚠️  CHƯA CHẠY NGAY. Chỉ chạy sau khi test A/B xong và có lệnh xác nhận.
# Điều kiện tiên quyết:
#   1. Grist đã chạy ổn định, import/export Excel mẫu OK.
#   2. Đã export/backup dữ liệu cần thiết từ onlyoffice-data / onlyoffice-logs.
#   3. Đã sao lưu docker-compose.yml + .env (script tự tạo backup timestamp).
set -euo pipefail
cd "$(dirname "$0")"

TS=$(date +%F_%H%M%S)
echo "=== [0/5] Sao lưu an toàn (TS=${TS}) ==="
cp -v docker-compose.yml "docker-compose.yml.pre-cleanup.${TS}.bak"
[ -f .env ] && cp -v .env ".env.pre-cleanup.${TS}.bak" || true

echo "=== [1/5] Dừng và xóa container legacy ==="
docker compose stop onlyoffice wordcraft-web gridcraft-web pdfcraft-web || true
docker compose rm -f onlyoffice wordcraft-web gridcraft-web pdfcraft-web || true
# Phòng khi container còn sót với tên cũ:
docker rm -f goldenfarm-onlyoffice goldenfarm-wordcraft-web goldenfarm-gridcraft-web goldenfarm-pdfcraft-web 2>/dev/null || true

echo "=== [2/5] Xóa volume thừa (CHỈ sau khi đã export dữ liệu!) ==="
echo "    Kiểm tra volume hiện có:"
docker volume ls | grep -E "onlyoffice|grist|postgres" || true
read -r -p "Đã export dữ liệu OnlyOffice xong? Gõ YES để xóa volume onlyoffice-data + onlyoffice-logs: " CONFIRM
if [ "${CONFIRM}" = "YES" ]; then
  docker volume rm goldenfarmict_onlyoffice-data goldenfarmict_onlyoffice-logs 2>/dev/null \
    || docker volume rm onlyoffice-data onlyoffice-logs 2>/dev/null \
    || echo "WARN: không xóa được volume (kiểm tra tên volume bằng 'docker volume ls')"
else
  echo "SKIP: giữ nguyên volume OnlyOffice."
fi

echo "=== [3/5] Xóa file tĩnh ./craft-web/ (nếu không còn nhu cầu) ==="
read -r -p "Xóa toàn bộ ./craft-web/ ? Gõ YES để xóa: " CONFIRM2
if [ "${CONFIRM2}" = "YES" ]; then
  rm -rf ./craft-web/
  echo "Đã xóa ./craft-web/"
else
  echo "SKIP: giữ nguyên ./craft-web/"
fi

echo "=== [4/5] Thu gọn docker-compose.yml ==="
echo "    Mở docker-compose.yml và XÓA THỦ CÔNG các block service:"
echo "      - onlyoffice"
echo "      - wordcraft-web / gridcraft-web / pdfcraft-web (profile craft)"
echo "    Và trong block volumes: xóa onlyoffice-data, onlyoffice-logs (giữ postgres-data + grist-data)."
echo "    Sau đó kiểm tra: docker compose config"

echo "=== [5/5] Giải phóng image/RAM/ổ cứng ==="
docker image prune -f
df -h / | tail -n 1
free -h | head -n 2

echo "DONE. Kiểm tra lại: docker compose ps"
