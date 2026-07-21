"""
Salary User Router
Cho phép employee xem phiếu lương dạng JSON (không cần PDF).
Giải quyết triệt để vấn đề Brave/iOS không đọc được PDF.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import json
import logging

from ..core.database import get_conn
from ..core.auth import verify_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/salary", tags=["Salary"])


class ViewSalaryReq(BaseModel):
    employee_code: str
    month: str
    password: str = ""
    token: str = ""
    role: str = ""


@router.post("/verify-and-view")
def verify_salary(req: ViewSalaryReq):
    """
    Employee: Xem phiếu lương dạng JSON (không cần PDF).

    1. Xác thực token
    2. Query bảng salaries lấy data_json
    3. Kiểm tra password (nếu có, so với PASSWORD từ file Excel)
    4. Trả về context JSON → Frontend render HTML đẹp

    Lợi ích:
    - Không cần PDF viewer → hoạt động trên mọi trình duyệt mobile
    - Tận dụng create_salary_context từ tool .py cũ
    - Dữ liệu format sẵn (VD: 15,000,000)
    """
    if not req.employee_code or not req.month:
        raise HTTPException(status_code=400, detail="Thiếu employee_code hoặc month")

    if not verify_token(req.employee_code, req.token, req.role):
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ")

    conn = get_conn()
    record = conn.execute(
        "SELECT password, data_json FROM salaries WHERE employee_code=? AND month=?",
        (req.employee_code, req.month)
    ).fetchone()
    conn.close()

    if not record:
        raise HTTPException(status_code=404, detail="Chưa có phiếu lương cho tháng này")

    if record["password"] and req.password != record["password"]:
        raise HTTPException(status_code=401, detail="Mật khẩu phiếu lương không đúng")

    try:
        salary_data = json.loads(record["data_json"])
    except Exception:
        raise HTTPException(status_code=500, detail="Dữ liệu lương bị lỗi")

    return {
        "status": "success",
        "employee_code": req.employee_code,
        "month": req.month,
        "data": salary_data
    }
