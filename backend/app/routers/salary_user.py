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

from ..core.db import fetchall, fetchone, execute, insert
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


def _check_pdf_permission(employee_code: str) -> bool:
    row = fetchone(
        "SELECT can_view FROM user_permissions WHERE employee_code = :emp_code AND module = :module",
        {"emp_code": employee_code, "module": "salary-pdf"}
    )
    return bool(row["can_view"]) if row else False


@router.post("/verify-and-view")
def verify_salary(req: ViewSalaryReq):
    if not req.employee_code or not req.month:
        raise HTTPException(status_code=400, detail="Thiếu employee_code hoặc month")

    if not verify_token(req.employee_code, req.token, req.role):
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ")

    record = fetchone(
        "SELECT password, data_json FROM salaries WHERE employee_code = :emp_code AND month = :month",
        {"emp_code": req.employee_code, "month": req.month}
    )

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
        "data": salary_data,
        "pdf_enabled": _check_pdf_permission(req.employee_code)
    }


@router.get("/available-months")
def get_available_months(
    employee_code: str = None,
    token: str = None,
    role: str = None
):
    if not employee_code:
        raise HTTPException(status_code=400, detail="Missing employee_code")
    if not verify_token(employee_code, token, role):
        raise HTTPException(status_code=401, detail="Invalid token")

    rows = fetchall(
        "SELECT month, created_at FROM salaries WHERE employee_code = :emp_code ORDER BY month DESC",
        {"emp_code": employee_code}
    )
    return {"data": rows, "total": len(rows)}


class ExportPdfReq(BaseModel):
    employee_code: str
    month: str
    password: str = ""
    token: str = ""
    role: str = ""


@router.post("/export-pdf")
def employee_export_pdf(req: ExportPdfReq, background_tasks: BackgroundTasks):
    if not req.employee_code or not req.month:
        raise HTTPException(status_code=400, detail="Thiếu employee_code hoặc month")
    if not verify_token(req.employee_code, req.token, req.role):
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ")
    if not _check_pdf_permission(req.employee_code):
        raise HTTPException(status_code=403, detail="Bạn không có quyền tải PDF. Vui lòng liên hệ Admin.")
    if not TEMPLATE_PATH or not TEMPLATE_PATH.exists():
        raise HTTPException(status_code=500, detail="Template file luong.docx not found")

    record = fetchone(
        "SELECT password, data_json FROM salaries WHERE employee_code = :emp_code AND month = :month",
        {"emp_code": req.employee_code, "month": req.month}
    )

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
