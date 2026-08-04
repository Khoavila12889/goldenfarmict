GOOGLE DRIVE SERVICE ACCOUNT CONFIGURATION
==========================================

Các bước cấu hình Google Drive Shared Drive:

1. Tạo Service Account
   - Truy cập: https://console.cloud.google.com/apis/credentials
   - Chọn project: goldenfarm-ict
   - Click "Create Credentials" → "Service Account"
   - Đặt tên: ict-service
   - Create → Done

2. Tạo JSON Key
   - Vào Details của Service Account vừa tạo
   - Tab "Keys" → "Add Key" → "Create new key"
   - Chọn JSON → Create
   - Lưu file JSON vào máy (sẽ dùng để copy vào password)

3. Lấy Folder ID của Shared Drive
   - Truy cập: https://drive.google.com/drive/shared-drives
   - Chọn Shared Drive của GoldenFarm ICT
   - Click chuột phải vào Shared Drive → "Xem thông tin chi tiết" (Get info)
   - Copy Folder ID (dạng: 1A2B3C4D5E6F7G8H9I0J)

4. Cập nhật configuration
   - Copy nội dung file JSON key vào trường "password"
   - Thay "FOLDER_ID_SHARED_DRIVE" bằng Folder ID từ bước 3

5. Cấu hình trong Frontend (Documents.jsx)
   - Click "Cấu hình Storage" (nếu là Admin)
   - Chọn loại: Google Drive
   - Paste Service Account Email vào Username
   - Paste nội dung JSON key vào Password (hết sức cẩn thận giữ nguyên format)
   - Paste Folder ID vào Folder ID (Thư mục gốc)
   - Test Connection

Lưu ý: Service Account KHÔNG có storage quota cá nhân.
Phải upload vào Shared Drive (đã được cấp quyền truy cập).