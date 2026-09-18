"""
Router cho Module In Công Thức Sản Xuất (Manufacturing Formula Printing)

SECURITY ARCHITECTURE:
- Văn phòng (admin/head/vp_editor): Upload Excel, quản lý, xem nội dung
- Nhà máy (factory_worker/user): Chỉ tìm kiếm metadata và in trực tiếp
- File Excel/PDF được lưu trong private storage, KHÔNG expose qua web
- Chỉ có endpoint /print-stream trả PDF binary để in, không cho download

WORKFLOW:
1. VP upload Excel (.xlsx) → Backend lưu vào private storage
2. Backend tự động convert Excel → PDF bằng OnlyOffice Conversion API
3. Nhà máy tìm kiếm công thức theo mã/tên (chỉ nhận metadata)
4. Nhà máy bấm IN → Frontend nhận PDF stream → Gửi thẳng tới máy in
5. Mọi lệnh in đều được ghi audit log
"""

import os
import logging
import requests
import jwt
import time
from datetime import datetime
from typing import Optional
from pathlib import Path
from urllib.parse import urljoin

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..core.session import SessionLocal
from ..core.auth import verify_session
from ..core import events
from ..models import FormulaRecipe, FormulaPrintLog, Employee
from ..core.db import fetchall, fetchone, execute, insert

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/formulas", tags=["Formulas"])

# Private storage cho công thức (không được serve bởi nginx/static)
STORAGE_DIR = os.environ.get('FORMULA_STORAGE_DIR', '/app/storage/private_formulas')
os.makedirs(STORAGE_DIR, exist_ok=True)

# OnlyOffice Configuration
ONLYOFFICE_URL = os.environ.get('ONLYOFFICE_URL', 'http://onlyoffice')
ONLYOFFICE_SECRET = os.environ.get('ONLYOFFICE_SECRET', '')
BACKEND_PUBLIC_URL = os.environ.get('BACKEND_PUBLIC_URL', 'http://backend:8000')


