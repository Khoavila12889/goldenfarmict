"""Module "Chấm công Zalo & WhatsApp" (key: attendance).

Dashboard tổng hợp dữ liệu bot ghi nhận từ HAI module nguồn — wa_records
(WhatsApp, Hermes) và zalo_records (Zalo, zalo-personal-bot) — trình bày
dạng CHẤM CÔNG: mỗi dòng tổng hợp là một nhân viên × một ngày × một group,
kèm sự kiện đầu/cuối ngày và mốc check-in/check-out rõ ràng (nếu có).

- Nguồn sự kiện chấm công: record_type checkin / checkout / vitri (tin chia
  sẻ vị trí phía Zalo). Các loại khác (datlich, baocao, thongbao) chỉ xuất
  hiện ở view chi tiết sự kiện, không tính vào tổng hợp chấm công.
- Ngày chấm công tính theo Asia/Ho_Chi_Minh từ created_at.
- Bản ghi status='huy' bị loại khỏi tổng hợp và file xuất (vẫn xem được ở
  chi tiết sự kiện).
- Quyền: admin luôn xem được; vai trò khác cần quyền module "attendance"
  (can_view/can_edit) qua trang Phân quyền — cùng khuôn wa/zalo-records.
- Xuất .xlsx: GET /api/attendance/export.xlsx theo ĐÚNG bộ lọc đang chọn,
  2 sheet "ChamCong" (tổng hợp) + "SuKien" (chi tiết), style openpyxl như
  export của module Công việc (todos).
"""
import io
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse

from ..core.auth import verify_session
from ..core.db import fetchall, fetchone
from .auth import _get_effective_permissions

router = APIRouter(prefix="/api/attendance", tags=["attendance"])

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
ATTEND_TYPES = ("checkin", "checkout", "vitri")
ALL_TYPES = ("datlich", "checkin", "baocao", "checkout", "thongbao", "vitri")
MAX_PAGE_SIZE = 100
EXPORT_LIMIT = 10000

_UNION = """
    SELECT 'zalo' AS src, id, record_type, sender_name, sender_id AS sender_key,
           group_name, title, content, place,
           lat::float8 AS lat, lng::float8 AS lng, status, created_at
    FROM zalo_records
    UNION ALL
    SELECT 'whatsapp' AS src, id, record_type, sender_name,
           COALESCE(NULLIF(sender_phone, ''), sender_name) AS sender_key,
           group_name, title, content, place,
           lat::float8 AS lat, lng::float8 AS lng, status, created_at
    FROM wa_records
"""

_EVENT_COLS = """
    src, id, record_type, sender_name, sender_key, group_name, title,
    content, place, lat, lng, status, created_at
"""


# ---------------------------------------------------------------------------
# Xác thực — cùng khuôn zalo_records
# ---------------------------------------------------------------------------

def _require_attendance_user(
    x_user_code: Optional[str],
    x_user_role: Optional[str],
    x_user_dept: Optional[str],
    x_user_token: Optional[str],
) -> dict:
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    if user["user_role"] == "admin":
        return user
    perms = _get_effective_permissions(user["user_code"])
    perm = perms.get("attendance") or {}
    if not (perm.get("can_view") or perm.get("can_edit")):
        raise HTTPException(403, "Bạn không có quyền truy cập module Chấm công")
    return user


def _auth(
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
) -> dict:
    return _require_attendance_user(x_user_code, x_user_role, x_user_dept, x_user_token)


# ---------------------------------------------------------------------------
# Bộ lọc dùng chung
# ---------------------------------------------------------------------------

def _parse_day(value: str, field: str):
    value = (value or "").strip()
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, f"{field} phải dạng YYYY-MM-DD")


def _build_filters(source: str, group_name: str, q: str, types: str,
                   date_from: str, date_to: str):
    clauses = []
    params: dict = {}
    source = (source or "").strip()
    if source:
        if source not in ("zalo", "whatsapp"):
            raise HTTPException(400, "source phải là zalo hoặc whatsapp")
        clauses.append("src = :source")
        params["source"] = source
    group_name = (group_name or "").strip()
    if group_name:
        clauses.append("group_name = :group_name")
        params["group_name"] = group_name
    q = (q or "").strip()
    if q:
        clauses.append(
            "(sender_name ILIKE :q OR title ILIKE :q OR content ILIKE :q OR place ILIKE :q)"
        )
        params["q"] = f"%{q}%"
    type_list = [t.strip() for t in (types or "").split(",") if t.strip()]
    for t in type_list:
        if t not in ALL_TYPES:
            raise HTTPException(400, f"record_type không hợp lệ: {t}")
    if type_list:
        placeholders = []
        for i, t in enumerate(type_list):
            key = f"type_{i}"
            placeholders.append(f":{key}")
            params[key] = t
        clauses.append(f"record_type IN ({', '.join(placeholders)})")
    d_from = _parse_day(date_from, "date_from")
    d_to = _parse_day(date_to, "date_to")
    if d_from:
        clauses.append("(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= :date_from")
        params["date_from"] = d_from
    if d_to:
        clauses.append("(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= :date_to")
        params["date_to"] = d_to
    where = " AND ".join(clauses) if clauses else "1=1"
    return where, params


