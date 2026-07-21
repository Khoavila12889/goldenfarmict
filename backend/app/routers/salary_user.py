"""
Salary User Router
Cho phép employee xem phiếu lương dạng JSON, tải PDF.
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pathlib import Path
import json
import logging
import os

from ..core.database import get_conn
from ..core.auth import verify_token
from ..utils.pdf_generator import generate_single_pdf_from_json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/salary", tags=["Salary"])

TEMPLATE_PATHS = [
    Path('/app/templates/luong.docx'),
    Path(__file__).parent.parent.parent / 'templates' / 'luong.docx',
    Path(__file__).parent.parent.parent.parent / 'frontend' / 'src' / 'template' / 'luong.docx',
    Path(__file__).parent.parent.parent / 'frontend' / 'src' / 'template' / 'luong.docx',
]
TEMPLATE_PATH = next((p for p in TEMPLATE_PATHS if p.exists()), None)


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


# ─── Employee: Danh sách tháng đã có phiếu lương ─────────────

@router.get("/available-months")
def get_available_months(
    employee_code: str = None,
    token: str = None,
    role: str = None
):
    """Trả về danh sách các tháng đã có phiếu lương của employee."""
    if not employee_code:
        raise HTTPException(status_code=400, detail="Missing employee_code")
    if not verify_token(employee_code, token, role):
        raise HTTPException(status_code=401, detail="Invalid token")

    conn = get_conn()
    rows = conn.execute(
        "SELECT month, created_at FROM salaries WHERE employee_code=? ORDER BY month DESC",
        (employee_code,)
    ).fetchall()
    conn.close()
    return {"data": [dict(r) for r in rows], "total": len(rows)}


# ─── Employee: Tải PDF phiếu lương (có mật khẩu) ─────────────

class ExportPdfReq(BaseModel):
    employee_code: str
    month: str
    password: str = ""
    token: str = ""
    role: str = ""

@router.post("/export-pdf")
def employee_export_pdf(req: ExportPdfReq, background_tasks: BackgroundTasks):
    """Employee tải phiếu lương PDF (có thể có mật khẩu)."""
    if not req.employee_code or not req.month:
        raise HTTPException(status_code=400, detail="Thiếu employee_code hoặc month")
    if not verify_token(req.employee_code, req.token, req.role):
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ")
    if not TEMPLATE_PATH or not TEMPLATE_PATH.exists():
        raise HTTPException(status_code=500, detail="Template file luong.docx not found")

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

    pdf_password = record["password"] if record["password"] else ""

    output_dir = Path("temp_pdf_gen")
    output_dir.mkdir(parents=True, exist_ok=True)
    safe_code = req.employee_code.replace('/', '_').replace('\\', '_')
    output_path = output_dir / f"{safe_code}_{req.month}.pdf"

    try:
        generate_single_pdf_from_json(salary_data, str(TEMPLATE_PATH), str(output_path), pdf_password)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi tạo PDF: {str(e)}")

    if not output_path.exists():
        raise HTTPException(status_code=500, detail="Không thể tạo file PDF")

    background_tasks.add_task(os.unlink, str(output_path))

    return FileResponse(
        str(output_path),
        media_type="application/pdf",
        filename=f"luong_{safe_code}_{req.month}.pdf"
    )
