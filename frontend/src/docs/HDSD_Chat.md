# 💬 HƯỚNG DẪN SỬ DỤNG CHAT NỘI BỘ (INTERNAL CHAT)

*(Dành cho người dùng cuối – End-user)*

---

## I. TỔNG QUAN

**Chat Nội bộ** là kênh trao đổi thông tin trực tuyến (realtime) dành cho toàn bộ nhân viên trong công ty. Bạn có thể nhắn tin nhanh với đồng nghiệp theo **phòng chat 1-1 (Direct)**, **nhóm (Group)** hoặc **phòng ban (Department)** ngay trong hệ thống — không cần ứng dụng bên ngoài.

**Các điểm nổi bật:**
- **Gửi tin tức thời (Realtime):** Tin nhắn được gửi và nhận ngay lập tức qua kết nối WebSocket, không cần nhấn F5.
- **Tự động đăng nhập:** Chỉ cần đăng nhập hệ thống như bình thường — phiên chat được xác thực tự động, không phải nhập lại mật khẩu.
- **Lưu trữ lịch sử:** Toàn bộ tin nhắn được lưu vào hệ thống, bạn có thể xem lại lịch sử trao đổi bất cứ lúc nào.
- **Độc lập hệ thống:** Kênh chat hoạt động tách biệt với các luồng cập nhật khác nên không ảnh hưởng đến các phân hệ còn lại.

---

## II. CÁC THÀNH PHẦN

### 1. Phòng chat 1-1 (Direct)
- Nhắn tin riêng tư giữa **hai người**.
- Chọn đồng nghiệp cần trao đổi → hệ thống tự tạo phòng chat 1-1.

### 2. Phòng chat nhóm (Group)
- Nhắn tin chung với **nhiều thành viên** cùng lúc.
- Phòng nhóm có **tên nhóm** rõ ràng để dễ nhận biết.
- Mọi thành viên trong phòng đều nhận được tin nhắn gửi vào nhóm.
- **Chủ nhóm** (người tạo nhóm) có thể đổi tên, thêm/bớt thành viên và xoá nhóm.

### 3. Phòng chat phòng ban (Department)
- Kênh trao đổi chung dành cho **toàn bộ nhân viên của một phòng ban**.
- Phòng ban tự hiển thị khi bạn mở Chat — nhân viên vào phòng ban mới sẽ **tự động tham gia**, không cần mời.
- Chỉ **admin** hoặc **trưởng phòng** mới quản lý (đổi tên / xoá) phòng phòng ban.

### 4. Danh sách phòng (Room List)
- Hiển thị tất cả phòng chat bạn đang tham gia, chia mục: **Phòng ban / Nhóm / Nhắn riêng**.
- Mỗi phòng hiển thị **thành viên** và **tin nhắn mới nhất** để xem nhanh.

---

## III. HƯỚNG DẪN THAO TÁC

### Bước 1: Mở Chat
- Đăng nhập hệ thống → chọn menu **Chat** (💬) trên thanh điều hướng.

### Bước 2: Bắt đầu nhắn tin
1. Mở một phòng chat từ danh sách (hoặc tạo phòng mới).
2. Nhập nội dung vào ô soạn tin nhắn.
3. Nhấn nút **Gửi** (hoặc phím **Enter**) — tin nhắn được gửi ngay lập tức tới mọi thành viên trong phòng.

### Bước 3: Tạo phòng chat mới
1. Nhấn nút **Tạo phòng**.
2. Chọn loại phòng:
   - **1-1 (Direct):** chọn 1 đồng nghiệp để nhắn riêng.
   - **Nhóm (Group):** chọn nhiều người và đặt **tên nhóm** — bạn trở thành **chủ nhóm**.
   - **Phòng ban (Department):** chỉ hiển thị với **admin / trưởng phòng** — chọn phòng ban, mọi nhân viên trong phòng ban tự tham gia.
3. Xác nhận để tạo — bạn tự động được thêm vào phòng.

