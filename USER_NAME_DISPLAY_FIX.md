# ✅ Fix: Hiển thị Tên Nhân Viên thay vì Mã NV trong Sidebar

## 🎯 Vấn đề
Sidebar đang hiển thị **mã nhân viên** (VD: `NV001`) thay vì **tên nhân viên** (VD: `Nguyễn Văn A`)

## ✅ Giải pháp đã áp dụng

### Backend Changes

#### 1. File: `backend/app/core/auth.py`
**Thay đổi**: Thêm `full_name` vào response của hàm `authenticate()`

```python
# Trước:
emp = conn.execute(
    "SELECT department FROM employees WHERE employee_code=?",
    (employee_code.strip(),)
).fetchone()
department = emp['department'] if emp else ''

return {
    "employee_code": employee_code.strip(),
    "role": row['role'],
    "department": department,
    "token": make_session_token(employee_code.strip(), row['role'])
}

# Sau:
emp = conn.execute(
    "SELECT department, full_name FROM employees WHERE employee_code=?",
    (employee_code.strip(),)
).fetchone()
department = emp['department'] if emp else ''
full_name = emp['full_name'] if emp else employee_code.strip()

return {
    "employee_code": employee_code.strip(),
    "role": row['role'],
    "department": department,
    "full_name": full_name,  # ← Thêm mới
    "token": make_session_token(employee_code.strip(), row['role'])
}
```

#### 2. File: `backend/app/routers/auth.py`
**Thay đổi**: Thêm `full_name` vào `LoginResponse` schema

```python
# Trước:
class LoginResponse(BaseModel):
    success: bool
    employee_code: str | None = None
    role: str | None = None
    department: str | None = None
    token: str | None = None
    message: str

# Sau:
class LoginResponse(BaseModel):
    success: bool
    employee_code: str | None = None
    role: str | None = None
    department: str | None = None
    full_name: str | None = None  # ← Thêm mới
    token: str | None = None
    message: str
```

**Cập nhật response**:
```python
return LoginResponse(
    success=True,
    employee_code=result["employee_code"],
    role=result["role"],
    department=result.get("department", ""),
    full_name=result.get("full_name", ""),  # ← Thêm mới
    token=result["token"],
    message="Đăng nhập thành công!"
)
```

### Frontend Changes

#### 3. File: `frontend/src/pages/Login.jsx`
**Thay đổi**: Lưu `full_name` vào sessionStorage với fallback

```javascript
// Trước:
sessionStorage.setItem('user_name', res.data.full_name || res.data.name || '')

// Sau:
sessionStorage.setItem('user_name', res.data.full_name || res.data.name || res.data.employee_code)
```

#### 4. File: `frontend/src/components/Layout.jsx`
**Đã có sẵn**: Component đã đúng, chỉ cần backend trả về data

```javascript
const [userName, setUserName] = useState(
  sessionStorage.getItem('user_name') || 
  sessionStorage.getItem('full_name') || 
  userCode || 
  'Nhân viên'
)

// Hiển thị trong sidebar
<div className="user-profile-box">
  <User size={16} className="profile-icon" />
  <span className="user-name">{userName}</span>  {/* ← Đã hiển thị userName */}
</div>
```

---

## 🧪 Testing

### 1. Restart Backend
```bash
cd backend
# Stop uvicorn (Ctrl+C)
# Restart
uvicorn main:app --reload --port 8080
```

### 2. Clear Browser Cache & Logout
```
1. Đăng xuất (nếu đang đăng nhập)
2. Clear sessionStorage (F12 → Application → Session Storage → Clear)
3. Hoặc Ctrl+Shift+Delete → Clear browsing data
```

### 3. Login Again
```
1. Navigate to http://localhost:5173/login
2. Login với: admin/admin hoặc NV001/NV001
3. Kiểm tra sidebar phía dưới (gần nút Đăng xuất)
```

### Expected Result ✅
**Trước**: 
```
┌─────────────────┐
│ NV001 (user)    │
│ [Đăng xuất]     │
└─────────────────┘
```

**Sau**:
```
┌─────────────────┐
│ 👤 Nguyễn Văn A │
│ [Đăng xuất]     │
└─────────────────┘
```

---

## 🔍 Troubleshooting

### Vấn đề 1: Vẫn hiển thị mã NV
**Nguyên nhân**: Chưa logout/login lại hoặc backend chưa restart

**Giải pháp**:
1. Đăng xuất
2. Clear sessionStorage (F12 → Application → Session Storage → Clear All)
3. Restart backend
4. Login lại

### Vấn đề 2: Hiển thị "Nhân viên" thay vì tên
**Nguyên nhân**: Database không có `full_name` cho user này

**Giải pháp**:
```sql
-- Kiểm tra dữ liệu
SELECT employee_code, full_name FROM employees WHERE employee_code='NV001';

-- Nếu NULL, update:
UPDATE employees SET full_name='Nguyễn Văn A' WHERE employee_code='NV001';
```

### Vấn đề 3: Error 500 khi login
**Nguyên nhân**: Syntax error trong backend code

**Giải pháp**:
```bash
# Check backend logs
# Verify Python syntax
python -c "import backend.app.core.auth"
```

---

## 📊 Test Cases

| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| Login với user có full_name | NV001/NV001 | Hiển thị: "Nguyễn Văn A" |
| Login với admin | admin/admin | Hiển thị: "Administrator" hoặc "admin" |
| Login với user không có full_name | NEW001/NEW001 | Hiển thị: "NEW001" (fallback) |
| Logout → Login lại | - | Vẫn hiển thị tên đúng |

---

## 📝 Database Schema Check

Ensure `employees` table has `full_name` column:
```sql
-- Check schema
PRAGMA table_info(employees);

-- Sample data
INSERT INTO employees (employee_code, full_name, department, position)
VALUES ('NV001', 'Nguyễn Văn A', 'IT', 'Developer');
```

---

## ✅ Validation Checklist

- [x] Backend: `auth.py` trả về `full_name`
- [x] Backend: `auth.py` router có field `full_name`
- [x] Frontend: Login.jsx lưu `user_name` vào sessionStorage
- [x] Frontend: Layout.jsx hiển thị `userName`
- [x] Frontend: Có fallback nếu full_name null
- [ ] Backend đã restart
- [ ] Clear sessionStorage + Login lại
- [ ] Test với ít nhất 2 users khác nhau

---

## 🚀 Deploy Notes

### Dev Environment
```bash
# Backend
cd backend
uvicorn main:app --reload --port 8080

# Frontend
cd frontend
npm run dev
```

### Production
- Không cần thay đổi build config
- Ensure database có đầy đủ `full_name` cho tất cả users
- Test sau deploy: Login → Verify sidebar hiển thị tên

---

**Status**: ✅ Complete

**Files Changed**: 3 files
- `backend/app/core/auth.py` (1 function)
- `backend/app/routers/auth.py` (1 model + 1 response)
- `frontend/src/pages/Login.jsx` (1 line)

**Impact**: Low risk - chỉ thêm field mới, không ảnh hưởng logic cũ

**Tested**: ⏳ Pending manual test after restart
