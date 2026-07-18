"""
Backend API Endpoint for Salary Slip Module
File: app/routers/salary_slips.py (Example implementation)

IMPORTANT: 
- Replace '/path/to/ftp/salary' with actual FTP storage path
- Implement proper authentication middleware
- Add logging for audit trail
"""

from fastapi import APIRouter, Query, HTTPException, Depends
from fastapi.responses import FileResponse
import os
from pathlib import Path

router = APIRouter(prefix="/api/salary-slips", tags=["Salary Slips"])


def get_current_employee_code():
    """
    TODO: Replace with actual auth middleware
    This should extract employee_code from JWT token or session
    """
    # Example: return decoded_token.get('employee_code')
    raise NotImplementedError("Implement authentication middleware")


@router.get("/my")
async def get_my_salary_slip(
    month: str = Query(..., regex=r"^\d{4}-\d{2}$", description="Format: YYYY-MM"),
    employee_code: str = Depends(get_current_employee_code)
):
    """
    Trả về file PDF phiếu lương của nhân viên đăng nhập
    
    Args:
        month: Tháng cần xem (YYYY-MM)
        employee_code: Mã nhân viên (từ auth token)
    
    Returns:
        FileResponse: PDF file stream
    
    Raises:
        400: Invalid month format
        404: Salary slip not found
        500: Server error
    """
    
    # Validate month format
    try:
        year, mon = month.split('-')
        year_int = int(year)
        month_int = int(mon)
        
        if not (1900 <= year_int <= 2100):
            raise ValueError("Invalid year")
        if not (1 <= month_int <= 12):
            raise ValueError("Invalid month")
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid month format. Expected YYYY-MM, got: {month}"
        )
    
    # Construct file path
    # TODO: Replace with your actual FTP storage path
    base_path = Path("/path/to/ftp/salary")  # e.g., /mnt/ftp/salary or C:/FTP/Salary
    file_path = base_path / year / mon / f"{employee_code}.pdf"
    
    # Security check: Prevent directory traversal
    try:
        file_path = file_path.resolve()
        if not str(file_path).startswith(str(base_path.resolve())):
            raise HTTPException(status_code=403, detail="Access denied")
    except Exception:
        raise HTTPException(status_code=403, detail="Invalid file path")
    
    # Check file exists
    if not file_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Chưa có phiếu lương cho tháng này"
        )
    
    # Check file is actually PDF
    if not file_path.suffix.lower() == '.pdf':
        raise HTTPException(
            status_code=500,
            detail="Invalid file format"
        )
    
    # Log access for audit
    # TODO: Add logging
    # logger.info(f"Salary slip accessed: {employee_code} - {month}")
    
    # Return file
    return FileResponse(
        path=str(file_path),
        media_type="application/pdf",
        filename=f"phieu-luong-{month}-{employee_code}.pdf",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )


# ─── Alternative: Return URL instead of file stream ───────────────────

@router.get("/my-url")
async def get_my_salary_slip_url(
    month: str = Query(..., regex=r"^\d{4}-\d{2}$"),
    employee_code: str = Depends(get_current_employee_code)
):
    """
    Alternative: Trả về URL của file PDF thay vì stream
    Frontend sẽ fetch URL này bằng axios
    """
    
    year, mon = month.split('-')
    
    # Generate signed URL (if using cloud storage like S3)
    # Or generate temporary access token
    file_url = f"/static/salary/{year}/{mon}/{employee_code}.pdf"
    
    # Check exists
    if not os.path.exists(f"./static/salary/{year}/{mon}/{employee_code}.pdf"):
        raise HTTPException(status_code=404, detail="Not found")
    
    return {
        "url": file_url,
        "month": month,
        "expires_at": "2024-12-31T23:59:59Z"  # Optional expiration
    }


# ─── Admin: Upload salary slip ────────────────────────────────────────

from fastapi import UploadFile, File

@router.post("/upload")
async def upload_salary_slip(
    employee_code: str,
    month: str,
    file: UploadFile = File(...),
    admin_code: str = Depends(get_current_employee_code)  # Must be admin
):
    """
    Admin endpoint: Upload phiếu lương cho nhân viên
    
    TODO: Add role check (admin only)
    """
    
    # Validate file type
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files allowed")
    
    # Save file
    year, mon = month.split('-')
    base_path = Path("/path/to/ftp/salary")
    save_dir = base_path / year / mon
    save_dir.mkdir(parents=True, exist_ok=True)
    
    file_path = save_dir / f"{employee_code}.pdf"
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    # Log activity
    # logger.info(f"Salary slip uploaded by {admin_code} for {employee_code} - {month}")
    
    return {
        "message": "Upload successful",
        "employee_code": employee_code,
        "month": month,
        "file_size": len(content)
    }


# ─── Integration to main.py ───────────────────────────────────────────

"""
In your main.py, add:

from app.routers import salary_slips

app.include_router(salary_slips.router)
"""

# ─── Requirements ──────────────────────────────────────────────────────

"""
Add to requirements.txt if needed:
- aiofiles (for async file handling)
- python-multipart (for file uploads)
"""

# ─── Testing with curl ─────────────────────────────────────────────────

"""
# Get salary slip
curl -H "Authorization: Bearer <token>" \
     "http://localhost:8080/api/salary-slips/my?month=2024-12"

# Upload salary slip (admin)
curl -X POST \
     -H "Authorization: Bearer <admin_token>" \
     -F "file=@salary.pdf" \
     "http://localhost:8080/api/salary-slips/upload?employee_code=NV001&month=2024-12"
"""
