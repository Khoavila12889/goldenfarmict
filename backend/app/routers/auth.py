from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from ..core.auth import authenticate, hash_password, verify_token
from ..core.database import get_conn

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    employee_code: str
    password: str


class LoginResponse(BaseModel):
    success: bool
    employee_code: str | None = None
    role: str | None = None
    department: str | None = None
    full_name: str | None = None
    token: str | None = None
    message: str


class ChangePasswordRequest(BaseModel):
    employee_code: str
    old_password: str
    new_password: str


class UpdateProfileRequest(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    personal_email: str | None = None


class ForgotPasswordRequest(BaseModel):
    employee_code: str


class VerifyResetRequest(BaseModel):
    employee_code: str
    personal_email: str
    new_password: str


class AdminResetRequest(BaseModel):
    admin_code: str
    admin_token: str
    target_code: str
    new_password: str | None = None


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest):
    # Try employee_code first, then fallback to email (company or personal)
    conn = get_conn()
    user = conn.execute(
        "SELECT employee_code FROM users WHERE employee_code=?",
        (req.employee_code.strip(),)
    ).fetchone()
    if not user:
        user = conn.execute(
            "SELECT employee_code FROM employees WHERE email=? OR personal_email=?",
            (req.employee_code.strip(), req.employee_code.strip())
        ).fetchone()
    conn.close()
    login_id = user['employee_code'] if user else req.employee_code.strip()

    result = authenticate(login_id, req.password)
    if result:
        return LoginResponse(
            success=True,
            employee_code=result["employee_code"],
            role=result["role"],
            department=result.get("department", ""),
            full_name=result.get("full_name", ""),
            token=result["token"],
            message="Đăng nhập thành công!"
        )
    return LoginResponse(success=False, message="Sai mã NV/Email hoặc mật khẩu")


@router.post("/change-password")
def change_password(req: ChangePasswordRequest):
    conn = get_conn()
    row = conn.execute(
        "SELECT password_hash FROM users WHERE employee_code=?",
        (req.employee_code.strip(),)
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "User not found")
    if row['password_hash'] != hash_password(req.old_password):
        conn.close()
        raise HTTPException(400, "Mật khẩu cũ không đúng")
    if len(req.new_password) < 4:
        conn.close()
        raise HTTPException(400, "Mật khẩu mới phải có ít nhất 4 ký tự")
    conn.execute(
        "UPDATE users SET password_hash=? WHERE employee_code=?",
        (hash_password(req.new_password), req.employee_code.strip())
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": "Đổi mật khẩu thành công"}


@router.get("/profile")
def get_profile(employee_code: str = Query('')):
    if not employee_code:
        raise HTTPException(400, "employee_code is required")
    conn = get_conn()
    emp = conn.execute(
        "SELECT employee_code, full_name, department, position, phone, email, personal_email FROM employees WHERE employee_code=?",
        (employee_code.strip(),)
    ).fetchone()
    conn.close()
    if not emp:
        raise HTTPException(404, "Employee not found")
    return {"success": True, "data": dict(emp)}


@router.put("/profile")
def update_profile(employee_code: str, body: UpdateProfileRequest):
    conn = get_conn()
    emp = conn.execute("SELECT id FROM employees WHERE employee_code=?", (employee_code.strip(),)).fetchone()
    if not emp:
        conn.close()
        raise HTTPException(404, "Employee not found")
    updates = {}
    if body.full_name is not None:
        updates['full_name'] = body.full_name
    if body.phone is not None:
        updates['phone'] = body.phone
    if body.personal_email is not None:
        updates['personal_email'] = body.personal_email
    if updates:
        set_clause = ", ".join(f"{k}=?" for k in updates)
        vals = list(updates.values()) + [employee_code.strip()]
        conn.execute(f"UPDATE employees SET {set_clause}, updated_at=datetime('now','localtime') WHERE employee_code=?", vals)
        conn.commit()
    conn.close()
    return {"success": True, "message": "Cập nhật thông tin thành công"}


@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest):
    conn = get_conn()
    emp = conn.execute(
        "SELECT personal_email FROM employees WHERE employee_code=?",
        (req.employee_code.strip(),)
    ).fetchone()
    conn.close()
    if not emp:
        raise HTTPException(404, "Mã nhân viên không tồn tại")
    if not emp['personal_email']:
        raise HTTPException(400, "Tài khoản chưa cập nhật email cá nhân. Vui lòng liên hệ IT.")
    email = emp['personal_email']
    masked = email[0] + '***' + email[email.index('@') - 1:] if '@' in email else email[0] + '***'
    return {"success": True, "email_hint": masked}


