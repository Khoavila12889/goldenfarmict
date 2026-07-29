# Test OnlyOffice từ Browser

## Lỗi: NS_ERROR_CONNECTION_REFUSED

Browser không thể kết nối đến OnlyOffice server tại `https://office.goldenfarm.vn`.

## Test 1: Kiểm tra DNS

**Mở Command Prompt:**
```cmd
nslookup office.goldenfarm.vn
```

**Kết quả mong đợi:**
```
Server:  ...
Address:  ...

Name:    office.goldenfarm.vn
Address:  10.0.0.119
```

**Nếu không resolve được:**
→ Cần thêm vào file `C:\Windows\System32\drivers\etc\hosts`:
```
10.0.0.119  office.goldenfarm.vn
```

## Test 2: Kiểm tra browser có truy cập được OnlyOffice không

**Mở browser mới, vào địa chỉ:**
```
https://office.goldenfarm.vn
```

**Kết quả mong đợi:**
- Hiển thị OnlyOffice welcome page
- HOẶC SSL certificate warning (click "Advanced" > "Accept Risk and Continue")

**Nếu lỗi:**
- `Connection refused` → OnlyOffice server không chạy hoặc không accessible
- `Name not resolved` → DNS issue (xem Test 1)
- `SSL error` → Accept certificate

## Test 3: Test API script

**Mở browser, vào:**
```
https://office.goldenfarm.vn/web-apps/apps/api/documents/api.js
```

**Kết quả mong đợi:**
- Hiển thị JavaScript code (file .js)

**Nếu lỗi 404:**
→ OnlyOffice Document Server chưa được cài đúng

## Giải pháp

### Giải pháp 1: Sửa DNS (Khuyến nghị)

**Thêm vào file hosts:**
```
C:\Windows\System32\drivers\etc\hosts
```

**Thêm dòng:**
```
10.0.0.119  office.goldenfarm.vn
```

**Lưu file và test lại browser.**

### Giải pháp 2: Dùng IP trực tiếp (Tạm thời)

**File `.env`:**
```env
ONLYOFFICE_PUBLIC_URL=http://10.0.0.119:8082
```

**Restart backend:**
```powershell
docker-compose restart backend
```

**Lưu ý:** HTTP (không phải HTTPS), vì browser có thể block mixed content.

### Giải pháp 3: Tắt OnlyOffice (Nếu không cần)

**File `.env`:**
```env
ONLYOFFICE_ENABLED=false
```

**Restart backend:**
```powershell
docker-compose restart backend
```

File sẽ chỉ có nút Download thay vì xem trực tiếp.

---

## Tóm tắt

**Vấn đề:** Browser của user không thể kết nối đến `office.goldenfarm.vn` (connection refused)

**Nguyên nhân có thể:**
1. DNS không resolve domain `office.goldenfarm.vn` từ máy user
2. OnlyOffice server không accessible từ mạng của user
3. Firewall block port 443

**Kiểm tra tiếp:**
1. Test `https://office.goldenfarm.vn` từ browser
2. Xem có SSL warning không
3. Nếu không mở được, thêm vào hosts file hoặc dùng IP trực tiếp