def _fetch_events(where: str, params: dict, limit: int, offset: int):
    return fetchall(
        f"SELECT {_EVENT_COLS} FROM ({_UNION}) u WHERE {where} "
        "ORDER BY created_at DESC LIMIT :limit OFFSET :offset",
        {**params, "limit": limit, "offset": offset},
    )


def _fetch_summary(where: str, params: dict, limit: int, offset: int):
    summary_where = (
        f"({where}) AND record_type IN ('checkin', 'checkout', 'vitri') "
        "AND status <> 'huy'"
    )
    return fetchall(
        f"""
        SELECT (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
               src, group_name, sender_key,
               MAX(sender_name) AS sender_name,
               MIN(created_at) AS first_at,
               MAX(created_at) AS last_at,
               (ARRAY_AGG(record_type ORDER BY created_at ASC))[1] AS first_type,
               (ARRAY_AGG(record_type ORDER BY created_at DESC))[1] AS last_type,
               COUNT(*) AS events,
               COUNT(*) FILTER (WHERE record_type = 'checkin') AS checkins,
               COUNT(*) FILTER (WHERE record_type = 'checkout') AS checkouts,
               COUNT(*) FILTER (WHERE record_type = 'vitri') AS vitris,
               MIN(created_at) FILTER (WHERE record_type = 'checkin') AS checkin_at,
               MAX(created_at) FILTER (WHERE record_type = 'checkout') AS checkout_at,
               STRING_AGG(DISTINCT NULLIF(place, ''), '; ') AS places
        FROM ({_UNION}) u
        WHERE {summary_where}
        GROUP BY day, src, group_name, sender_key
        ORDER BY day DESC, group_name ASC, sender_name ASC
        LIMIT :limit OFFSET :offset
        """,
        {**params, "limit": limit, "offset": offset},
    )


def _summary_total(where: str, params: dict) -> int:
    summary_where = (
        f"({where}) AND record_type IN ('checkin', 'checkout', 'vitri') "
        "AND status <> 'huy'"
    )
    row = fetchone(
        f"""
        SELECT COUNT(*) AS total FROM (
            SELECT 1 FROM ({_UNION}) u WHERE {summary_where}
            GROUP BY (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
                     src, group_name, sender_key
        ) g
        """,
        params,
    )
    return int((row or {}).get("total", 0))


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/groups")
def list_groups(
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    _auth(x_user_code, x_user_role, x_user_dept, x_user_token)
    rows = fetchall(
        f"SELECT src, group_name, COUNT(*) AS records FROM ({_UNION}) u "
        "GROUP BY src, group_name ORDER BY src ASC, group_name ASC",
        {},
    )
    return {"data": rows}


@router.get("/events")
def list_events(
    source: str = "",
    group_name: str = "",
    q: str = "",
    types: str = "",
    date_from: str = "",
    date_to: str = "",
    page: int = 1,
    page_size: int = 20,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    _auth(x_user_code, x_user_role, x_user_dept, x_user_token)
    page = max(1, page)
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))
    where, params = _build_filters(source, group_name, q, types, date_from, date_to)
    total_row = fetchone(
        f"SELECT COUNT(*) AS total FROM ({_UNION}) u WHERE {where}", params
    )
    total = int((total_row or {}).get("total", 0))
    rows = _fetch_events(where, params, page_size, (page - 1) * page_size)
    return {"data": rows, "total": total, "page": page, "page_size": page_size}


@router.get("/summary")
def list_summary(
    source: str = "",
    group_name: str = "",
    q: str = "",
    date_from: str = "",
    date_to: str = "",
    page: int = 1,
    page_size: int = 20,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    _auth(x_user_code, x_user_role, x_user_dept, x_user_token)
    page = max(1, page)
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))
    where, params = _build_filters(source, group_name, q, "", date_from, date_to)
    total = _summary_total(where, params)
    rows = _fetch_summary(where, params, page_size, (page - 1) * page_size)
    return {"data": rows, "total": total, "page": page, "page_size": page_size}


# ---------------------------------------------------------------------------
# Xuất Excel — cùng bộ lọc, 2 sheet: tổng hợp chấm công + chi tiết sự kiện
# ---------------------------------------------------------------------------

