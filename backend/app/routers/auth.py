from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from ..core.auth import authenticate, hash_password, verify_token
from ..core.db import fetchall, fetchone, execute

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
    code = req.employee_code.strip()
    user = fetchone("SELECT employee_code FROM users WHERE employee_code = :code", {"code": code})
    if not user:
        emp = fetchone(
            "SELECT employee_code FROM employees WHERE email = :email OR personal_email = :email",
            {"email": code}
        )
        if emp:
            code = emp["employee_code"]
    result = authenticate(code, req.password)
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
    code = req.employee_code.strip()
    row = fetchone("SELECT password_hash FROM users WHERE employee_code = :code", {"code": code})
    if not row:
        raise HTTPException(404, "User not found")
    if row["password_hash"] != hash_password(req.old_password):
        raise HTTPException(400, "Mật khẩu cũ không đúng")
    if len(req.new_password) < 4:
        raise HTTPException(400, "Mật khẩu mới phải có ít nhất 4 ký tự")
    execute(
        "UPDATE users SET password_hash = :pw WHERE employee_code = :code",
        {"pw": hash_password(req.new_password), "code": code}
    )
    return {"success": True, "message": "Đổi mật khẩu thành công"}


@router.get("/profile")
def get_profile(employee_code: str = Query("")):
    if not employee_code:
        raise HTTPException(400, "employee_code is required")
    emp = fetchone(
        "SELECT employee_code, full_name, department, position, phone, email, personal_email FROM employees WHERE employee_code = :code",
        {"code": employee_code.strip()}
    )
    if not emp:
        raise HTTPException(404, "Employee not found")
    return {"success": True, "data": emp}


@router.put("/profile")
def update_profile(employee_code: str, body: UpdateProfileRequest):
    code = employee_code.strip()
    emp = fetchone("SELECT id FROM employees WHERE employee_code = :code", {"code": code})
    if not emp:
        raise HTTPException(404, "Employee not found")
    updates = {}
    if body.full_name is not None:
        updates["full_name"] = body.full_name
    if body.phone is not None:
        updates["phone"] = body.phone
    if body.personal_email is not None:
        updates["personal_email"] = body.personal_email
    if updates:
        set_clause = ", ".join(f"{k} = :{k}" for k in updates)
        updates["code"] = code
        execute(
            f"UPDATE employees SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE employee_code = :code",
            updates
        )
    return {"success": True, "message": "Cập nhật thông tin thành công"}


@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest):
    emp = fetchone(
        "SELECT personal_email FROM employees WHERE employee_code = :code",
        {"code": req.employee_code.strip()}
    )
    if not emp:
        raise HTTPException(404, "Mã nhân viên không tồn tại")
    if not emp["personal_email"]:
        raise HTTPException(400, "Tài khoản chưa cập nhật email cá nhân. Vui lòng liên hệ IT.")
    email = emp["personal_email"]
    masked = email[0] + "***" + email[email.index("@") - 1:] if "@" in email else email[0] + "***"
    return {"success": True, "email_hint": masked}


@router.post("/verify-reset")
def verify_reset(req: VerifyResetRequest):
    if len(req.new_password) < 4:
        raise HTTPException(400, "Mật khẩu mới phải có ít nhất 4 ký tự")
    emp = fetchone(
        "SELECT id FROM employees WHERE employee_code = :code AND personal_email = :email",
        {"code": req.employee_code.strip(), "email": req.personal_email.strip()}
    )
    if not emp:
        raise HTTPException(400, "Email xác nhận không khớp")
    user = fetchone(
        "SELECT id FROM users WHERE employee_code = :code",
        {"code": req.employee_code.strip()}
    )
    if not user:
        raise HTTPException(404, "Tài khoản không tồn tại")
    execute(
        "UPDATE users SET password_hash = :pw WHERE employee_code = :code",
        {"pw": hash_password(req.new_password), "code": req.employee_code.strip()}
    )
    return {"success": True, "message": "Mật khẩu đã được đặt lại thành công"}


@router.post("/admin-reset-password")
def admin_reset_password(req: AdminResetRequest):
    admin = fetchone(
        "SELECT role FROM users WHERE employee_code = :code",
        {"code": req.admin_code.strip()}
    )
    if not admin or admin["role"] not in ("admin", "head"):
        raise HTTPException(403, "Chỉ admin mới có quyền reset mật khẩu")
    if not verify_token(req.admin_code.strip(), req.admin_token.strip(), admin["role"]):
        raise HTTPException(401, "Phiên đăng nhập không hợp lệ")
    target = fetchone(
        "SELECT id FROM users WHERE employee_code = :code",
        {"code": req.target_code.strip()}
    )
    if not target:
        raise HTTPException(404, "Nhân viên không tồn tại trong hệ thống")
    new_pw = req.new_password.strip() if req.new_password else req.target_code.strip()
    if len(new_pw) < 4:
        raise HTTPException(400, "Mật khẩu phải có ít nhất 4 ký tự")
    execute(
        "UPDATE users SET password_hash = :pw WHERE employee_code = :code",
        {"pw": hash_password(new_pw), "code": req.target_code.strip()}
    )
    return {"success": True, "message": f"Đã reset mật khẩu cho {req.target_code.strip()}"}