def get_db():
    """Dependency để lấy DB session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    x_user_code: str = Query(..., alias="user_code"),
    x_user_role: str = Query(..., alias="user_role"),
    x_user_dept: str = Query("", alias="user_dept"),
    x_user_token: str = Query("", alias="token")
):
    """Dependency xác thực user từ headers"""
    return verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)


def check_office_permission(user_role: str, user_code: str = None):
    """Kiểm tra quyền quản lý công thức (upload/edit/delete)"""
    if user_role in ["admin", "head"]:
        return
    # Kiểm tra quyền module 'formula-management' từ DB
    if user_code:
        from .auth import _get_effective_permissions
        perms = _get_effective_permissions(user_code)
        if perms.get("formula-management", {}).get("can_edit"):
            return
    raise HTTPException(
        status_code=403,
        detail="Bạn không có quyền quản lý công thức. Liên hệ quản trị viên."
    )


def convert_excel_to_pdf(excel_path: str, output_dir: str) -> str:
    """
    Chuyển đổi Excel sang PDF bằng OnlyOffice Document Server Conversion API
    
    OnlyOffice Conversion API endpoint: /ConvertService.ashx
    - Hỗ trợ xlsx, xls → pdf
    - JWT authentication
    - Async conversion với callback
    
    Args:
        excel_path: Đường dẫn file Excel đầu vào
        output_dir: Thư mục xuất file PDF
    
    Returns:
        Đường dẫn file PDF đã convert
    
    Raises:
        RuntimeError: Nếu conversion thất bại
    """
    try:
        # Tạo JWT token cho OnlyOffice
        def create_onlyoffice_token(payload):
            if not ONLYOFFICE_SECRET:
                return None
            return jwt.encode(payload, ONLYOFFICE_SECRET, algorithm='HS256')
        
        # Tạo URL công khai để OnlyOffice download file Excel
        # OnlyOffice cần truy cập được file qua HTTP
        filename = os.path.basename(excel_path)
        download_url = f"{BACKEND_PUBLIC_URL}/api/formulas/_internal/download-temp/{filename}"
        
        # Lưu file path tạm để endpoint internal có thể serve
        # (Chỉ dùng trong quá trình conversion, xóa sau khi xong)
        temp_map = getattr(convert_excel_to_pdf, '_temp_files', {})
        temp_map[filename] = excel_path
        convert_excel_to_pdf._temp_files = temp_map
        
        # Output filename
        pdf_filename = Path(excel_path).stem + ".pdf"
        pdf_path = os.path.join(output_dir, pdf_filename)
        
        # OnlyOffice Conversion API payload
        conversion_payload = {
            "async": False,  # Synchronous conversion
            "url": download_url,
            "outputtype": "pdf",
            "filetype": "xlsx",
            "title": filename,
            "key": f"formula_{int(time.time())}_{filename}"
        }
        
        # Add JWT if configured
        if ONLYOFFICE_SECRET:
            conversion_payload["token"] = create_onlyoffice_token(conversion_payload)
        
        # Call OnlyOffice Conversion API
        conversion_url = urljoin(ONLYOFFICE_URL, "/ConvertService.ashx")
        
        logger.info(f"Converting {filename} via OnlyOffice at {conversion_url}")
        
        response = requests.post(
            conversion_url,
            json=conversion_payload,
            timeout=120  # 2 minutes timeout
        )
        
        if response.status_code != 200:
            logger.error(f"OnlyOffice conversion failed: {response.status_code} - {response.text}")
            raise RuntimeError(f"OnlyOffice conversion API error: {response.status_code}")
        
        result = response.json()
        
        if result.get("error"):
            error_code = result["error"]
            error_msg = f"OnlyOffice conversion error code: {error_code}"
            logger.error(error_msg)
            raise RuntimeError(error_msg)
        
        # Download converted PDF
        pdf_url = result.get("fileUrl") or result.get("url")
        if not pdf_url:
            raise RuntimeError("No PDF URL returned from OnlyOffice")
        
        logger.info(f"Downloading converted PDF from: {pdf_url}")
        
        pdf_response = requests.get(pdf_url, timeout=60)
        if pdf_response.status_code != 200:
            raise RuntimeError(f"Failed to download converted PDF: {pdf_response.status_code}")
        
        # Save PDF
        with open(pdf_path, "wb") as f:
            f.write(pdf_response.content)
        
        # Cleanup temp mapping
        if filename in temp_map:
            del temp_map[filename]
        
        logger.info(f"✓ Converted Excel to PDF via OnlyOffice: {pdf_path}")
        return pdf_path
        
    except requests.Timeout:
        raise RuntimeError("Timeout khi convert Excel sang PDF (>120s)")
    except requests.RequestException as e:
        logger.error(f"OnlyOffice request error: {str(e)}")
        raise RuntimeError(f"Lỗi kết nối OnlyOffice: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error during conversion: {str(e)}")
        raise RuntimeError(f"Lỗi không xác định khi convert: {str(e)}")


def generate_unique_filename(recipe_code: str, original_filename: str) -> str:
    """Tạo tên file unique dựa trên mã công thức và timestamp"""
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    ext = Path(original_filename).suffix
    return f"{recipe_code}_{timestamp}{ext}"


# ═══════════════════════════════════════════════════════════════════════════
# INTERNAL ENDPOINTS (For OnlyOffice conversion only)
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/_internal/download-temp/{filename}")
async def download_temp_file_for_conversion(filename: str):
    """
    INTERNAL endpoint để OnlyOffice Document Server download file Excel tạm
    trong quá trình conversion.
    
    ⚠️ KHÔNG dùng cho mục đích khác!
    File mapping được tạo tạm thời trong convert_excel_to_pdf() và xóa ngay sau.
    """
    temp_map = getattr(convert_excel_to_pdf, '_temp_files', {})
    
    if filename not in temp_map:
        raise HTTPException(status_code=404, detail="Temp file not found")
    
    file_path = temp_map[filename]
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    def iterfile():
        with open(file_path, mode="rb") as file_like:
            yield from file_like
    
    return StreamingResponse(
        iterfile(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# ═══════════════════════════════════════════════════════════════════════════
# OFFICE ENDPOINTS (Admin / Head / VP Editor)
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/upload")
async def upload_formula(
    recipe_code: str = Form(...),
    recipe_name: str = Form(...),
    category: str = Form(""),
    version: str = Form("v1.0"),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload công thức sản xuất (Excel hoặc PDF) - CHỈ DÀNH CHO VĂN PHÒNG
    
    Quy trình:
    1. Validate quyền văn phòng
    2. Kiểm tra file (.xlsx, .xls hoặc .pdf)
    3. Lưu file vào private storage
    4. Nếu là Excel → Convert sang PDF tự động
       Nếu là PDF → Dùng nguyên bản
    5. Lưu metadata vào database
    
    Returns:
        {"success": True, "id": recipe_id, "message": "..."}
    """
    check_office_permission(current_user["user_role"], current_user["user_code"])
    
    # Validate file type - hỗ trợ cả Excel và PDF
    file_ext = file.filename.lower().split('.')[-1]
    is_excel = file_ext in ('xlsx', 'xls')
    is_pdf = file_ext == 'pdf'
    
    if not is_excel and not is_pdf:
        raise HTTPException(
            status_code=400,
            detail="Chỉ chấp nhận file Excel (.xlsx, .xls) hoặc PDF (.pdf)"
        )
    
    # Kiểm tra recipe_code đã tồn tại chưa
    existing = db.query(FormulaRecipe).filter(
        FormulaRecipe.recipe_code == recipe_code
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Mã công thức '{recipe_code}' đã tồn tại. Vui lòng sử dụng mã khác."
        )
    
    try:
        # Tạo tên file unique
        unique_filename = generate_unique_filename(recipe_code, file.filename)
        file_path = os.path.join(STORAGE_DIR, unique_filename)
        
        # Lưu file gốc (Excel hoặc PDF)
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        
        logger.info(f"✓ Saved file: {file_path}")
        
        pdf_path = None
        
        if is_excel:
            # Convert Excel → PDF
            pdf_path = convert_excel_to_pdf(file_path, STORAGE_DIR)
        else:
            # PDF - dùng nguyên bản
            pdf_path = file_path
            logger.info(f"✓ PDF file uploaded directly: {pdf_path}")
        
        # Lưu vào database
        new_recipe = FormulaRecipe(
            recipe_code=recipe_code,
            recipe_name=recipe_name,
            category=category,
            version=version,
            excel_file_path=file_path if is_excel else None,
            pdf_file_path=pdf_path,
            is_active=True,
            created_by=current_user["user_code"],
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        db.add(new_recipe)
        db.commit()
        db.refresh(new_recipe)
        
        logger.info(f"✓ Created formula recipe: {recipe_code} (ID: {new_recipe.id})")
        
        # SSE: broadcast real-time to FactoryPrinting clients
        events.publish_sync("formula_created", {
            "id": new_recipe.id,
            "recipe_code": new_recipe.recipe_code,
            "recipe_name": new_recipe.recipe_name,
            "category": new_recipe.category or "",
            "version": new_recipe.version or "v1.0",
            "created_at": new_recipe.created_at.isoformat() if new_recipe.created_at else "",
            "created_by": new_recipe.created_by or "",
        })
        
        return {
            "success": True,
            "id": new_recipe.id,
            "message": f"Đã tải lên công thức '{recipe_name}' thành công"
        }
        
    except RuntimeError as e:
        # Lỗi conversion - xóa file đã upload
        if os.path.exists(file_path):
            os.remove(file_path)
        if pdf_path and os.path.exists(pdf_path) and pdf_path != file_path:
            os.remove(pdf_path)
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        # Lỗi khác - cleanup
        if os.path.exists(file_path):
            os.remove(file_path)
        if pdf_path and os.path.exists(pdf_path) and pdf_path != file_path:
            os.remove(pdf_path)
        logger.error(f"Error uploading formula: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Lỗi khi tải lên: {str(e)}")


@router.get("/list")
def list_formulas(
    keyword: str = Query(""),
    category: str = Query(""),
    is_active: str = Query("true", description="true/false/all"),
    date_from: str = Query("", description="Filter từ ngày (YYYY-MM-DD)"),
    date_to: str = Query("", description="Filter đến ngày (YYYY-MM-DD)"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Lấy danh sách công thức - VĂN PHÒNG xem đầy đủ, NHÀ MÁY chỉ xem metadata
    
    Văn phòng: Trả về đầy đủ thông tin (bao gồm file paths, created_by)
    Nhà máy: Chỉ trả về metadata cơ bản (id, code, name, category, version)
    """
    is_office = current_user["user_role"] in ["admin", "head"]
    if not is_office:
        from .auth import _get_effective_permissions
        perms = _get_effective_permissions(current_user["user_code"])
        is_office = perms.get("formula-management", {}).get("can_view", False)
    
    query = db.query(FormulaRecipe)
    
    # Filter
    if keyword:
        search_term = f"%{keyword}%"
        query = query.filter(
            (FormulaRecipe.recipe_code.ilike(search_term)) |
            (FormulaRecipe.recipe_name.ilike(search_term))
        )
    
    if category:
        query = query.filter(FormulaRecipe.category == category)
    
    # is_active filter (accepts "true", "false", "all")
    if is_active.lower() == "true":
        query = query.filter(FormulaRecipe.is_active == True)
    elif is_active.lower() == "false":
        query = query.filter(FormulaRecipe.is_active == False)
    # "all" = no filter
    
    # Date range filter
    if date_from:
        try:
            from datetime import date as date_type
            dt_from = datetime.strptime(date_from, "%Y-%m-%d")
            query = query.filter(FormulaRecipe.created_at >= dt_from)
        except ValueError:
            pass
    if date_to:
        try:
            from datetime import date as date_type, timedelta
            dt_to = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
            query = query.filter(FormulaRecipe.created_at < dt_to)
        except ValueError:
            pass
    
    recipes = query.order_by(FormulaRecipe.created_at.desc()).all()
    
    # Format response dựa trên quyền
    result = []
    for recipe in recipes:
        data = {
            "id": recipe.id,
            "recipe_code": recipe.recipe_code,
            "recipe_name": recipe.recipe_name,
            "category": recipe.category,
            "version": recipe.version,
            "is_active": recipe.is_active,
        }
        
        # Chỉ văn phòng mới xem thông tin đầy đủ
        if is_office:
            data.update({
                "created_by": recipe.created_by,
                "created_at": recipe.created_at.isoformat() if recipe.created_at else "",
                "updated_at": recipe.updated_at.isoformat() if recipe.updated_at else "",
                "excel_filename": os.path.basename(recipe.excel_file_path) if recipe.excel_file_path else "",
                "pdf_filename": os.path.basename(recipe.pdf_file_path) if recipe.pdf_file_path else "",
            })
        
        result.append(data)
    
    return {"data": result, "count": len(result)}


@router.get("/categories")
def get_categories(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lấy danh sách category (dòng sản phẩm) để filter"""
    categories = db.query(FormulaRecipe.category).filter(
        FormulaRecipe.category != "",
        FormulaRecipe.is_active == True
    ).distinct().all()
    
    return {"data": [cat[0] for cat in categories if cat[0]]}


@router.put("/{recipe_id}")
async def update_formula(
    recipe_id: int,
    recipe_name: str = Form(None),
    category: str = Form(None),
    version: str = Form(None),
    is_active: bool = Form(None),
    file: Optional[UploadFile] = File(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Cập nhật công thức - CHỈ DÀNH CHO VĂN PHÒNG
    
    Có thể cập nhật:
    - Metadata (tên, category, version, trạng thái)
    - File Excel mới (sẽ tự động convert lại PDF)
    """
    check_office_permission(current_user["user_role"], current_user["user_code"])
    
    recipe = db.query(FormulaRecipe).filter(FormulaRecipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Không tìm thấy công thức")
    
    try:
        # Cập nhật metadata
        if recipe_name is not None:
            recipe.recipe_name = recipe_name
        if category is not None:
            recipe.category = category
        if version is not None:
            recipe.version = version
        if is_active is not None:
            recipe.is_active = is_active
        
        # Nếu có file mới, cập nhật file
        if file:
            if not file.filename.lower().endswith(('.xlsx', '.xls')):
                raise HTTPException(status_code=400, detail="Chỉ chấp nhận file Excel")
            
            # Xóa file cũ
            if os.path.exists(recipe.excel_file_path):
                os.remove(recipe.excel_file_path)
            if os.path.exists(recipe.pdf_file_path):
                os.remove(recipe.pdf_file_path)
            
            # Lưu file mới
            unique_filename = generate_unique_filename(recipe.recipe_code, file.filename)
            excel_path = os.path.join(STORAGE_DIR, unique_filename)
            
            content = await file.read()
            with open(excel_path, "wb") as f:
                f.write(content)
            
            # Convert lại PDF
            pdf_path = convert_excel_to_pdf(excel_path, STORAGE_DIR)
            
            recipe.excel_file_path = excel_path
            recipe.pdf_file_path = pdf_path
        
        recipe.updated_at = datetime.utcnow()
        db.commit()
        
        # SSE: broadcast update to FactoryPrinting clients
        events.publish_sync("formula_updated", {
            "id": recipe.id,
            "recipe_code": recipe.recipe_code,
            "recipe_name": recipe.recipe_name,
            "is_active": recipe.is_active,
        })
        
        return {"success": True, "message": "Đã cập nhật công thức thành công"}
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating formula: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Lỗi khi cập nhật: {str(e)}")


@router.delete("/{recipe_id}")
def delete_formula(
    recipe_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Xóa công thức - CHỈ DÀNH CHO ADMIN
    
    Xóa vật lý file và record trong database
    """
    if current_user["user_role"] != "admin":
        from .auth import _get_effective_permissions
        perms = _get_effective_permissions(current_user["user_code"])
        if not perms.get("formula-management", {}).get("can_edit", False):
            raise HTTPException(
                status_code=403,
                detail="Chỉ Admin mới có quyền xóa công thức"
            )
    
    recipe = db.query(FormulaRecipe).filter(FormulaRecipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Không tìm thấy công thức")
    
    try:
        # Xóa file vật lý
        if os.path.exists(recipe.excel_file_path):
            os.remove(recipe.excel_file_path)
        if os.path.exists(recipe.pdf_file_path):
            os.remove(recipe.pdf_file_path)
        
        # Xóa record (cascade sẽ xóa print logs)
        db.delete(recipe)
        db.commit()
        
        logger.info(f"✓ Deleted formula recipe: {recipe.recipe_code} (ID: {recipe_id})")
        
        # SSE: broadcast deletion to FactoryPrinting clients
        events.publish_sync("formula_deleted", {"id": recipe_id})
        
        return {"success": True, "message": "Đã xóa công thức thành công"}
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting formula: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Lỗi khi xóa: {str(e)}")


# ═══════════════════════════════════════════════════════════════════════════
# FACTORY ENDPOINTS (All Users including Factory Workers)
# ═══════════════════════════════════════════════════════════════════════════

def check_print_permission(user_role: str, user_code: str = None):
    """Kiểm tra quyền in công thức (factory-printing module)"""
    if user_role in ["admin", "head"]:
        return
    if user_code:
        from .auth import _get_effective_permissions
        perms = _get_effective_permissions(user_code)
        if perms.get("factory-printing", {}).get("can_view"):
            return
    raise HTTPException(
        status_code=403,
        detail="Bạn không có quyền in công thức. Liên hệ quản trị viên."
    )


@router.get("/search")
def search_formulas(
    keyword: str = Query("", description="Tìm theo mã hoặc tên công thức"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Tìm kiếm công thức - DÀNH CHO NHÀ MÁY
    
    Khi keyword trống → trả về công thức mới nhất trong ngày
    Khi có keyword → tìm kiếm theo mã/tên
    
    CHỈ TRẢ VỀ METADATA - KHÔNG CÓ FILE PATH
    """
    check_print_permission(current_user["user_role"], current_user["user_code"])
    
    if not keyword.strip():
        # Trả về công thức active mới nhất trong ngày (limit 20)
        from datetime import date as date_type
        today_start = datetime.combine(date_type.today(), datetime.min.time())
        recipes = db.query(FormulaRecipe).filter(
            FormulaRecipe.is_active == True,
            FormulaRecipe.created_at >= today_start,
        ).order_by(FormulaRecipe.created_at.desc()).limit(20).all()
        
        result = [
            {
                "id": r.id,
                "recipe_code": r.recipe_code,
                "recipe_name": r.recipe_name,
                "category": r.category or "",
                "version": r.version or "v1.0",
                "created_at": r.created_at.isoformat() if r.created_at else "",
            }
            for r in recipes
        ]
        return {"data": result}
    
    search_term = f"%{keyword}%"
    
    recipes = db.query(FormulaRecipe).filter(
        FormulaRecipe.is_active == True,
        (FormulaRecipe.recipe_code.ilike(search_term)) |
        (FormulaRecipe.recipe_name.ilike(search_term))
    ).order_by(FormulaRecipe.created_at.desc()).limit(20).all()
    
    result = [
        {
            "id": r.id,
            "recipe_code": r.recipe_code,
            "recipe_name": r.recipe_name,
            "category": r.category or "",
            "version": r.version or "v1.0",
            "created_at": r.created_at.isoformat() if r.created_at else "",
        }
        for r in recipes
    ]
    
    return {"data": result}


@router.get("/{recipe_id}/print-stream")
async def stream_pdf_for_print(
    recipe_id: int,
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Stream PDF để in trực tiếp - DÀNH CHO NHỮNG CÓ QUYỀN factory-printing
    
    SECURITY FEATURES:
    1. Trả về PDF dưới dạng binary stream (application/pdf)
    2. Header Content-Disposition: inline (không trigger download dialog)
    3. Header Cache-Control: no-store (không cache trên client)
    4. Ghi audit log mỗi lần in
    5. KHÔNG cho phép download, chỉ stream để in
    
    Frontend sẽ dùng printJS hoặc iframe để gửi stream này tới máy in
    mà không hiển thị preview window
    """
    check_print_permission(current_user["user_role"], current_user["user_code"])
    recipe = db.query(FormulaRecipe).filter(
        FormulaRecipe.id == recipe_id,
        FormulaRecipe.is_active == True
    ).first()
    
    if not recipe:
        raise HTTPException(status_code=404, detail="Không tìm thấy công thức")
    
    pdf_path = recipe.pdf_file_path
    
    if not os.path.exists(pdf_path):
        logger.error(f"PDF file not found: {pdf_path}")
        raise HTTPException(status_code=404, detail="File PDF không tồn tại")
    
    # Ghi audit log
    try:
        log_entry = FormulaPrintLog(
            recipe_id=recipe_id,
            printed_by=current_user["user_code"],
            printed_at=datetime.utcnow(),
            ip_address=request.client.host if request.client else ""
        )
        db.add(log_entry)
        db.commit()
        
        logger.info(
            f"✓ Print formula: {recipe.recipe_code} by {current_user['user_code']} "
            f"from {request.client.host if request.client else 'unknown'}"
        )
    except Exception as e:
        logger.error(f"Error logging print action: {str(e)}")
        # Không fail request nếu log lỗi
    
    # Stream PDF file
    def iterfile():
        with open(pdf_path, mode="rb") as file_like:
            yield from file_like
    
    # Headers bảo mật chặn download UI
    headers = {
        "Content-Disposition": 'inline; filename="print_job.pdf"',
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Pragma": "no-cache",
    }
    
    return StreamingResponse(
        iterfile(),
        media_type="application/pdf",
        headers=headers
    )


@router.get("/{recipe_id}/print-logs")
def get_print_logs(
    recipe_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Xem lịch sử in của công thức - CHỈ DÀNH CHO VĂN PHÒNG
    
    Hiển thị audit trail: ai in, khi nào, từ IP nào
    """
    check_office_permission(current_user["user_role"], current_user["user_code"])
    
    recipe = db.query(FormulaRecipe).filter(FormulaRecipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Không tìm thấy công thức")
    
    logs = db.query(FormulaPrintLog).filter(
        FormulaPrintLog.recipe_id == recipe_id
    ).order_by(FormulaPrintLog.printed_at.desc()).limit(100).all()
    
    result = []
    for log in logs:
        # Lấy tên nhân viên
        emp = db.query(Employee).filter(
            Employee.employee_code == log.printed_by
        ).first()
        
        result.append({
            "id": log.id,
            "printed_by": log.printed_by,
            "printed_by_name": emp.full_name if emp else log.printed_by,
            "printed_at": log.printed_at.isoformat() if log.printed_at else "",
            "ip_address": log.ip_address,
        })
    
    return {
        "recipe": {
            "id": recipe.id,
            "recipe_code": recipe.recipe_code,
            "recipe_name": recipe.recipe_name,
        },
        "logs": result,
        "total": len(result)
    }


@router.get("/stats")
def get_statistics(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Thống kê tổng quan - DÀNH CHO VĂN PHÒNG
    
    - Tổng số công thức
    - Số công thức active/inactive
    - Số lần in trong tháng
    - Top công thức được in nhiều nhất
    """
    check_office_permission(current_user["user_role"], current_user["user_code"])
    
    total = db.query(FormulaRecipe).count()
    active = db.query(FormulaRecipe).filter(FormulaRecipe.is_active == True).count()
    inactive = total - active
    
    # Số lần in trong tháng hiện tại
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    prints_this_month = db.query(FormulaPrintLog).filter(
        FormulaPrintLog.printed_at >= month_start
    ).count()
    
    # Top 10 công thức được in nhiều nhất
    from sqlalchemy import func
    top_printed = db.query(
        FormulaRecipe.id,
        FormulaRecipe.recipe_code,
        FormulaRecipe.recipe_name,
        func.count(FormulaPrintLog.id).label('print_count')
    ).join(
        FormulaPrintLog, FormulaRecipe.id == FormulaPrintLog.recipe_id
    ).group_by(
        FormulaRecipe.id, FormulaRecipe.recipe_code, FormulaRecipe.recipe_name
    ).order_by(
        func.count(FormulaPrintLog.id).desc()
    ).limit(10).all()
    
    return {
        "total_recipes": total,
        "active_recipes": active,
        "inactive_recipes": inactive,
        "prints_this_month": prints_this_month,
        "top_printed": [
            {
                "recipe_code": item.recipe_code,
                "recipe_name": item.recipe_name,
                "print_count": item.print_count
            }
            for item in top_printed
        ]
    }