def _vn(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    return dt.astimezone(VN_TZ)


@router.get("/export.xlsx")
def export_xlsx(
    source: str = "",
    group_name: str = "",
    q: str = "",
    types: str = "",
    date_from: str = "",
    date_to: str = "",
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    _auth(x_user_code, x_user_role, x_user_dept, x_user_token)
    where, params = _build_filters(source, group_name, q, types, date_from, date_to)
    summary_rows = _fetch_summary(where, params, EXPORT_LIMIT, 0)
    event_rows = _fetch_events(where, params, EXPORT_LIMIT, 0)

    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

    title_font = Font(name="Calibri", size=14, bold=True, color="1F4E79")
    sub_font = Font(name="Calibri", size=10, italic=True, color="666666")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    thin_border = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"), bottom=Side(style="thin"),
    )

    def style_header(ws, row, ncols):
        for c in range(1, ncols + 1):
            cell = ws.cell(row=row, column=c)
            cell.font = header_font
            cell.fill = header_fill
            cell.border = thin_border
            cell.alignment = Alignment(horizontal="center", vertical="center")

    scope_parts = [f"Group: {group_name}" if group_name else "Tất cả group"]
    if date_from or date_to:
        scope_parts.append(f"Từ {date_from or '...'} đến {date_to or '...'}")
    scope = " | ".join(scope_parts)
    exported_at = datetime.now(VN_TZ).strftime("%d/%m/%Y %H:%M")

    wb = Workbook()

    # ── Sheet 1: Tổng hợp chấm công ──
    ws = wb.active
    ws.title = "ChamCong"
    ws.sheet_properties.tabColor = "4472C4"
    ws.merge_cells("A1:J1")
    ws["A1"] = "THỐNG KÊ CHẤM CÔNG — ZALO & WHATSAPP"
    ws["A1"].font = title_font
    ws.merge_cells("A2:J2")
    ws["A2"] = f"{scope} | Ngày xuất: {exported_at}"
    ws["A2"].font = sub_font
    headers = [
        "Ngày", "Nhân viên", "Sự kiện đầu", "Loại đầu",
        "Sự kiện cuối", "Loại cuối", "Check-in đầu tiên", "Check-out cuối",
        "Số sự kiện (CI/CO/Vị trí)", "Địa điểm",
    ]
    for i, h in enumerate(headers, start=1):
        ws.cell(row=4, column=i, value=h)
    style_header(ws, 4, len(headers))
    type_label = {"checkin": "Check-in", "checkout": "Check-out", "vitri": "Vị trí"}
    r = 5
    for row in summary_rows:
        first_vn = _vn(row["first_at"])
        last_vn = _vn(row["last_at"])
        first_type = type_label.get(row.get("first_type"), "")
        last_type = type_label.get(row.get("last_type"), "")
        values = [
            row["day"].strftime("%d/%m/%Y") if row.get("day") else "",
            row["sender_name"],
            first_vn.strftime("%H:%M") if first_vn else "",
            first_type,
            last_vn.strftime("%H:%M") if last_vn else "",
            last_type,
            _vn(row["checkin_at"]).strftime("%H:%M") if row.get("checkin_at") else "",
            _vn(row["checkout_at"]).strftime("%H:%M") if row.get("checkout_at") else "",
            f"{row['events']} ({row['checkins']}/{row['checkouts']}/{row['vitris']})",
            row.get("places") or "",
        ]
        for i, v in enumerate(values, start=1):
            cell = ws.cell(row=r, column=i, value=v)
            cell.border = thin_border
        r += 1
    for col, w in zip("ABCDEFGHIJ", [12, 24, 11, 11, 11, 11, 13, 12, 17, 34]):
        ws.column_dimensions[col].width = w

    # ── Sheet 2: Chi tiết sự kiện ──
    ws2 = wb.create_sheet("SuKien")
    ws2.sheet_properties.tabColor = "70AD47"
    ws2.merge_cells("A1:G1")
    ws2["A1"] = "CHI TIẾT SỰ KIỆN — ZALO & WHATSAPP"
    ws2["A1"].font = title_font
    ws2.merge_cells("A2:G2")
    ws2["A2"] = f"{scope} | Ngày xuất: {exported_at}"
    ws2["A2"].font = sub_font
    headers2 = [
        "Thời gian", "Nhân viên", "Loại",
        "Tiêu đề / Nội dung", "Địa điểm", "Toạ độ", "Trạng thái",
    ]
    for i, h in enumerate(headers2, start=1):
        ws2.cell(row=4, column=i, value=h)
    style_header(ws2, 4, len(headers2))
    all_type_label = {
        "datlich": "Đặt lịch", "checkin": "Check-in", "baocao": "Báo cáo",
        "checkout": "Check-out", "thongbao": "Thông báo", "vitri": "Vị trí",
    }
    status_label = {"moi": "Mới", "daxuly": "Đã xử lý", "huy": "Đã hủy"}
    r = 5
    for row in event_rows:
        at = _vn(row["created_at"])
        coords = ""
        if row.get("lat") is not None and row.get("lng") is not None:
            coords = f"{row['lat']}, {row['lng']}"
        content = row.get("title") or row.get("content") or ""
        values = [
            at.strftime("%d/%m/%Y %H:%M") if at else "",
            row["sender_name"],
            all_type_label.get(row["record_type"], row["record_type"]),
            content,
            row.get("place") or "",
            coords,
            status_label.get(row["status"], row["status"]),
        ]
        for i, v in enumerate(values, start=1):
            cell = ws2.cell(row=r, column=i, value=v)
            cell.border = thin_border
        r += 1
    for col, w in zip("ABCDEFG", [17, 24, 12, 52, 30, 24, 11]):
        ws2.column_dimensions[col].width = w

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"cham-cong-{date_from or 'all'}-{date_to or 'now'}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{fname}"',
            "Content-Length": str(buf.getbuffer().nbytes),
        },
    )
