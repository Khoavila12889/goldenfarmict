# Checklist Debug OnlyOffice

## Tình trạng hiện tại

✅ Backend trả về HTTP 200 OK cho `/api/documents/onlyoffice/config`
✅ OnlyOffice container đang chạy và healthy
✅ OnlyOffice API script accessible: `http://10.0.0.9:8080/web-apps/apps/api/documents/api.js`
✅ Config đúng:
   - Document URL: `http://backend:8000/api/documents/onlyoffice/download?token=...`
   - Callback URL: `http://backend:8000/api/documents/onlyoffice/callback`
   - DocsAPI URL: `http://10.0.0.9:8080/web-apps/apps/api/documents/api.js`

## ❓ Vấn đề: "Vẫn không đọc được file"

Cần làm rõ chính xác hiện tượng:

### Câu hỏi 1: Khi click vào file .doc/.docx, điều gì xảy ra?

A. **Không có gì xảy ra** (không mở modal, trang vẫn như cũ)
   → Vấn đề: JavaScript event không fire hoặc component không mount

B. **Màn hình tối đi nhưng không hiển thị gì** (overlay đen)
   → Vấn đề: Modal render nhưng thiếu CSS hoặc content

C. **Hiển thị modal trắng** (có header với tên file và nút X)
   → Vấn đề: OnlyOffice editor không load

D. **Hiển thị modal với loading spinner mãi**
   → Vấn đề: Đang chờ load script hoặc config

E. **Hiển thị lỗi "Error: 0. Build: 129"** hoặc lỗi khác
   → Vấn đề: OnlyOffice không thể download file từ backend

F. **Hiển thị lỗi "Không thể tải ONLYOFFICE API từ máy chủ"**
   → Vấn đề: Browser không load được script từ `http://10.0.0.9:8080`

### Câu hỏi 2: Browser Console có lỗi gì không?

**Bước 1:** Mở Browser Console
- Nhấn F12
- Chọn tab **Console**

**Bước 2:** Click vào file .doc/.docx

**Bước 3:** Xem console có dòng nào màu đỏ không?

**Gửi screenshot hoặc copy text lỗi**

### Câu hỏi 3: Network Tab có request nào fail không?

**Bước 1:** Mở Browser DevTools (F12)
- Chọn tab **Network**
- Click nút "Clear" để xóa logs cũ

**Bước 2:** Click vào file .doc/.docx

**Bước 3:** Xem các request:

| Request | Expected Status | Notes |
|---------|----------------|-------|
| `/api/documents/onlyoffice/config?...` | 200 OK | Backend config |
| `http://10.0.0.9:8080/web-apps/apps/api/documents/api.js` | 200 OK | OnlyOffice API script |
| `http://10.0.0.9:8080/web-apps/apps/...` (các file khác) | 200 OK | OnlyOffice resources |

**Nếu có request nào status khác 200, gửi screenshot hoặc copy URL + status code**

## Test nhanh

### Test 1: OnlyOffice có chạy không?

```powershell
curl http://10.0.0.9:8080/healthcheck
```

**Kết quả mong đợi:** `true`

### Test 2: Backend config có đúng không?

```powershell
curl "http://10.0.0.9:8088/api/documents/onlyoffice/config?config_id=28&file_path=/test.docx&user_code=admin&user_role=admin"
```

**Kết quả mong đợi:** JSON với `_docsApiUrl`, `document.url`, etc.

### Test 3: OnlyOffice có thể download file từ backend không?

Lấy `document.url` từ response Test 2, sau đó:

```powershell
docker exec goldenfarm-onlyoffice curl -I "http://backend:8000/api/documents/onlyoffice/download?token=..."
```

**Kết quả mong đợi:** HTTP 200 OK

## Giải pháp theo từng trường hợp

### Trường hợp A: Không có gì xảy ra

**Fix:** Rebuild frontend với code mới

```powershell
docker-compose down frontend
docker-compose up -d --build frontend
```

Đợi 2-3 phút build xong.

### Trường hợp B/C: Modal hiển thị nhưng trống

**Fix:** CSS chưa được build hoặc script không load được

1. Kiểm tra browser console có lỗi CORS hoặc network error
2. Nếu có lỗi Mixed Content (HTTP vs HTTPS), xem phần Mixed Content bên dưới

### Trường hợp D: Loading spinner mãi

**Fix:** Script không load được hoặc config sai

1. Kiểm tra Network tab xem request `api.js` có status 200 không
2. Nếu fail, kiểm tra OnlyOffice container:
   ```powershell
   docker logs goldenfarm-onlyoffice --tail 50
   ```

### Trường hợp E: Error 0 Build 129

**Fix:** OnlyOffice không thể download file từ backend

1. Kiểm tra `BACKEND_PUBLIC_URL=http://backend:8000` trong backend container:
   ```powershell
   docker exec goldenfarm-backend bash -c 'echo $BACKEND_PUBLIC_URL'
   ```
2. Test download từ OnlyOffice:
   ```powershell
   docker exec goldenfarm-onlyoffice curl -I http://backend:8000/api/health
   ```
   Phải trả về HTTP 200 OK

### Trường hợp F: Không thể tải API

**Fix:** Browser không truy cập được OnlyOffice

1. Test từ browser: `http://10.0.0.9:8080/healthcheck`
2. Nếu fail, kiểm tra port mapping:
   ```powershell
   docker ps | findstr 8080
   ```

## Mixed Content Issue (HTTP trên trang HTTPS)

Nếu frontend chạy trên HTTP (`http://10.0.0.9:8088`) thì không có vấn đề.

Nhưng nếu có lỗi Mixed Content:

**Firefox:** Settings > Privacy & Security > HTTPS-Only Mode > Turn off

**Chrome:** Click icon bên trái address bar > Site settings > Insecure content > Allow

## Nếu vẫn không được

**Tắt OnlyOffice tạm thời để dùng file download thay vì view:**

File `.env`:
```env
ONLYOFFICE_ENABLED=false
```

Restart backend:
```powershell
docker-compose restart backend
```

---

## Hãy trả lời 3 câu hỏi trên và gửi screenshot console + network tab!
