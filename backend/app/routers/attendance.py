"""Module "Chấm công Zalo & WhatsApp" (key: attendance).

Dashboard tổng hợp dữ liệu bot ghi nhận từ HAI module nguồn — wa_records
(WhatsApp, Hermes) và zalo_records (Zalo, zalo-personal-bot) — trình bày
dạng CHẤM CÔNG: mỗi dòng tổng hợp là một nhân viên × một ngày × một group,
kèm sự kiện đầu/cuối ngày và mốc check-in/check-out rõ ràng (nếu có).

- Nguồn sự kiện chấm công: record_type checkin / checkout / vitri (tin chia
  sẻ vị trí phía Zalo). Các loại khác (datlich, baocao, thongbao) chỉ xuất
  hiện ở view chi tiết sự kiện, không tính vào tổng hợp chấm công.
- QUY TẮC GIỜ IN / OUT (chủ hệ thống chốt 2026-11-20, bản LƯỢT GHÉ): tín
  hiệu được gộp theo LƯỢT GHÉ cửa hàng — cùng user/group/ngày, hai tín hiệu
  liên tiếp cách nhau dưới 45 phút là cùng một lượt (một lượt thường gồm
  vị trí + check-in ghi tên cửa hàng lúc đến, check-out + vị trí lúc rời).
  Giờ IN = tín hiệu ĐẦU lượt (vị trí 1); giờ OUT = tín hiệu CUỐI lượt
  (vị trí 2). Tên cửa hàng của lượt bổ sung/sửa được về sau qua bảng
  attendance_visit_notes (gắn theo bản ghi đầu lượt).
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
import re
import unicodedata
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from fastapi.responses import StreamingResponse

from ..core.auth import verify_session
from ..core.db import execute, fetchall, fetchone
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
           lat::float8 AS lat, lng::float8 AS lng, status,
           COALESCE(msg_at, created_at) AS created_at
    FROM zalo_records
    UNION ALL
    SELECT 'whatsapp' AS src, id, record_type, sender_name,
           COALESCE(NULLIF(sender_phone, ''), sender_name) AS sender_key,
           group_name, title, content, place,
           lat::float8 AS lat, lng::float8 AS lng, status,
           COALESCE(msg_at, created_at) AS created_at
    FROM wa_records
"""

_EVENT_COLS = """
    u.src, u.id, u.record_type, u.sender_name, u.sender_key, u.group_name,
    u.title, u.content, u.place, u.lat, u.lng, u.status, u.created_at,
    e.employee_code AS employee_code, e.full_name AS employee_name,
    e.department AS employee_department
"""

