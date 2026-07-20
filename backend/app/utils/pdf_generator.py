"""
PDF Generator Service - Di chuyển từ web_simple
Tạo phiếu lương PDF từ Excel + Template DOCX
"""
import pandas as pd
from docxtpl import DocxTemplate
from docx2pdf import convert
from PyPDF2 import PdfReader, PdfWriter
from pathlib import Path
from datetime import datetime
from dateutil.relativedelta import relativedelta
import os
import shutil
import logging
import tempfile

from .ftp_utils import upload_file_to_ftp, upload_excel_to_ftp
from config.config_manager import read_xml_info

logger = logging.getLogger(__name__)


def format_days(value):
    """Định dạng giá trị ngày"""
    try:
        if pd.isna(value):
            return ""
        whole_days = int(value)
        partial_day = round(value - whole_days, 1)
        if partial_day > 0:
            return f"{whole_days}.{partial_day*10:.0f}"
        else:
            return f"{whole_days}"
    except:
        return value


def format_date(date_value):
    """Định dạng ngày tháng"""
    return date_value.strftime("%d/%m/%Y") if pd.notna(date_value) else ""


def format_value(value, is_password=False, keep_percentage=False):
    """Định dạng giá trị"""
    if pd.notna(value):
        if is_password:
            return str(value)
        elif keep_percentage:
            return str(value)
        elif isinstance(value, (float, int)):
            return f"{value:,.0f}"
    return str(value) if value is not None else ""


def format_days_raw(value):
    """Định dạng ngày mà không làm tròn"""
    if pd.notna(value):
        if isinstance(value, (int, float)):
            return round(value, 2)
        return value
    return ""


def create_salary_context(row, current_date, previous_month, previous_year):
    """Tạo context cho phiếu lương - Copy từ web_simple"""

    def _safe(val):
        if pd.isna(val) or val is None:
            return 0.0
        try:
            return float(val)
        except (ValueError, TypeError):
            return 0.0

    income_items = [
        _safe(row.get('Tiền lương')),
        _safe(row.get('Trợ cấp tiền ăn')),
        _safe(row.get('Trợ cấp điện thoại')),
        _safe(row.get('Trợ cấp xăng xe')),
        _safe(row.get('Hiệu quả và tuân thủ')),
        _safe(row.get('Trợ cấp Phụ cấp khác')),
        _safe(row.get('Trợ cấp ca đêm')) if pd.notna(row.get('Trợ cấp ca đêm')) else 0,
        _safe(row.get('Lương tăng ca')),
        _safe(row.get('Truy lĩnh cộng')) if pd.notna(row.get('Truy lĩnh cộng')) else 0,
    ]
    total_income = sum(income_items)

    deduction_items = [
        _safe(row.get('BHXH, YT,TN (10.5%)')),
        _safe(row.get('Thuế TNCN')) if pd.notna(row.get('Thuế TNCN')) else 0,
        _safe(row.get('Đoàn phí')) if pd.notna(row.get('Đoàn phí')) else 0,
        _safe(row.get('Truy thu')) if pd.notna(row.get('Truy thu')) else 0,
    ]
    total_deduction = sum(deduction_items)

    return {
        "NAME": str(row['NAME']),
        "ID": row['ID'],
        "PASSWORD": format_value(row['PASSWORD'], is_password=True),
        "CHUCVU": row['Chức vụ'],
        "PB": row['Phòng Ban'],
        "NVL": format_date(row['Ngày vào làm']),
        "ML": format_value(row['Mức lương']),
        "MTCTA": format_value(row['Mức trợ cấp tiền ăn']),
        "MTCDT": format_value(row['Mức trợ cấp tiền điện thoại']),
        "MTCXX": format_value(row['Mức trợ cấp xăng xe']),
        "MHQTT": format_value(row['Mức hiệu quả tuân thủ']),
        "MTCPCK": format_value(row['Mức trợ cấp Phụ cấp khác']) if pd.notna(row['Mức trợ cấp Phụ cấp khác']) else "",
        "NCCTT": format_days(row['Ngày công chuẩn trong tháng']),
        "NCHL": format_days_raw(row['Ngày công hưởng lương']),
        "NCCD": format_days_raw(row['Ngày công ca đêm ']),
        "GCDC": format_days_raw(row['Giờ chờ Di chuyển']),
        "GTCNT": format_days_raw(row['Giờ tăng ca ngày thường']),
        "GTCNN": format_days_raw(row['Giờ tăng ca ngày nghỉ ']),
        "TLDGHQTT": f"{int(row['Tỷ lệ đánh giá HQ TT'] * 100)}%" if pd.notna(row['Tỷ lệ đánh giá HQ TT']) else "",
        "TL": format_value(row['Tiền lương']),
        "TCTA": format_value(row['Trợ cấp tiền ăn']),
        "TCDT": format_value(row['Trợ cấp điện thoại']),
        "TCXX": format_value(row['Trợ cấp xăng xe']),
        "HQTT": format_value(row['Hiệu quả và tuân thủ']),
        "TCPCK": format_value(row['Trợ cấp Phụ cấp khác']) if pd.notna(row['Trợ cấp Phụ cấp khác']) else "",
        "TCCD": format_value(row['Trợ cấp ca đêm']) if pd.notna(row['Trợ cấp ca đêm']) else "",
        "LTC": format_value(row['Lương tăng ca']),
        "TLC": format_value(row['Truy lĩnh cộng']) if pd.notna(row['Truy lĩnh cộng']) else "",
        "TT": format_value(row['Truy thu']) if pd.notna(row['Truy thu']) else "",
        "K": format_value(row['Khác']) if pd.notna(row['Khác']) else "",
        "BHXH": format_value(row['BHXH, YT,TN (10.5%)']),
        "TN": format_value(row['Thực nhận (A-B)']),
        "PNT": format_days_raw(row['Phép năm tồn đầu kỳ']),
        "PNPS": format_days_raw(row['Phép năm phát sinh có']),
        "PNSD": format_days_raw(row['Phép năm sử dụng']),
        "PNCK": format_days_raw(row['Phép năm tồn cuối kỳ']),
        "TLT": format_days_raw(row['Tồn đầu kỳ']),
        "TLPS": format_days_raw(row['Phát sinh có']),
        "TLSD": format_days_raw(row['Sử dụng']),
        "TLCK": format_days_raw(row['Tồn cuối kỳ']),
        "SNPT": format_value(row['Số người phụ thuộc']) if pd.notna(row['Số người phụ thuộc']) else "",
        "TTNCN": format_value(row['Thuế TNCN']),
        "DP": format_value(row['Đoàn phí']),
        "GC": str(row['Ghi Chú']) if pd.notna(row['Ghi Chú']) else "",
        "DAY": current_date.strftime('%d/%m/%Y'),
        "MONTH": str(previous_month),
        "YEAR": str(previous_year),
        "TONG_THU_NHAP": f"{total_income:,.0f}",
        "TONG_KHAU_TRU": f"{total_deduction:,.0f}",
    }