### Bước 4: Ghim tin nhắn quan trọng
- Trỏ chuột vào một tin nhắn → nhấn nút **📌 Ghim** để đưa tin đó lên **thanh ghim** phía trên box chat, giúp mọi người trong phòng chú ý.
- Hiển thị tối đa **3 tin ghim** trên thanh; nếu có nhiều hơn, nhấn **"+n nữa"** để xem đầy đủ trong cửa sổ danh sách tin ghim.
- Mọi thành viên đều **ghim được**; chỉ **người ghim** hoặc **người quản lý phòng** mới bỏ ghim được (bấm lại nút ghim / nút **Bỏ ghim** trong danh sách).

### Bước 5: Quản lý phòng (admin / trưởng phòng / chủ nhóm)
- Mở một phòng → nhấn nút **Cài đặt (bánh răng)** trên tiêu đề phòng (chỉ hiện khi bạn có quyền).
- **Thành viên:** xem danh sách, thêm / xoá thành viên (phòng nhóm).
- **Cài đặt:** đổi tên phòng, xoá phòng (toàn bộ tin nhắn bị xoá vĩnh viễn — xác nhận trước khi xoá).

### Bước 6: Xem lịch sử tin nhắn
- Mở phòng chat → lịch sử tin nhắn hiển thị theo thời gian.
- Dùng phân trang **tải thêm tin nhắn cũ** khi cần xem lại nội dung trước đó.

### Bước 7: Gửi kèm tệp đính kèm
- Bạn có thể gửi **đường dẫn tệp/tài liệu** kèm theo tin nhắn (ô nhập đường dẫn đính kèm nếu có).

---

## IV. QUYỀN HẠN & BẢO MẬT

| Vai trò | Quyền trong Chat |
|--------|------------------|
| **Nhân viên (user)** | Tạo phòng 1-1 / nhóm; nhắn tin trong mọi phòng mình tham gia (kể cả phòng phòng ban); không quản lý phòng. |
| **Trưởng phòng (head)** | Như nhân viên + quản lý (đổi tên / xoá) phòng **phòng ban của mình**; tạo phòng phòng ban cho phòng ban mình. |
| **Admin** | Quản lý **mọi** phòng: đổi tên, thêm/bớt thành viên nhóm, xoá phòng bất kỳ; tạo phòng phòng ban cho mọi phòng ban. |
| **Chủ nhóm (group owner)** | Quản lý nhóm do mình tạo: đổi tên, thêm/bớt thành viên, xoá nhóm. |

| Vấn đề | Quy định |
|--------|----------|
| **Quyền xem phòng** | Bạn chỉ thấy và truy cập được những phòng chat **mình là thành viên** (hoặc phòng phòng ban của mình). |
| **Quyền quản lý phòng** | Nút **Cài đặt** chỉ xuất hiện với người có quyền quản lý (admin / trưởng phòng đúng phòng ban / chủ nhóm). |
| **Phòng phòng ban** | Thành viên tự động theo **phòng ban hiện tại** của nhân viên — nhân viên đổi phòng ban sẽ tách khỏi phòng phòng ban cũ và vào phòng phòng ban mới. |
| **Lịch sử tin nhắn** | Chỉ thành viên của phòng mới xem được lịch sử tin nhắn trong phòng đó. |
| **Xoá phòng** | Chỉ người có quyền quản lý; **toàn bộ tin nhắn trong phòng bị xoá vĩnh viễn** (có hộp thoại xác nhận). |
| **Bảo mật phiên** | Phiên chat được xác thực bằng token đăng nhập của bạn; nếu phiên không hợp lệ, kết nối chat bị đóng ngay lập tức. |
| **Xoá nhân viên** | Khi một nhân viên nghỉ việc và bị xoá khỏi hệ thống, tin nhắn của họ **vẫn được giữ lại** trong lịch sử (tên người gửi được ẩn danh) — không làm mất nội dung trao đổi của phòng. |