# Ánh xạ danh tính: (src, sender_key) -> employees.employee_code qua bảng
# attendance_identities (trường dữ liệu chuẩn của nhân viên trong group).
_JOINS = """
    LEFT JOIN attendance_identities ai
      ON ai.source = u.src AND ai.sender_key = u.sender_key
    LEFT JOIN employees e ON e.employee_code = ai.employee_code
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
        clauses.append("u.src = :source")
        params["source"] = source
    group_name = (group_name or "").strip()
    if group_name:
        clauses.append("u.group_name = :group_name")
        params["group_name"] = group_name
    q = (q or "").strip()
    if q:
        clauses.append(
            "(u.sender_name ILIKE :q OR u.title ILIKE :q OR u.content ILIKE :q "
            "OR u.place ILIKE :q OR e.full_name ILIKE :q OR e.employee_code ILIKE :q)"
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
        clauses.append(f"u.record_type IN ({', '.join(placeholders)})")
    d_from = _parse_day(date_from, "date_from")
    d_to = _parse_day(date_to, "date_to")
    if d_from:
        clauses.append("(u.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= :date_from")
        params["date_from"] = d_from
    if d_to:
        clauses.append("(u.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= :date_to")
        params["date_to"] = d_to
    where = " AND ".join(clauses) if clauses else "1=1"
    return where, params


def _fetch_events(where: str, params: dict, limit: int, offset: int):
    return fetchall(
        f"SELECT {_EVENT_COLS} FROM ({_UNION}) u {_JOINS} WHERE {where} "
        "ORDER BY u.created_at DESC LIMIT :limit OFFSET :offset",
        {**params, "limit": limit, "offset": offset},
    )


VISIT_GAP_MINUTES = 45


def _fetch_visits(where: str, params: dict):
    """Gộp tín hiệu chấm công thành từng LƯỢT GHÉ (một box = một lượt ghé
    cửa hàng): cùng người, cùng group, cùng ngày; hai tín hiệu liên tiếp
    cách nhau dưới VISIT_GAP_MINUTES phút thì cùng một lượt. Tên cửa hàng
    hiển thị = tên đã sửa tay (attendance_visit_notes) nếu có, không thì
    tên trích từ tin check-in/check-out trong lượt."""
    summary_where = (
        f"({where}) AND u.record_type IN ('checkin', 'checkout', 'vitri') "
        "AND u.status <> 'huy'"
    )
    signals = fetchall(
        f"""
        SELECT u.id, (u.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
               u.src, u.group_name, u.sender_key, u.sender_name,
               e.employee_code AS employee_code,
               e.full_name AS employee_name,
               e.department AS employee_department,
               u.record_type, u.place, u.lat, u.lng, u.created_at
        FROM ({_UNION}) u {_JOINS}
        WHERE {summary_where}
        ORDER BY day ASC, u.src, u.group_name, u.sender_key, u.created_at ASC
        """,
        params,
    )
    overrides = {
        (o["source"], o["record_id"]): o["place"]
        for o in fetchall(
            "SELECT source, record_id, place FROM attendance_visit_notes", {}
        )
    }
    visits = []
    counters = {}
    current = None
    for sig in signals:
        key = (sig["day"], sig["src"], sig["group_name"], sig["sender_key"])
        new_visit = current is None or current["_key"] != key
        if not new_visit:
            gap_min = (sig["created_at"] - current["_last_signal"]).total_seconds() / 60.0
            new_visit = gap_min > VISIT_GAP_MINUTES
        if new_visit:
            counters[key] = counters.get(key, 0) + 1
            current = {
                "_key": key, "_last_signal": sig["created_at"],
                "first_record_id": sig["id"],
                "day": sig["day"], "src": sig["src"],
                "group_name": sig["group_name"], "sender_key": sig["sender_key"],
                "sender_name": sig["sender_name"],
                "employee_code": sig["employee_code"],
                "employee_name": sig["employee_name"],
                "employee_department": sig["employee_department"],
                "visit_no": counters[key],
                "first_at": sig["created_at"], "last_at": sig["created_at"],
                "first_type": sig["record_type"], "last_type": sig["record_type"],
                "events": 0, "checkins": 0, "checkouts": 0, "vitris": 0,
                "_places": [], "lat": None, "lng": None,
            }
            visits.append(current)
        current["_last_signal"] = sig["created_at"]
        current["last_at"] = sig["created_at"]
        current["last_type"] = sig["record_type"]
        current["events"] += 1
        if sig["record_type"] == "checkin":
            current["checkins"] += 1
        elif sig["record_type"] == "checkout":
            current["checkouts"] += 1
        elif sig["record_type"] == "vitri":
            current["vitris"] += 1
            if current["lat"] is None and sig["lat"] is not None:
                current["lat"], current["lng"] = sig["lat"], sig["lng"]
        place = (sig["place"] or "").strip()
        if place and place not in current["_places"]:
            current["_places"].append(place)
    totals = {}
    for v in visits:
        totals[v["_key"]] = totals.get(v["_key"], 0) + 1
    for v in visits:
        v["visit_total"] = totals[v["_key"]]
        v["duration_minutes"] = int(
            (v["last_at"] - v["first_at"]).total_seconds() // 60
        )
        override = overrides.get((v["src"], v["first_record_id"]))
        v["place_edited"] = override is not None
        v["places"] = override if override is not None else ("; ".join(v["_places"]) or None)
        del v["_key"], v["_last_signal"], v["_places"]
    visits.sort(key=lambda v: (str(v["day"]), v["group_name"], v["sender_name"], v["first_at"]))
    visits.sort(key=lambda v: str(v["day"]), reverse=True)
    return visits


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
        f"SELECT COUNT(*) AS total FROM ({_UNION}) u {_JOINS} WHERE {where}", params
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
    visits = _fetch_visits(where, params)
    total = len(visits)
    start = (page - 1) * page_size
    return {
        "data": visits[start:start + page_size],
        "total": total, "page": page, "page_size": page_size,
    }


# ---------------------------------------------------------------------------
# Ánh xạ danh tính: (nguồn, sender_key) -> mã nhân viên (employees)
# ---------------------------------------------------------------------------

def _norm_name(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").lower().strip())


def _unaccent(value: str) -> str:
    text = unicodedata.normalize("NFD", value or "")
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return text.replace("đ", "d").replace("Đ", "D").lower().strip()


def _suggestions(sender_name: str, emps: list) -> list:
    sn, su = _norm_name(sender_name), _unaccent(sender_name)
    exact, fuzzy = [], []
    for e in emps:
        en, eu = _norm_name(e["full_name"]), _unaccent(e["full_name"])
        item = {
            "employee_code": e["employee_code"],
            "full_name": e["full_name"],
            "department": e["department"],
        }
        if en == sn or eu == su:
            exact.append({**item, "match": "exact"})
        elif (
            en.endswith(" " + sn) or eu.endswith(" " + su)
            or en.split(" ")[-1] == sn or eu.split(" ")[-1] == su
        ):
            fuzzy.append({**item, "match": "fuzzy"})
    return (exact + fuzzy)[:5]


@router.get("/identities")
def list_identities(
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    _auth(x_user_code, x_user_role, x_user_dept, x_user_token)
    senders = fetchall(
        f"""
        SELECT src, sender_key, MAX(sender_name) AS sender_name,
               STRING_AGG(DISTINCT group_name, '; ') AS groups,
               COUNT(*) AS records
        FROM ({_UNION}) u
        GROUP BY src, sender_key
        ORDER BY sender_name
        """,
        {},
    )
    mappings = {
        (m["source"], m["sender_key"]): m
        for m in fetchall(
            "SELECT source, sender_key, employee_code, origin FROM attendance_identities",
            {},
        )
    }
    emps = fetchall(
        "SELECT employee_code, full_name, department FROM employees ORDER BY full_name",
        {},
    )
    emp_by_code = {e["employee_code"]: e for e in emps}
    out = []
    for row in senders:
        m = mappings.get((row["src"], row["sender_key"]))
        code = m["employee_code"] if m else None
        emp = emp_by_code.get(code) if code else None
        out.append({
            **row,
            "employee_code": code,
            "origin": m["origin"] if m else None,
            "employee_name": emp["full_name"] if emp else None,
            "employee_department": emp["department"] if emp else None,
            "suggestions": [] if code else _suggestions(row["sender_name"], emps),
        })
    return {"data": out, "employees": emps}


class IdentityUpdate(BaseModel):
    source: str
    sender_key: str
    employee_code: Optional[str] = None


@router.put("/identities")
def update_identity(
    body: IdentityUpdate,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    user = _auth(x_user_code, x_user_role, x_user_dept, x_user_token)
    if user["user_role"] != "admin":
        perms = _get_effective_permissions(user["user_code"])
        if not (perms.get("attendance") or {}).get("can_edit"):
            raise HTTPException(403, "Bạn không có quyền gán mã nhân viên")
    if body.source not in ("zalo", "whatsapp"):
        raise HTTPException(400, "source phải là zalo hoặc whatsapp")
    code = (body.employee_code or "").strip()
    if code:
        emp = fetchone(
            "SELECT employee_code FROM employees WHERE employee_code = :c",
            {"c": code},
        )
        if not emp:
            raise HTTPException(400, "Mã nhân viên không tồn tại trong bảng nhân viên")
        execute(
            """
            INSERT INTO attendance_identities
                (source, sender_key, employee_code, origin, updated_by, updated_at)
            VALUES (:src, :sk, :code, 'manual', :by, now())
            ON CONFLICT (source, sender_key) DO UPDATE SET
                employee_code = EXCLUDED.employee_code,
                origin = 'manual',
                updated_by = EXCLUDED.updated_by,
                updated_at = now()
            """,
            {"src": body.source, "sk": body.sender_key, "code": code, "by": user["user_code"]},
        )
    else:
        execute(
            "DELETE FROM attendance_identities WHERE source = :src AND sender_key = :sk",
            {"src": body.source, "sk": body.sender_key},
        )
    return {"success": True}


# ---------------------------------------------------------------------------
# Tên cửa hàng của lượt ghé: bổ sung / sửa tay (attendance_visit_notes)
# ---------------------------------------------------------------------------

class VisitPlaceUpdate(BaseModel):
    source: str
    record_id: int
    place: Optional[str] = None


@router.put("/visit-place")
def update_visit_place(
    body: VisitPlaceUpdate,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    user = _auth(x_user_code, x_user_role, x_user_dept, x_user_token)
    if user["user_role"] != "admin":
        perms = _get_effective_permissions(user["user_code"])
        if not (perms.get("attendance") or {}).get("can_edit"):
            raise HTTPException(403, "Bạn không có quyền sửa tên cửa hàng")
    if body.source not in ("zalo", "whatsapp"):
        raise HTTPException(400, "source phải là zalo hoặc whatsapp")
    place = (body.place or "").strip()
    if place:
        execute(
            """
            INSERT INTO attendance_visit_notes (source, record_id, place, updated_by, updated_at)
            VALUES (:src, :rid, :place, :by, now())
            ON CONFLICT (source, record_id) DO UPDATE SET
                place = EXCLUDED.place,
                updated_by = EXCLUDED.updated_by,
                updated_at = now()
            """,
            {"src": body.source, "rid": body.record_id, "place": place, "by": user["user_code"]},
        )
    else:
        execute(
            "DELETE FROM attendance_visit_notes WHERE source = :src AND record_id = :rid",
            {"src": body.source, "rid": body.record_id},
        )
    return {"success": True}


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
    summary_rows = _fetch_visits(where, params)
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
        "Ngày", "Nhân viên", "Mã NV", "Giờ IN", "Loại IN",
        "Giờ OUT", "Loại OUT", "Thời gian (giờ:phút)",
        "Số tin (check-in/check-out/vị trí)", "Địa điểm",
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
        dur = row.get("duration_minutes")
        dur_text = f"{int(dur) // 60}:{int(dur) % 60:02d}" if dur is not None else ""
        values = [
            row["day"].strftime("%d/%m/%Y") if row.get("day") else "",
            row.get("employee_name") or row["sender_name"],
            row.get("employee_code") or "",
            first_vn.strftime("%H:%M") if first_vn else "",
            first_type,
            last_vn.strftime("%H:%M") if last_vn else "",
            last_type,
            dur_text,
            f"{row['events']} ({row['checkins']}/{row['checkouts']}/{row['vitris']})",
            row.get("places") or "",
        ]
        for i, v in enumerate(values, start=1):
            cell = ws.cell(row=r, column=i, value=v)
            cell.border = thin_border
        r += 1
    for col, w in zip("ABCDEFGHIJ", [12, 24, 10, 10, 11, 10, 11, 14, 17, 34]):
        ws.column_dimensions[col].width = w

    # ── Sheet 2: Chi tiết sự kiện ──
    ws2 = wb.create_sheet("SuKien")
    ws2.sheet_properties.tabColor = "70AD47"
    ws2.merge_cells("A1:H1")
    ws2["A1"] = "CHI TIẾT SỰ KIỆN — ZALO & WHATSAPP"
    ws2["A1"].font = title_font
    ws2.merge_cells("A2:H2")
    ws2["A2"] = f"{scope} | Ngày xuất: {exported_at}"
    ws2["A2"].font = sub_font
    headers2 = [
        "Thời gian", "Nhân viên", "Mã NV", "Loại",
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
            row.get("employee_name") or row["sender_name"],
            row.get("employee_code") or "",
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
    for col, w in zip("ABCDEFGH", [17, 24, 10, 12, 52, 30, 24, 11]):
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