def create_bonus_context(row, current_date, previous_month, previous_year):
    """Tạo context cho phiếu thưởng - Copy từ web_simple"""
    def safe_get_column(col_name):
        available_columns = list(row.index)
        if col_name in available_columns:
            return col_name
        for col in available_columns:
            if col.replace('\n', '').strip() == col_name.replace('\n', '').strip():
                return col
        return None
    
    name_col = safe_get_column('NAME')
    id_col = safe_get_column('ID')
    password_col = safe_get_column('PASSWORD')
    pb_col = safe_get_column('Phòng ban')
    chucvu_col = safe_get_column('Chức vụ')
    nvl_col = safe_get_column('Ngày vào làm')
    ml_col = safe_get_column('Mức thu nhập tính thưởng')
    tnt_col = safe_get_column('Tổng thu nhập tháng')
    mot_col = safe_get_column('Số tháng tính thưởng')
    snpt_col = safe_get_column('Số người phụ thuộc')
    ttt_col = safe_get_column('Tiền thưởng Tết')
    tttp_col = safe_get_column('Tổng thuế TNCN')
    ktttn_col = safe_get_column('Thuế thu TNCN khấu trừ')
    tn_col = safe_get_column('Thực nhận (A-B+C)')
    gc_col = safe_get_column('Ghi Chú')
    
    return {
        "NAME": str(row[name_col]) if name_col else "",
        "ID": row[id_col] if id_col else "",
        "PASSWORD": format_value(row[password_col], is_password=True) if password_col and pd.notna(row[password_col]) else "",
        "PB": row[pb_col] if pb_col else "",
        "CHUCVU": row[chucvu_col] if chucvu_col else "",
        "NVL": format_date(row[nvl_col]) if nvl_col else "",
        "ML": format_value(row[ml_col]) if ml_col else "",
        "TNT": format_value(row[tnt_col]) if tnt_col else "",
        "MOT": row[mot_col] if mot_col else "",
        "SNPT": format_value(row[snpt_col]) if snpt_col and pd.notna(row[snpt_col]) else "",
        "TTT": format_value(row[ttt_col]) if ttt_col else "",
        "TTTN": format_value(row[tttp_col]) if tttp_col else "",
        "KTTTN": format_value(row[ktttn_col]) if ktttn_col else "",
        "TN": format_value(row[tn_col]) if tn_col else "",
        "GC": str(row[gc_col]) if gc_col and pd.notna(row[gc_col]) else "",
        "DAY": current_date.strftime('%d/%m/%Y'),
        "MONTH": str(previous_month),
        "YEAR": str(previous_year),
    }


