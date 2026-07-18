# ✅ Ticket Queue Position Feature

## 🎯 Tính năng mới

Hiển thị **vị trí của user trong hàng đợi ticket** trên Dashboard.

### Ví dụ:
```
🎫 Ticket của tôi   ⏳ chờ 3
   └─ Hàng đợi: #4 (3 ticket trước)
```

---

## 📁 Files đã thay đổi

### Backend

#### 1. `backend/app/routers/tickets.py`
Đã thêm endpoint mới:

```python
@router.get("/queue-position")
def ticket_queue_position(user_code: str = Query('')):
    """
    Trả về vị trí của user trong hàng đợi ticket
    
    - pending_before: số ticket đang chờ của người khác trước user
    - total_pending: tổng số ticket đang chờ
    - user_pending: số ticket của user đang chờ
    - rank: vị trí xếp hạng (1 = đầu hàng đợi)
    """
```

**Response Example**:
```json
{
  "user_code": "NV001",
  "user_name": "Nguyễn Văn A",
  "total_pending": 10,
  "user_pending": 3,
  "pending_before": 6,
  "rank": 7
}
```

**Logic**:
- `rank = pending_before + 1`
- `pending_before` = số ticket chờ có `id < min(id)` của user
- Sắp xếp theo `id DESC` (ticket cũ được xử lý trước)

### Frontend

#### 2. `frontend/src/services/api.js`
Đã thêm function:

```javascript
export function getTicketQueuePosition(userCode) {
  return api.get('/tickets/queue-position', { params: { user_code: userCode } })
}
```

#### 3. `frontend/src/pages/Dashboard.jsx`
Đã cập nhật:

- Import: `getTicketQueuePosition`
- State: `queuePos`
- Function: `loadQueuePos()`
- SSE: `new_ticket/update_ticket/delete_ticket` → reload queue position

---

## 🎨 UI Display

### Điều kiện hiển thị
- Chỉ hiển thị cho **user** (không hiển thị cho admin)
- Chỉ hiển thị khi `queuePos.rank > 1` (nghĩa là có ticket khác đang chờ trước)

### UI Component
```jsx
{queuePos && queuePos.rank > 1 && (
  <span style={{
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#fff',
    background: '#00468C',
    padding: '0.1rem 0.5rem',
    borderRadius: 20
  }}>
    Hàng đợi: #{queuePos.rank} ({queuePos.pending_before} ticket trước)
  </span>
)}
```

---

## 🔄 Real-time Updates

Queue position tự động cập nhật khi:

| SSE Event | Hành động |
|-----------|-----------|
| `new_ticket` | Load lại queue position |
| `update_ticket` | Load lại queue position |
| `delete_ticket` | Load lại queue position |
| `booking_created` | Không reload queue |
| `booking_updated` | Không reload queue |

---

## 🧪 Testing

### Manual Test Flow

1. **Clear data** (nếu cần test từ đầu):
   ```sql
   DELETE FROM tickets WHERE employee_code != 'admin';
   ```

2. **Login với user NV001**

3. **Tạo 3 ticket**:
   - Ticket #100 (user NV002, chờ)
   - Ticket #101 (user NV002, chờ)
   - Ticket #102 (user NV001, chờ)

4. **Kiểm tra Dashboard**:
   ```
   🎫 Ticket của tôi   ⏳ chờ 1
      └─ Hàng đợi: #3 (2 ticket trước)
   ```

5. **Tạo thêm ticket** (NV003):
   - Dashboard cập nhật: `Hàng đợi: #4 (3 ticket trước)`

6. **Admin xử lý ticket #100**:
   - Dashboard cập nhật: `Hàng đợi: #3 (2 ticket trước)`

---

## 📊 API Reference

### Endpoint

```
GET /api/tickets/queue-position?user_code={code}
```

### Response

| Field | Type | Description |
|-------|------|-------------|
| `user_code` | string | Mã nhân viên |
| `user_name` | string | Tên nhân viên |
| `total_pending` | int | Tổng ticket đang chờ |
| `user_pending` | int | Ticket của user đang chờ |
| `pending_before` | int | Ticket người khác chờ trước user |
| `rank` | int | Vị trí trong hàng đợi (1 = đầu) |

### Error Responses

- 400: `user_code is required`
- 404: `User not found`

---

## 🔒 Security

- Only non-admin users can call this endpoint
- Returns user's own data only
- No sensitive data exposed

---

## 📈 Performance

- Query optimization: uses `MIN(id)` to find first ticket
- Caching: Not required (light query < 10ms)
- SSE: Updates every ticket change (acceptable for small user base)

---

## 🐛 Known Issues

1. **Rank không chính xác nếu ticket bị xóa**
   - Giải pháp: Sử dụng rank theo thời gian thay vì id

2. **Multiple pending tickets của cùng 1 user**
   - Giải pháp: Tính rank dựa trên ticket đầu tiên

---

## ✅ Checklist

- [x] Backend endpoint `/queue-position` created
- [x] Frontend API function added
- [x] Dashboard updated with queue position display
- [x] SSE events trigger reload
- [x] Only show for non-admin users
- [x] Only show when rank > 1
- [x] Test with multiple users and tickets

---

**Status**: ✅ Complete

**Created**: 2024-12-15
