"""
Salary Slips Router (Admin)
Admin: upload Excel → store JSON + salary_slips table
Employee: xem qua salary_user.py (/api/salary/verify-and-view)
Đã xoá toàn bộ PDF generator, FTP upload, generator job cũ.
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import StreamingResponse
from pathlib import Path
import os
import io
import hashlib
import json
import logging
import zipfile
import shutil
from datetime import datetime
from ..core.database import get_conn
from ..core.auth import verify_token
import pandas as pd

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/salary-slips", tags=["Salary Slips"])


def require_admin(employee_code: str, token: str, role: str):
    if role not in ("admin", "head"):
        raise HTTPException(status_code=403, detail="Admin/Head access required")
    if not verify_token(employee_code, token, role):
        raise HTTPException(status_code=401, detail="Invalid token")
    return employee_code


# ─── View Own Salary Slip PDF (legacy fallback) ─────────────────────────

@router.get("/my")
async def get_my_salary_slip(
    month: str,
    employee_code: str = None,
    token: str = None,
    role: str = None
):
    if not employee_code:
        raise HTTPException(status_code=401, detail="Missing employee_code")
    if not verify_token(employee_code, token, role):
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        year, mon = month.split('-')
        int(year); int(mon)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid month format (YYYY-MM)")

    conn = get_conn()
    slip = conn.execute(
        "SELECT * FROM salary_slips WHERE employee_code=? AND month=?",
        (employee_code, month)
    ).fetchone()
    conn.close()

    if not slip:
        raise HTTPException(status_code=404, detail="Chưa có phiếu lương cho tháng này")

    return { "success": True, "message": "Dùng /api/salary/verify-and-view để xem JSON", "month": month }


# ─── Admin: List Salary Slips ──────────────────────────────────────────

@router.get("/admin/list")
async def list_salary_slips(
    month: str = "",
    employee_code: str = "",
    department: str = "",
    admin_code: str = None,
    token: str = None,
    role: str = None
):
    require_admin(admin_code, token, role)
    conn = get_conn()
    sql = """
        SELECT s.*, e.full_name, e.department, e.position
        FROM salary_slips s
        LEFT JOIN employees e ON e.employee_code = s.employee_code
        WHERE 1=1
    """
    params = []
    if month:
        sql += " AND s.month = ?"; params.append(month)
    if employee_code:
        sql += " AND s.employee_code LIKE ?"; params.append(f"%{employee_code}%")
    if department:
        sql += " AND e.department = ?"; params.append(department)
    sql += " ORDER BY s.month DESC, e.full_name ASC"
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return {"data": [dict(r) for r in rows], "total": len(rows)}


# ─── Admin: Get Employees ─────────────────────────────────────────────

@router.get("/admin/employees")
async def get_employees_for_salary(
    department: str = "",
    search: str = "",
    admin_code: str = None,
    token: str = None,
    role: str = None
):
    """Tìm kiếm nhân viên (có/ chưa có lương) để admin chọn làm việc."""
    require_admin(admin_code, token, role)
    conn = get_conn()
    # Lấy nhân viên từ employees table...
    rows = conn.execute("""
        SELECT id, employee_code, full_name, department, position, phone, email
        FROM employees WHERE status='active' AND (employee_code IS NULL OR employee_code != '')
    """).fetchall()
    # ...kết hợp với nhân viên chỉ có trong salaries (import Excel trước đây không tạo employees record)
    salary_rows = conn.execute("""
        SELECT DISTINCT s.employee_code,
               COALESCE(json_extract(s.data_json, '$.NAME'), '') AS full_name,
               COALESCE(json_extract(s.data_json, '$.PB'), '') AS department,
               COALESCE(json_extract(s.data_json, '$.CHUCVU'), '') AS position,
               '' AS phone,
               '' AS email
        FROM salaries s
        WHERE s.employee_code NOT IN (
            SELECT employee_code FROM employees WHERE status='active' AND (employee_code IS NULL OR employee_code != '')
        )
    """).fetchall()
    combined = {}
    for r in rows:
        key = r['employee_code'] or f"__id_{r['id']}"
        combined[key] = dict(r)
        combined[key]['employee_code'] = r['employee_code'] or key
    for r in salary_rows:
        if r['employee_code'] not in combined:
            combined[r['employee_code']] = dict(r)
    result = list(combined.values())
    if department and department != "Tất cả":
        result = [e for e in result if e['department'] == department]
    if search:
        kw = search.lower()
        result = [e for e in result if kw in (e['full_name'] or '').lower() or kw in (e['employee_code'] or '').lower()]
    result.sort(key=lambda e: (e['department'] or '', e['full_name'] or ''))
    conn.close()
    return {"data": result, "total": len(result)}


# ─── Admin: Create/Update Salary Slip ─────────────────────────────────

@router.post("/admin/create")
async def create_salary_slip(body: dict, admin_code: str = None, token: str = None, role: str = None):
    require_admin(admin_code, token, role)
    required = ["employee_code", "month", "basic_salary", "net_salary"]
    for field in required:
        if field not in body:
            raise HTTPException(status_code=400, detail=f"Missing required field: {field}")

    conn = get_conn()
    emp = conn.execute("SELECT id FROM employees WHERE employee_code=? AND status='active'", (body["employee_code"],)).fetchone()
    if not emp:
        conn.close()
        raise HTTPException(status_code=404, detail="Employee not found or inactive")

    existing = conn.execute(
        "SELECT id FROM salary_slips WHERE employee_code=? AND month=?",
        (body["employee_code"], body["month"])
    ).fetchone()

    if existing:
        conn.execute("""
            UPDATE salary_slips SET basic_salary=?, allowances=?, bonus=?, deductions=?, net_salary=?,
                notes=?, updated_at=datetime('now','localtime'), updated_by=?
            WHERE employee_code=? AND month=?
        """, (
            body.get("basic_salary", 0), body.get("allowances", 0), body.get("bonus", 0),
            body.get("deductions", 0), body.get("net_salary", 0), body.get("notes", ""),
            admin_code, body["employee_code"], body["month"]
        ))
        conn.commit(); conn.close()
        return {"success": True, "action": "updated", "id": existing["id"]}
    else:
        conn.execute("""
            INSERT INTO salary_slips (employee_code, month, basic_salary, allowances, bonus, deductions,
                net_salary, notes, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            body["employee_code"], body["month"], body.get("basic_salary", 0),
            body.get("allowances", 0), body.get("bonus", 0), body.get("deductions", 0),
            body.get("net_salary", 0), body.get("notes", ""), admin_code
        ))
        slip_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.commit(); conn.close()
        return {"success": True, "action": "created", "id": slip_id}