@router.post("/verify-reset")
def verify_reset(req: VerifyResetRequest):
    if len(req.new_password) < 4:
        raise HTTPException(400, "Mật khẩu mới phải có ít nhất 4 ký tự")
    conn = get_conn()
    emp = conn.execute(
        "SELECT id FROM employees WHERE employee_code=? AND personal_email=?",
        (req.employee_code.strip(), req.personal_email.strip())
    ).fetchone()
    if not emp:
        conn.close()
        raise HTTPException(400, "Email xác nhận không khớp")
    user = conn.execute(
        "SELECT id FROM users WHERE employee_code=?",
        (req.employee_code.strip(),)
    ).fetchone()
    if not user:
        conn.close()
        raise HTTPException(404, "Tài khoản không tồn tại")
    conn.execute(
        "UPDATE users SET password_hash=? WHERE employee_code=?",
        (hash_password(req.new_password), req.employee_code.strip())
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": "Mật khẩu đã được đặt lại thành công"}


@router.post("/admin-reset-password")
def admin_reset_password(req: AdminResetRequest):
    conn = get_conn()
    admin = conn.execute(
        "SELECT role FROM users WHERE employee_code=?",
        (req.admin_code.strip(),)
    ).fetchone()
    if not admin or admin['role'] not in ('admin', 'head'):
        conn.close()
        raise HTTPException(403, "Chỉ admin mới có quyền reset mật khẩu")
    if not verify_token(req.admin_code.strip(), req.admin_token.strip(), admin['role']):
        conn.close()
        raise HTTPException(401, "Phiên đăng nhập không hợp lệ")
    target = conn.execute(
        "SELECT id FROM users WHERE employee_code=?",
        (req.target_code.strip(),)
    ).fetchone()
    if not target:
        conn.close()
        raise HTTPException(404, "Nhân viên không tồn tại trong hệ thống")
    new_pw = req.new_password.strip() if req.new_password else req.target_code.strip()
    if len(new_pw) < 4:
        conn.close()
        raise HTTPException(400, "Mật khẩu phải có ít nhất 4 ký tự")
    conn.execute(
        "UPDATE users SET password_hash=? WHERE employee_code=?",
        (hash_password(new_pw), req.target_code.strip())
    )
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Đã reset mật khẩu cho {req.target_code.strip()}"}


# ─── Permission Management ─────────────────────────────────────────────

ALL_MODULES = [
    {"key": "employees", "label": "Nhân viên", "group": "admin"},
    {"key": "equipment", "label": "Thiết bị", "group": "admin"},
    {"key": "licenses", "label": "License Keys", "group": "admin"},
    {"key": "tickets", "label": "Tickets", "group": "support"},
    {"key": "approvals", "label": "Phê duyệt", "group": "support"},
    {"key": "workflows", "label": "Quy trình", "group": "admin"},
    {"key": "bookings", "label": "Lịch", "group": "support"},
    {"key": "documents", "label": "Tài liệu", "group": "support"},
    {"key": "salary", "label": "Phiếu lương", "group": "support"},
    {"key": "salary-admin", "label": "Quản lý lương", "group": "admin"},
]

ADMIN_MODULES = {m["key"] for m in ALL_MODULES if m["group"] == "admin"}


@router.get("/users")
def list_users(admin_code: str = None, token: str = None, role: str = None):
    """Admin: list all users with employee info"""
    if role != "admin":
        raise HTTPException(403, "Admin access required")
    if not verify_token(admin_code, token, role):
        raise HTTPException(401, "Invalid token")
    conn = get_conn()
    rows = conn.execute("""
        SELECT u.employee_code, u.role, u.created_at,
               e.full_name, e.department, e.position, e.status
        FROM users u
        LEFT JOIN employees e ON e.employee_code = u.employee_code
        ORDER BY u.role, e.department, e.full_name
    """).fetchall()
    conn.close()
    return {"data": [dict(r) for r in rows]}


@router.get("/users/search")
def search_users(
    q: str = "",
    department: str = "",
    admin_code: str = None,
    token: str = None,
    role: str = None
):
    """Search users for permission assignment"""
    if role not in ("admin", "head"):
        raise HTTPException(403, "Admin/Head access required")
    if not verify_token(admin_code, token, role):
        raise HTTPException(401, "Invalid token")
    conn = get_conn()
    sql = """
        SELECT u.employee_code, u.role,
               e.full_name, e.department, e.position
        FROM users u
        LEFT JOIN employees e ON e.employee_code = u.employee_code
        WHERE 1=1
    """
    params = []
    if q:
        sql += " AND (u.employee_code LIKE ? OR e.full_name LIKE ? OR e.department LIKE ?)"
        params.extend([f"%{q}%", f"%{q}%", f"%{q}%"])
    if department:
        sql += " AND e.department = ?"
        params.append(department)
    sql += " ORDER BY u.role, e.department, e.full_name LIMIT 50"
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return {"data": [dict(r) for r in rows]}


@router.get("/permissions/modules")
def list_modules():
    """List all permission modules with metadata"""
    return {"data": ALL_MODULES}


@router.get("/permissions")
def get_my_permissions(employee_code: str = None):
    """Get permissions for the current user"""
    if not employee_code:
        raise HTTPException(400, "employee_code is required")
    conn = get_conn()
    rows = conn.execute(
        "SELECT module, can_view, can_edit FROM user_permissions WHERE employee_code=?",
        (employee_code.strip(),)
    ).fetchall()
    conn.close()
    perms = {r["module"]: {"can_view": bool(r["can_view"]), "can_edit": bool(r["can_edit"])} for r in rows}
    return {"data": perms}


@router.get("/permissions/{target_code}")
def get_user_permissions(
    target_code: str,
    admin_code: str = None,
    token: str = None,
    role: str = None
):
    """Admin: get permissions for a specific user"""
    if role not in ("admin", "head"):
        raise HTTPException(403, "Admin access required")
    if not verify_token(admin_code, token, role):
        raise HTTPException(401, "Invalid token")
    conn = get_conn()
    user_info = conn.execute(
        "SELECT u.role, e.full_name, e.department, e.position FROM users u LEFT JOIN employees e ON e.employee_code=u.employee_code WHERE u.employee_code=?",
        (target_code.strip(),)
    ).fetchone()
    rows = conn.execute(
        "SELECT module, can_view, can_edit FROM user_permissions WHERE employee_code=?",
        (target_code.strip(),)
    ).fetchall()
    conn.close()
    perms = {r["module"]: {"can_view": bool(r["can_view"]), "can_edit": bool(r["can_edit"])} for r in rows}
    return {"data": perms, "employee_code": target_code, "user": dict(user_info) if user_info else None}


class PermissionUpdate(BaseModel):
    module: str
    can_view: bool = True
    can_edit: bool = False


@router.put("/permissions/{target_code}")
def update_user_permissions(
    target_code: str,
    body: list[PermissionUpdate],
    admin_code: str = None,
    token: str = None,
    role: str = None
):
    """Admin: update permissions for a user"""
    if role not in ("admin", "head"):
        raise HTTPException(403, "Admin access required")
    if not verify_token(admin_code, token, role):
        raise HTTPException(401, "Invalid token")
    conn = get_conn()
    for perm in body:
        conn.execute("""
            INSERT INTO user_permissions (employee_code, module, can_view, can_edit)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(employee_code, module) DO UPDATE SET
                can_view=excluded.can_view,
                can_edit=excluded.can_edit,
                updated_at=datetime('now','localtime')
        """, (target_code.strip(), perm.module, int(perm.can_view), int(perm.can_edit)))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Đã cập nhật phân quyền cho {target_code}"}


class RoleUpdate(BaseModel):
    role: str  # 'user', 'head', 'admin'


@router.put("/role/{target_code}")
def update_user_role(
    target_code: str,
    body: RoleUpdate,
    admin_code: str = None,
    token: str = None,
    role: str = None
):
    """Admin: change user role"""
    if role != "admin":
        raise HTTPException(403, "Admin access required")
    if not verify_token(admin_code, token, role):
        raise HTTPException(401, "Invalid token")
    if body.role not in ("user", "head", "admin"):
        raise HTTPException(400, "Invalid role")
    if target_code == admin_code:
        raise HTTPException(400, "Không thể thay đổi role của chính mình")
    conn = get_conn()
    conn.execute("UPDATE users SET role=? WHERE employee_code=?", (body.role, target_code.strip()))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Đã đổi role của {target_code} thành {body.role}"}
