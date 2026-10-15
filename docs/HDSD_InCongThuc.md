# In công thức tại máy nhà máy

## Luồng sử dụng

Nhà máy chỉ thấy thông tin nhận diện công thức và nút **In**. Khi user bấm nút, trình duyệt chỉ gửi mã công thức lên server. Print agent trên PC nhà máy lấy các trang PNG 300 DPI từ endpoint riêng và gửi tới máy in mặc định. PDF gốc và ảnh không được gửi tới trình duyệt.

## Cấu hình

Xem hướng dẫn cài print agent cho Windows trong [tools/formula-print-agent/README.md](../tools/formula-print-agent/README.md). Cấu hình agent key trên backend và PC agent phải trùng nhau. Station ID của agent và trình duyệt phải trùng; mặc định là `factory-main`.

## Giới hạn bảo vệ

PDF gốc và ảnh trang không được gửi tới trình duyệt nhà máy. Agent xử lý ảnh trong bộ nhớ; Windows Print Spooler vẫn có thể giữ dữ liệu lệnh in tạm thời trong khi xử lý. Trạng thái hoàn tất nghĩa là Windows đã nhận lệnh vào hàng đợi, không xác nhận giấy đã ra khỏi máy in.