# ─── Permission Management ─────────────────────────────────────────────

ALL_MODULES = [
    {"key": "employees", "label": "Nhân viên", "group": "admin"},
    {"key": "equipment", "label": "Thiết bị", "group": "admin"},
    {"key": "licenses", "label": "License Keys", "group": "admin"},
    {"key": "todos", "label": "Công việc (Todos)", "group": "support"},
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
    if role != "admin":
        raise HTTPException(403, "Admin access required")
    if not verify_token(admin_code, token, role):
        raise HTTPException(401, "Invalid token")
    rows = fetchall("""
        SELECT u.employee_code, u.role, u.created_at,
               e.full_name, e.department, e.position, e.status
        FROM users u
        LEFT JOIN employees e ON e.employee_code = u.employee_code
        ORDER BY u.role, e.department, e.full_name
    """)
    return {"data": rows}


@router.get("/users/search")
def search_users(
    q: str = "",
    department: str = "",
    admin_code: str = None,
    token: str = None,
    role: str = None
):
    if role not in ("admin", "head"):
        raise HTTPException(403, "Admin/Head access required")
    if not verify_token(admin_code, token, role):
        raise HTTPException(401, "Invalid token")
    params = {}
    sql = """
        SELECT u.employee_code, u.role,
               e.full_name, e.department, e.position
        FROM users u
        LEFT JOIN employees e ON e.employee_code = u.employee_code
        WHERE 1=1
    """
    if q:
        sql += " AND (u.employee_code ILIKE :q OR e.full_name ILIKE :q OR e.department ILIKE :q)"
        params["q"] = f"%{q}%"
    if department:
        sql += " AND e.department = :dept"
        params["dept"] = department
    sql += " ORDER BY u.role, e.department, e.full_name LIMIT 50"
    rows = fetchall(sql, params)
    return {"data": rows}


@router.get("/permissions/modules")
def list_modules():
    return {"data": ALL_MODULES}


@router.get("/permissions")
def get_my_permissions(employee_code: str = None):
    if not employee_code:
        raise HTTPException(400, "employee_code is required")
    rows = fetchall(
        "SELECT module, can_view, can_edit FROM user_permissions WHERE employee_code = :code",
        {"code": employee_code.strip()}
    )
    perms = {r["module"]: {"can_view": bool(r["can_view"]), "can_edit": bool(r["can_edit"])} for r in rows}
    return {"data": perms}


@router.get("/permissions/{target_code}")
def get_user_permissions(
    target_code: str,
    admin_code: str = None,
    token: str = None,
    role: str = None
):
    if role not in ("admin", "head"):
        raise HTTPException(403, "Admin access required")
    if not verify_token(admin_code, token, role):
        raise HTTPException(401, "Invalid token")
    user_info = fetchone("""
        SELECT u.role, e.full_name, e.department, e.position
        FROM users u
        LEFT JOIN employees e ON e.employee_code = u.employee_code
        WHERE u.employee_code = :code
    """, {"code": target_code.strip()})
    rows = fetchall(
        "SELECT module, can_view, can_edit FROM user_permissions WHERE employee_code = :code",
        {"code": target_code.strip()}
    )
    perms = {r["module"]: {"can_view": bool(r["can_view"]), "can_edit": bool(r["can_edit"])} for r in rows}
    return {"data": perms, "employee_code": target_code, "user": user_info}


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
    if role not in ("admin", "head"):
        raise HTTPException(403, "Admin access required")
    if not verify_token(admin_code, token, role):
        raise HTTPException(401, "Invalid token")
    for perm in body:
        execute("""
            INSERT INTO user_permissions (employee_code, module, can_view, can_edit)
            VALUES (:code, :module, :view, :edit)
            ON CONFLICT (employee_code, module) DO UPDATE SET
                can_view = EXCLUDED.can_view,
                can_edit = EXCLUDED.can_edit,
                updated_at = CURRENT_TIMESTAMP
        """, {
            "code": target_code.strip(),
            "module": perm.module,
            "view": int(perm.can_view),
            "edit": int(perm.can_edit)
        })
    return {"success": True, "message": f"Đã cập nhật phân quyền cho {target_code}"}


class RoleUpdate(BaseModel):
    role: str


@router.put("/role/{target_code}")
def update_user_role(
    target_code: str,
    body: RoleUpdate,
    admin_code: str = None,
    token: str = None,
    role: str = None
):
    if role != "admin":
        raise HTTPException(403, "Admin access required")
    if not verify_token(admin_code, token, role):
        raise HTTPException(401, "Invalid token")
    if body.role not in ("user", "head", "admin"):
        raise HTTPException(400, "Invalid role")
    if target_code == admin_code:
        raise HTTPException(400, "Không thể thay đổi role của chính mình")
    execute(
        "UPDATE users SET role = :role WHERE employee_code = :code",
        {"role": body.role, "code": target_code.strip()}
    )
    return {"success": True, "message": f"Đã đổi role của {target_code} thành {body.role}"}