SALARY_REQUIRED_COLUMNS = [
    'NAME', 'ID', 'Chức vụ', 'Phòng Ban', 'Ngày vào làm', 'Mức lương',
    'Mức trợ cấp tiền ăn', 'Mức trợ cấp tiền điện thoại', 'Mức trợ cấp xăng xe',
    'Mức hiệu quả tuân thủ', 'Ngày công chuẩn trong tháng', 'Ngày công hưởng lương',
    'Tiền lương', 'Trợ cấp tiền ăn', 'BHXH, YT,TN (10.5%)', 'Thực nhận (A-B)'
]

BONUS_REQUIRED_COLUMNS = [
    'NAME', 'ID', 'Phòng ban', 'Chức vụ', 'Mức thu nhập tính thưởng',
    'Tiền thưởng Tết', 'Thực nhận'
]


def validate_excel_columns(df, pdf_type: str) -> list:
    missing = []
    required = SALARY_REQUIRED_COLUMNS if pdf_type == 'salary' else BONUS_REQUIRED_COLUMNS
    for col in required:
        if col not in df.columns:
            missing.append(col)
    return missing


async def generate_salary_pdfs_from_excel(
    excel_path: str,
    template_path: str,
    output_dir: str,
    pdf_type: str = "salary",
    progress_callback=None,
    upload_to_ftp: bool = True
):
    """
    Tạo phiếu lương PDF từ Excel + Template, tự động upload lên FTP
    
    Args:
        excel_path: Đường dẫn file Excel
        template_path: Đường dẫn template DOCX
        output_dir: Thư mục output
        pdf_type: "salary" hoặc "bonus"
        progress_callback: Hàm callback để báo tiến trình
        upload_to_ftp: Tự động upload PDFs lên FTP2 sau khi tạo
        
    Returns:
        dict: {
            "success": bool,
            "total_files": int,
            "pdf_files": [(pdf_path, employee_code), ...],
            "errors": [str, ...],
            "ftp_uploaded": bool
        }
    """
    try:
        # Đọc Excel
        df = pd.read_excel(excel_path, engine='openpyxl')
        total_rows = len(df)
        logger.info(f"Đọc Excel: {total_rows} dòng, columns: {list(df.columns)}")
        
        # Validate columns
        missing = validate_excel_columns(df, pdf_type)
        if missing:
            error_msg = f"File Excel thiếu các cột: {', '.join(missing)}"
            logger.error(error_msg)
            if progress_callback:
                await progress_callback({
                    "progress": 0,
                    "message": error_msg,
                    "status": "failed"
                })
            return {
                "success": False,
                "error": error_msg,
                "total_files": 0,
                "pdf_files": [],
                "errors": [error_msg],
                "ftp_uploaded": False
            }
        
        if progress_callback:
            await progress_callback({
                "progress": 10,
                "message": f"Đã đọc Excel: {total_rows} nhân viên",
                "total": total_rows
            })
        
        # Tạo thư mục output
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        # Lấy thông tin tháng
        current_date = datetime.now()
        previous_month_date = current_date - relativedelta(months=1)
        previous_month = previous_month_date.month
        previous_year = previous_month_date.year
        
        pdf_files = []
        errors = []
        
        # Xử lý từng dòng
        for index, row in df.iterrows():
            try:
                # Tạo context dựa vào loại phiếu
                if pdf_type == "salary":
                    context = create_salary_context(row, current_date, previous_month, previous_year)
                    filename = f"Lương_T{previous_month}_{previous_year}_{str(row['NAME'])}.pdf"
                else:  # bonus
                    context = create_bonus_context(row, current_date, previous_month, previous_year)
                    filename = f"Thưởng_Tết_{str(row['NAME'])}.pdf"
                
                # Tạo thư mục nhân viên
                staff_name = str(row['NAME'])
                staff_folder = output_path / staff_name
                staff_folder.mkdir(exist_ok=True)
                
                # Generate PDF
                temp_docx = staff_folder / "temp.docx"
                pdf_path = staff_folder / filename
                
                # Render template
                doc = DocxTemplate(template_path)
                doc.render(context)
                doc.save(str(temp_docx))
                
                # Convert to PDF
                convert(str(temp_docx), str(pdf_path))
                
                # Encrypt với password nếu có
                if 'PASSWORD' in row and not pd.isnull(row['PASSWORD']):
                    password = str(row['PASSWORD'])
                    pdf_writer = PdfWriter()
                    pdf_reader = PdfReader(str(pdf_path))
                    
                    for page_num in range(len(pdf_reader.pages)):
                        pdf_writer.add_page(pdf_reader.pages[page_num])
                    
                    pdf_writer.encrypt(password)
                    
                    with open(str(pdf_path), 'wb') as encrypted_pdf:
                        pdf_writer.write(encrypted_pdf)
                
                # Xóa file docx tạm
                if temp_docx.exists():
                    temp_docx.unlink()
                
                # Lưu thông tin file PDF
                pdf_files.append((str(pdf_path), staff_name))
                
                # Báo tiến trình
                progress = 10 + int((index + 1) * 80 / total_rows)
                if progress_callback:
                    await progress_callback({
                        "progress": progress,
                        "message": f"Đã tạo: {staff_name}",
                        "completed": index + 1,
                        "total": total_rows
                    })
                
                logger.info(f"Đã tạo PDF {index+1}/{total_rows}: {filename}")
                
            except Exception as e:
                error_msg = f"Lỗi dòng {index + 2} ({row.get('NAME', 'Unknown')}): {str(e)}"
                logger.error(error_msg)
                errors.append(error_msg)
                continue
        
        # Tạo file ZIP
        if progress_callback:
            await progress_callback({
                "progress": 95,
                "message": "Đang tạo file ZIP..."
            })
        
        zip_path = output_path.parent / f"{pdf_type}_pdfs"
        shutil.make_archive(str(zip_path), 'zip', output_path)
        
        result = {
            "success": True,
            "total_files": len(pdf_files),
            "pdf_files": pdf_files,
            "errors": errors,
            "zip_path": f"{zip_path}.zip",
            "month": f"{previous_month}/{previous_year}",
            "ftp_uploaded": False
        }
        
        # Auto upload lên FTP2 nếu được yêu cầu
        ftp_uploaded = False
        if upload_to_ftp and pdf_files:
            if progress_callback:
                await progress_callback({
                    "progress": 96,
                    "message": "Đang upload lên FTP..."
                })
            try:
                config_info, _ = read_xml_info()
                if config_info:
                    upload_file_to_ftp(pdf_files, config_info)
                    ftp_uploaded = True
                    result["ftp_uploaded"] = True
                    logger.info(f"✅ Uploaded {len(pdf_files)} PDFs lên FTP")
                else:
                    logger.warning("Không có cấu hình FTP, bỏ qua upload")
            except Exception as e:
                error_msg = f"FTP upload failed: {str(e)}"
                logger.error(error_msg)
                errors.append(error_msg)
        
        if progress_callback:
            msg = f"✅ Hoàn tất! Đã tạo {len(pdf_files)} phiếu lương"
            if ftp_uploaded:
                msg += " + đã upload lên FTP"
            await progress_callback({
                "progress": 100,
                "message": msg,
                "completed": len(pdf_files),
                "total": total_rows,
                "ftp_uploaded": ftp_uploaded
            })
        
        logger.info(f"✅ Hoàn tất: {len(pdf_files)} PDFs, {len(errors)} lỗi, FTP: {ftp_uploaded}")
        return result
        
    except Exception as e:
        logger.error(f"Lỗi generate PDF: {str(e)}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "total_files": 0,
            "pdf_files": [],
            "errors": [str(e)],
            "ftp_uploaded": False
        }


def generate_single_pdf_from_json(salary_context: dict, template_path: str, output_path: str, password: str = ""):
    """
    Generate a single salary slip PDF from a salary context dict (JSON).
    Renders DOCX template, converts to PDF, and optionally encrypts with password.
    """
    temp_docx = None
    try:
        doc = DocxTemplate(template_path)
        doc.render(salary_context)

        temp_docx = output_path + '.docx'
        doc.save(temp_docx)

        convert(temp_docx, output_path)

        if password:
            pdf_writer = PdfWriter()
            pdf_reader = PdfReader(output_path)
            for page in pdf_reader.pages:
                pdf_writer.add_page(page)
            pdf_writer.encrypt(password)
            with open(output_path, 'wb') as f:
                pdf_writer.write(f)

        logger.info(f"PDF generated: {output_path}")
        return output_path

    except Exception as e:
        logger.error(f"PDF generation error: {str(e)}", exc_info=True)
        raise
    finally:
        if temp_docx and os.path.exists(temp_docx):
            try:
                os.unlink(temp_docx)
            except Exception:
                pass