# ─── Admin: Delete Salary Slip ────────────────────────────────────────

@router.delete("/admin/{employee_code}")
async def delete_salary_slip(
    employee_code: str,
    month: str = "",
    admin_code: str = None,
    token: str = None,
    role: str = None
):
    """Xóa phiếu lương theo employee_code + month (xóa cả 2 bảng salary_slips và salaries)."""
    require_admin(admin_code, token, role)
    if not month:
        raise HTTPException(status_code=400, detail="Missing month parameter")
    conn = get_conn()
    conn.execute("DELETE FROM salary_slips WHERE employee_code=? AND month=?", (employee_code, month))
    conn.execute("DELETE FROM salaries WHERE employee_code=? AND month=?", (employee_code, month))
    conn.commit(); conn.close()
    return {"success": True, "message": f"Đã xóa phiếu lương của {employee_code} tháng {month}"}


# ─── Admin: Bulk Generate Salary Slips ────────────────────────────────

@router.post("/admin/bulk-generate")
async def bulk_generate_salary_slips(body: dict, admin_code: str = None, token: str = None, role: str = None):
    require_admin(admin_code, token, role)
    month = body.get("month")
    if not month:
        raise HTTPException(status_code=400, detail="Month is required")

    conn = get_conn()
    sql = """
        SELECT employee_code, full_name, department FROM employees
        WHERE status='active' AND (employee_code IS NULL OR employee_code != '') AND employee_code != 'admin'
    """
    params = []
    if body.get("department"):
        sql += " AND department = ?"; params.append(body["department"])
    employees = conn.execute(sql, params).fetchall()

    basic = body.get("default_basic_salary", 0)
    allowances = body.get("default_allowances", 0)
    bonus = body.get("default_bonus", 0)
    deductions = body.get("default_deductions", 0)
    net = basic + allowances + bonus - deductions

    created = 0; updated = 0; errors = []
    for emp in employees:
        try:
            existing = conn.execute("SELECT id FROM salary_slips WHERE employee_code=? AND month=?",
                (emp["employee_code"], month)).fetchone()
            if existing:
                conn.execute("""
                    UPDATE salary_slips SET basic_salary=?, allowances=?, bonus=?, deductions=?, net_salary=?,
                        updated_at=datetime('now','localtime'), updated_by=?
                    WHERE employee_code=? AND month=?
                """, (basic, allowances, bonus, deductions, net, admin_code, emp["employee_code"], month))
                updated += 1
            else:
                conn.execute("""
                    INSERT INTO salary_slips (employee_code, month, basic_salary, allowances, bonus, deductions, net_salary, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (emp["employee_code"], month, basic, allowances, bonus, deductions, net, admin_code))
                created += 1
        except Exception as e:
            errors.append(f"{emp['employee_code']}: {str(e)}")
    conn.commit(); conn.close()
    return {"success": True, "created": created, "updated": updated, "errors": errors}


# ─── Admin: Upload Excel → Store Full JSON ────────────────────────────

from ..utils.pdf_generator import create_salary_context, generate_single_pdf_from_json

TEMPLATE_PATHS = [
    Path('/app/templates/luong.docx'),
    Path(__file__).parent.parent.parent / 'templates' / 'luong.docx',
    Path(__file__).parent.parent.parent.parent / 'frontend' / 'src' / 'template' / 'luong.docx',
    Path(__file__).parent.parent.parent / 'frontend' / 'src' / 'template' / 'luong.docx',
]
TEMPLATE_PATH = next((p for p in TEMPLATE_PATHS if p.exists()), None)

@router.get("/admin/download-template")
async def download_template():
    """Tải file Excel mẫu để nhập dữ liệu lương."""
    columns = [
        'ID', 'NAME', 'PASSWORD',
        'Chức vụ', 'Phòng Ban', 'Ngày vào làm',
        'Mức lương', 'Mức trợ cấp tiền ăn', 'Mức trợ cấp tiền điện thoại',
        'Mức trợ cấp xăng xe', 'Mức hiệu quả tuân thủ', 'Mức trợ cấp Phụ cấp khác',
        'Ngày công chuẩn trong tháng', 'Ngày công hưởng lương', 'Ngày công ca đêm ',
        'Giờ chờ Di chuyển', 'Giờ tăng ca ngày thường', 'Giờ tăng ca ngày nghỉ ',
        'Tỷ lệ đánh giá HQ TT', 'Tiền lương',
        'Trợ cấp tiền ăn', 'Trợ cấp điện thoại', 'Trợ cấp xăng xe',
        'Hiệu quả và tuân thủ', 'Trợ cấp Phụ cấp khác', 'Trợ cấp ca đêm',
        'Lương tăng ca', 'Truy lĩnh cộng', 'Truy thu', 'Khác',
        'BHXH, YT,TN (10.5%)', 'Thuế TNCN', 'Đoàn phí', 'Thực nhận (A-B)',
        'Phép năm tồn đầu kỳ', 'Phép năm phát sinh có', 'Phép năm sử dụng', 'Phép năm tồn cuối kỳ',
        'Tồn đầu kỳ', 'Phát sinh có', 'Sử dụng', 'Tồn cuối kỳ',
        'Số người phụ thuộc', 'Ghi Chú',
    ]
    sample = {
        'ID': 'NV001', 'NAME': 'Nguyễn Văn A', 'PASSWORD': '123456',
        'Chức vụ': 'Nhân viên', 'Phòng Ban': 'Kỹ thuật', 'Ngày vào làm': '2020-01-15',
        'Mức lương': 10000000, 'Mức trợ cấp tiền ăn': 500000, 'Mức trợ cấp tiền điện thoại': 200000,
        'Mức trợ cấp xăng xe': 300000, 'Mức hiệu quả tuân thủ': 1000000, 'Mức trợ cấp Phụ cấp khác': 0,
        'Ngày công chuẩn trong tháng': 26, 'Ngày công hưởng lương': 26, 'Ngày công ca đêm ': 0,
        'Giờ chờ Di chuyển': 0, 'Giờ tăng ca ngày thường': 10, 'Giờ tăng ca ngày nghỉ ': 0,
        'Tỷ lệ đánh giá HQ TT': 0.95, 'Tiền lương': 10000000,
        'Trợ cấp tiền ăn': 500000, 'Trợ cấp điện thoại': 200000, 'Trợ cấp xăng xe': 300000,
        'Hiệu quả và tuân thủ': 1000000, 'Trợ cấp Phụ cấp khác': 0, 'Trợ cấp ca đêm': 0,
        'Lương tăng ca': 500000, 'Truy lĩnh cộng': 0, 'Truy thu': 0, 'Khác': 0,
        'BHXH, YT,TN (10.5%)': 1050000, 'Thuế TNCN': 0, 'Đoàn phí': 20000, 'Thực nhận (A-B)': 11500000,
        'Phép năm tồn đầu kỳ': 6, 'Phép năm phát sinh có': 1, 'Phép năm sử dụng': 0, 'Phép năm tồn cuối kỳ': 7,
        'Tồn đầu kỳ': 0, 'Phát sinh có': 0, 'Sử dụng': 0, 'Tồn cuối kỳ': 0,
        'Số người phụ thuộc': 1, 'Ghi Chú': '',
    }
    df = pd.DataFrame([sample], columns=columns)
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Mẫu lương')
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': 'attachment; filename=template_luong.xlsx'}
    )


@router.post("/admin/upload-salaries")
async def upload_salaries_excel(
    excel_file: UploadFile = File(...),
    admin_code: str = None,
    token: str = None,
    role: str = None,
    force: bool = False,
    month: str = ""
):
    """
    Upload Excel → parse create_salary_context → lưu JSON vào bảng salaries.
    Nếu tháng đã có dữ liệu, trả về has_existing=true để frontend xác nhận.
    Gửi lại với force=true để ghi đè.
    """
    require_admin(admin_code, token, role)
    if not excel_file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="File must be .xlsx or .xls")

    try:
        content = await excel_file.read()
        df = pd.read_excel(io.BytesIO(content), engine='openpyxl')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Không thể đọc Excel: {str(e)}")

    if df.empty:
        raise HTTPException(status_code=400, detail="Excel rỗng")
    if 'ID' not in df.columns:
        raise HTTPException(status_code=400, detail="Thiếu cột 'ID'")

    from dateutil.relativedelta import relativedelta

    if month:
        try:
            parts = month.split('-')
            int(parts[0]); int(parts[1])
        except Exception:
            raise HTTPException(status_code=400, detail="Month format must be YYYY-MM")
        month_str = month
        current_date = datetime.strptime(month + "-01", "%Y-%m-%d")
    else:
        current_date = datetime.now()
        prev = current_date - relativedelta(months=1)
        month_str = f"{prev.year}-{prev.month:02d}"

    conn = get_conn()

    # Kiểm tra tháng đã có dữ liệu chưa
    existing_count = conn.execute(
        "SELECT COUNT(*) FROM salaries WHERE month=?", (month_str,)
    ).fetchone()[0]

    if existing_count > 0 and not force:
        conn.close()
        return {
            "success": True,
            "month": month_str,
            "has_existing": True,
            "existing_count": existing_count,
            "imported": 0,
            "errors": [],
            "message": f"Tháng {month_str} đã có {existing_count} bản ghi. Gửi lại với force=true để ghi đè."
        }

    success = 0; errors = []

    for idx, row in df.iterrows():
        try:
            emp_id = str(row.get('ID', '')).strip()
            if not emp_id:
                continue
            month_num = int(month_str.split('-')[1])
            year_num = int(month_str.split('-')[0])
            context = create_salary_context(row, current_date, month_num, year_num)
            password = str(row.get('PASSWORD', '')) if pd.notna(row.get('PASSWORD')) else ''
            salary_json = json.dumps(context, ensure_ascii=False)

            conn.execute("""
                INSERT INTO salaries (employee_code, month, password, data_json)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(employee_code, month) DO UPDATE SET
                    password=excluded.password, data_json=excluded.data_json,
                    updated_at=datetime('now','localtime')
            """, (emp_id, month_str, password, salary_json))

            # Tự động tạo user account nếu chưa có
            user = conn.execute("SELECT id FROM users WHERE employee_code=?", (emp_id,)).fetchone()
            if not user:
                conn.execute(
                    "INSERT OR IGNORE INTO users (employee_code, password_hash, role) VALUES (?, ?, ?)",
                    (emp_id, hashlib.sha256(emp_id.encode()).hexdigest(), 'user')
                )
            # Tự động tạo employee record nếu chưa có (để tìm kiếm được trên tab Nhân viên)
            emp_row = conn.execute("SELECT id FROM employees WHERE employee_code=?", (emp_id,)).fetchone()
            if not emp_row:
                conn.execute("""
                    INSERT INTO employees (employee_code, full_name, department, position, handover_date, status, created_at)
                    VALUES (?, ?, ?, ?, ?, 'active', datetime('now','localtime'))
                """, (context['ID'], context['NAME'], context.get('PB', ''), context.get('CHUCVU', ''), context.get('NVL', '')))
            success += 1
        except Exception as e:
            errors.append(f"Dòng {idx+2}: {str(e)}")

    # Ghi log upload
    uploader_name = conn.execute(
        "SELECT full_name FROM employees WHERE employee_code=?", (admin_code,)
    ).fetchone()
    conn.execute("""
        INSERT INTO salary_upload_logs (month, filename, uploaded_by, uploaded_by_name, record_count)
        VALUES (?, ?, ?, ?, ?)
    """, (month_str, excel_file.filename, admin_code,
          uploader_name['full_name'] if uploader_name else admin_code, success))

    conn.commit(); conn.close()
    return {"success": True, "month": month_str, "imported": success, "errors": errors}


# ─── Admin: List upload history ──────────────────────────────────────────

@router.get("/admin/upload-history")
async def list_upload_history(
    admin_code: str = None,
    token: str = None,
    role: str = None
):
    require_admin(admin_code, token, role)
    conn = get_conn()
    rows = conn.execute("""
        SELECT l.*, u.full_name AS uploader_name
        FROM salary_upload_logs l
        LEFT JOIN employees u ON u.employee_code = l.uploaded_by
        ORDER BY l.created_at DESC
        LIMIT 50
    """).fetchall()
    conn.close()
    return {"data": [dict(r) for r in rows]}


# ─── Admin: Import Salary Slip Data from Excel ──────────────────────────

def _safe_float(val):
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


@router.post("/admin/import-from-excel")
async def import_salary_from_excel(
    excel_file: UploadFile = File(...),
    month: str = "",
    pdf_type: str = "salary",
    admin_code: str = None,
    token: str = None,
    role: str = None
):
    """
    Import salary/bonus data from Excel into salary_slips table.
    Cột ID là employee_code. Tự động tạo user nếu chưa có.
    """
    require_admin(admin_code, token, role)
    if not excel_file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="File must be .xlsx or .xls")

    try:
        content = await excel_file.read()
        df = pd.read_excel(io.BytesIO(content), engine='openpyxl')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Không thể đọc Excel: {str(e)}")

    if df.empty:
        raise HTTPException(status_code=400, detail="Excel rỗng")
    if 'ID' not in df.columns:
        raise HTTPException(status_code=400, detail="Thiếu cột 'ID'")

    if not month:
        from dateutil.relativedelta import relativedelta
        prev = datetime.now() - relativedelta(months=1)
        month = f"{prev.year}-{prev.month:02d}"
    else:
        try:
            parts = month.split('-'); int(parts[0]); int(parts[1])
        except Exception:
            raise HTTPException(status_code=400, detail="Month format must be YYYY-MM")

    conn = get_conn()
    imported = 0; skipped = 0; errors = []; new_users = []

    for idx, row in df.iterrows():
        try:
            employee_code = str(row.get('ID', '')).strip()
            if not employee_code:
                skipped += 1; errors.append(f"Dòng {idx+2}: ID trống"); continue

            bonus = 0
            if pdf_type == 'salary':
                basic_salary = _safe_float(row.get('Mức lương'))
                allowances = sum([_safe_float(row.get(c)) for c in [
                    'Trợ cấp tiền ăn', 'Trợ cấp điện thoại', 'Trợ cấp xăng xe',
                    'Hiệu quả và tuân thủ', 'Trợ cấp Phụ cấp khác', 'Trợ cấp ca đêm',
                    'Lương tăng ca', 'Truy lĩnh cộng'
                ]])
                deductions = sum([_safe_float(row.get(c)) for c in [
                    'BHXH, YT,TN (10.5%)', 'Thuế TNCN', 'Đoàn phí', 'Truy thu'
                ]])
                net_salary = _safe_float(row.get('Thực nhận (A-B)'))
            else:
                basic_salary = _safe_float(row.get('Mức thu nhập tính thưởng', row.get('Mức lương', 0)))
                bonus = _safe_float(row.get('Tiền thưởng Tết', row.get('Thưởng Tết', 0)))
                allowances = 0
                deductions = _safe_float(row.get('Tổng thuế TNCN', 0))
                net_salary = _safe_float(row.get('Thực nhận (A-B+C)', row.get('Thực nhận', 0)))

            existing = conn.execute("SELECT id FROM salary_slips WHERE employee_code=? AND month=?",
                (employee_code, month)).fetchone()

            if existing:
                conn.execute("""
                    UPDATE salary_slips SET basic_salary=?, allowances=?, bonus=?, deductions=?, net_salary=?,
                        updated_at=datetime('now','localtime'), updated_by=?
                    WHERE employee_code=? AND month=?
                """, (basic_salary, allowances, bonus, deductions, net_salary, admin_code, employee_code, month))
            else:
                conn.execute("""
                    INSERT INTO salary_slips (employee_code, month, basic_salary, allowances, bonus, deductions, net_salary, notes, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (employee_code, month, basic_salary, allowances, bonus, deductions, net_salary,
                      f"Imported from Excel by {admin_code}", admin_code))

            user = conn.execute("SELECT id FROM users WHERE employee_code=?", (employee_code,)).fetchone()
            if not user:
                conn.execute("INSERT OR IGNORE INTO users (employee_code, password_hash, role) VALUES (?, ?, ?)",
                    (employee_code, hashlib.sha256(employee_code.encode()).hexdigest(), 'user'))
                new_users.append(employee_code)

            imported += 1
        except Exception as e:
            errors.append(f"Dòng {idx+2}: {str(e)}"); continue

    conn.commit(); conn.close()
    return {"success": True, "month": month, "pdf_type": pdf_type, "imported": imported,
            "skipped": skipped, "total": imported + skipped, "new_users": new_users, "errors": errors}


# ─── Admin: View Employee Salary Slip JSON ──────────────────────────

@router.get("/admin/view/{employee_code}")
async def admin_view_salary_slip(
    employee_code: str,
    month: str = "",
    admin_code: str = None,
    token: str = None,
    role: str = None
):
    """Admin xem phiếu lương của nhân viên dạng JSON."""
    require_admin(admin_code, token, role)
    if not month:
        raise HTTPException(status_code=400, detail="Missing month parameter")
    conn = get_conn()
    record = conn.execute(
        "SELECT data_json, password FROM salaries WHERE employee_code=? AND month=?",
        (employee_code, month)
    ).fetchone()
    conn.close()
    if not record:
        raise HTTPException(status_code=404, detail="Chưa có phiếu lương cho tháng này")
    return {"success": True, "data": json.loads(record["data_json"]), "has_password": bool(record["password"])}


# ─── Admin: Get Employees with Salary for Month ─────────────────────

@router.get("/admin/with-salary")
async def admin_get_employees_with_salary(
    month: str = "",
    department: str = "",
    search: str = "",
    admin_code: str = None,
    token: str = None,
    role: str = None
):
    """
    Lấy danh sách nhân viên đã có phiếu lương trong tháng.
    Dùng cho admin chọn nhân viên để xem/sửa.
    """
    require_admin(admin_code, token, role)
    if not month:
        raise HTTPException(status_code=400, detail="Missing month parameter")
    conn = get_conn()
    sql = """
        SELECT s.employee_code, e.full_name, e.department, e.position, s.month
        FROM salaries s
        LEFT JOIN employees e ON e.employee_code = s.employee_code
        WHERE s.month = ?
    """
    params = [month]
    if department and department != "Tất cả":
        sql += " AND e.department = ?"; params.append(department)
    if search:
        sql += " AND (e.full_name LIKE ? OR s.employee_code LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])
    sql += " ORDER BY e.department, e.full_name"
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return {"data": [dict(r) for r in rows], "total": len(rows)}


# ─── Admin: Update Fields in Salary JSON ────────────────────────────

@router.put("/admin/update-fields")
async def admin_update_salary_fields(
    body: dict,
    admin_code: str = None,
    token: str = None,
    role: str = None
):
    """
    Admin cập nhật các trường trong phiếu lương của nhân viên.
    Body: { employee_code, month, fields: { "NAME": "xxx", "PB": "yyy", ... } }
    """
    if not admin_code: admin_code = body.get("admin_code")
    if not token: token = body.get("token")
    if not role: role = body.get("role")
    require_admin(admin_code, token, role)
    employee_code = body.get("employee_code")
    month = body.get("month")
    fields = body.get("fields", {})

    if not employee_code or not month:
        raise HTTPException(status_code=400, detail="Missing employee_code or month")
    if not fields:
        raise HTTPException(status_code=400, detail="Missing fields to update")

    conn = get_conn()
    record = conn.execute(
        "SELECT data_json FROM salaries WHERE employee_code=? AND month=?",
        (employee_code, month)
    ).fetchone()
    if not record:
        conn.close()
        raise HTTPException(status_code=404, detail="Chưa có phiếu lương")

    data = json.loads(record["data_json"])
    for key, value in fields.items():
        data[key] = str(value) if value is not None else ""

    updated_json = json.dumps(data, ensure_ascii=False)
    conn.execute(
        "UPDATE salaries SET data_json=?, updated_at=datetime('now','localtime') WHERE employee_code=? AND month=?",
        (updated_json, employee_code, month)
    )
    conn.commit()
    conn.close()
    return {"success": True, "data": data}


# ─── Admin: Export Salary Slip to PDF (with password) ───────────────

from fastapi.responses import FileResponse

@router.post("/admin/export-pdf")
async def admin_export_salary_pdf(
    body: dict,
    background_tasks: BackgroundTasks,
    admin_code: str = None,
    token: str = None,
    role: str = None
):
    """
    Xuất phiếu lương PDF có mật khẩu.
    Body: { employee_code, month, password: "xxx", fields: { ... } (tùy chọn) }
    Trả về file PDF để download.
    """
    if not admin_code: admin_code = body.get("admin_code")
    if not token: token = body.get("token")
    if not role: role = body.get("role")
    require_admin(admin_code, token, role)
    employee_code = body.get("employee_code")
    month = body.get("month")
    password = body.get("password", "")
    field_overrides = body.get("fields", {})

    if not employee_code or not month:
        raise HTTPException(status_code=400, detail="Missing employee_code or month")

    if not TEMPLATE_PATH or not TEMPLATE_PATH.exists():
        raise HTTPException(status_code=500, detail="Template file luong.docx not found")

    conn = get_conn()
    record = conn.execute(
        "SELECT data_json FROM salaries WHERE employee_code=? AND month=?",
        (employee_code, month)
    ).fetchone()
    conn.close()
    if not record:
        raise HTTPException(status_code=404, detail="Chưa có phiếu lương")

    data = json.loads(record["data_json"])

    # Apply any field overrides
    for key, value in field_overrides.items():
        data[key] = str(value) if value is not None else ""

    # Generate PDF in temp directory
    output_dir = Path("temp_pdf_gen")
    output_dir.mkdir(parents=True, exist_ok=True)
    safe_code = employee_code.replace('/', '_').replace('\\', '_')
    output_path = output_dir / f"{safe_code}_{month}.pdf"

    try:
        generate_single_pdf_from_json(data, str(TEMPLATE_PATH), str(output_path), password)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi tạo PDF: {str(e)}")

    if not output_path.exists():
        raise HTTPException(status_code=500, detail="Không thể tạo file PDF")

    background_tasks.add_task(os.unlink, str(output_path))

    return FileResponse(
        str(output_path),
        media_type="application/pdf",
        filename=f"luong_{safe_code}_{month}.pdf"
    )


# ─── Admin: Batch Export PDFs as ZIP ──────────────────────────

@router.post("/admin/batch-export-pdf")
async def admin_batch_export_pdf(
    body: dict,
    admin_code: str = None,
    token: str = None,
    role: str = None
):
    """
    Xuất hàng loạt phiếu lương PDF và đóng gói ZIP.
    Body: { month, department: "" (tùy chọn), employee_codes: [] (tùy chọn) }
    Trả về file ZIP để download.
    """
    if not admin_code: admin_code = body.get("admin_code")
    if not token: token = body.get("token")
    if not role: role = body.get("role")
    require_admin(admin_code, token, role)
    month = body.get("month")
    if not month:
        raise HTTPException(status_code=400, detail="Missing month")

    if not TEMPLATE_PATH or not TEMPLATE_PATH.exists():
        raise HTTPException(status_code=500, detail="Template file luong.docx not found")

    conn = get_conn()
    sql = """
        SELECT s.employee_code, s.data_json, e.full_name
        FROM salaries s
        LEFT JOIN employees e ON e.employee_code = s.employee_code
        WHERE s.month = ?
    """
    params = [month]

    emp_codes = body.get("employee_codes", [])
    if emp_codes:
        placeholders = ",".join("?" for _ in emp_codes)
        sql += f" AND s.employee_code IN ({placeholders})"
        params.extend(emp_codes)

    department = body.get("department", "")
    if department and department != "Tất cả":
        sql += " AND e.department = ?"
        params.append(department)

    rows = conn.execute(sql, params).fetchall()
    conn.close()

    if not rows:
        raise HTTPException(status_code=404, detail="Không có dữ liệu phiếu lương cho tháng này")

    export_dir = Path("temp_pdf_gen") / f"batch_{month}"
    if export_dir.exists():
        shutil.rmtree(str(export_dir))
    export_dir.mkdir(parents=True, exist_ok=True)

    errors = []
    success_count = 0

    for row in rows:
        try:
            data = json.loads(row["data_json"])
            emp_code = row["employee_code"]
            safe_code = emp_code.replace('/', '_').replace('\\', '_')
            pdf_path = export_dir / f"{safe_code}_{month}.pdf"

            generate_single_pdf_from_json(data, str(TEMPLATE_PATH), str(pdf_path), "")
            success_count += 1
        except Exception as e:
            errors.append(f"{row.get('employee_code', '?')}: {str(e)}")

    # Create ZIP
    zip_path = export_dir.parent / f"luong_{month}.zip"
    with zipfile.ZipFile(str(zip_path), 'w', zipfile.ZIP_DEFLATED) as zf:
        for pdf_file in export_dir.glob("*.pdf"):
            zf.write(str(pdf_file), pdf_file.name)

    # Cleanup PDF files
    shutil.rmtree(str(export_dir))

    if not zip_path.exists():
        raise HTTPException(status_code=500, detail="Không thể tạo file ZIP")

    return FileResponse(
        str(zip_path),
        media_type="application/zip",
        filename=f"luong_{month}.zip",
        headers={
            "X-Total-Count": str(success_count),
            "X-Error-Count": str(len(errors)),
        }
    )
