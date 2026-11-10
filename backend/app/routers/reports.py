"""Module Báo cáo cho GOLDENFARM ICT — mỗi module một trang báo cáo.

Envelope chung: {key, title, period, scope, kpis[], chart{}, charts[], actions{}, details{}, notes[]}.
Phân quyền (theo quy định của công ty):
- Chỉ trưởng phòng (head), phó phòng (deputy) và quản trị viên (admin) xem được báo cáo; nhân viên thường bị 403.
- Trưởng phòng chỉ xem số liệu của PHÒNG MÌNH (lọc theo phòng ban của người xem ở server).
- Báo cáo tổng (Điều hành, Lương, Tài liệu, Trao đổi, Công thức) chỉ dành cho admin và phòng IT.
Ngày nghiệp vụ theo Asia/Ho_Chi_Minh.

LƯU Ý DỮ LIỆU CŨ: nhiều cột ngày/tiền lưu dạng VARCHAR — ngày có thể là chuỗi ISO,
'DD/MM/YYYY', số serial Excel (46268) hoặc rỗng ''. Mọi phép ép ngày đi qua _d().
purchase_cost của equipment và expiry_date/activated của licenses đang trống toàn bộ."""
import json
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Query

from ..core.auth import verify_token
from ..core.db import fetchall, fetchone

try:
    from zoneinfo import ZoneInfo
    _VN = ZoneInfo("Asia/Ho_Chi_Minh")
except Exception:  # pragma: no cover
    _VN = None

router = APIRouter(prefix="/api/reports", tags=["reports"])

REPORTS = [
    ("dieuhanh", "Điều hành"),
    ("nhansu", "Nhân sự"),
    ("thietbi", "Thiết bị"),
    ("banquyen", "Bản quyền & License"),
    ("tickets", "Tickets hỗ trợ"),
    ("pheduyet", "Phê duyệt"),
    ("congtac", "Công tác"),
    ("congviec", "Công việc"),
    ("luong", "Lương"),
    ("tailieu", "Tài liệu & Chia sẻ"),
    ("traodoi", "Trao đổi nội bộ"),
    ("congthuc", "Công thức & In ấn"),
    ("donhang", "Đơn hàng"),
]
TITLES = dict(REPORTS)
BUILT = {k for k, _ in REPORTS} - {"donhang"}
# Báo cáo tổng — chỉ admin và phòng IT
FULL_ONLY = {"dieuhanh", "luong", "tailieu", "traodoi", "congthuc"}
# Báo cáo phòng ban: tài khoản bị khóa theo phòng (trưởng/phó phòng) chỉ thấy 4 tab này
DEPT_TABS = {"nhansu", "pheduyet", "congtac", "congviec"}

# Nhãn trạng thái thuần tiếng Việt (chỉ đổi ở tầng hiển thị báo cáo, không sửa dữ liệu gốc)
STATUS_VI = {
    "todo": "Chưa làm", "in_progress": "Đang thực hiện", "review": "Chờ duyệt",
    "completed": "Hoàn thành", "cancelled": "Đã hủy",
    "pending": "Chờ duyệt", "approved": "Đã duyệt", "rejected": "Từ chối",
    "Cho xu ly": "Chờ xử lý", "Dang xu ly": "Đang xử lý", "Da xu ly": "Đã xử lý", "Da huy": "Đã hủy",
}
EMP_STATUS_VI = {"active": "Đang làm việc", "resigned": "Đã nghỉ việc"}
TRIP_STATUS_VI = {"active": "Đang công tác", "finished": "Đã hoàn thành"}


def _st(v):
    return STATUS_VI.get(v, v)


def _emp_st(v):
    return EMP_STATUS_VI.get(v, v)


def _trip_st(v):
    return TRIP_STATUS_VI.get(v, v)



def _d(col):
    """Ép ngày an toàn cho cột ngày dạng text/date/timestamp lẫn lộn của hệ thống cũ."""
    return f"""(CASE
        WHEN {col}::text ~ '^[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}' THEN ({col}::text)::date
        WHEN {col}::text ~ '^[0-9]{{2}}/[0-9]{{2}}/[0-9]{{4}}' THEN to_date({col}::text, 'DD/MM/YYYY')
        WHEN {col}::text ~ '^[0-9]{{4,6}}$' THEN DATE '1899-12-30' + ({col}::text)::int
        END)"""


def _today():
    if _VN is not None:
        from datetime import datetime
        return datetime.now(_VN).date()
    return date.today()


def _num(v):
    if v is None:
        return 0
    if isinstance(v, Decimal):
        return float(v)
    return v


def _int(v):
    return int(_num(v) or 0)


def _delta(cur, prev):
    cur, prev = _num(cur), _num(prev)
    if not prev:
        return None
    return round((cur - prev) * 100.0 / prev, 1)


def K(label, value, unit="", delta=None):
    return {"label": label, "value": value, "unit": unit, "delta": delta}


def T(title, columns, rows):
    return {"title": title, "columns": columns, "rows": rows}


def _period(date_from, date_to):
    t = _today()
    d_to = date_to or t
    d_from = date_from or (d_to - timedelta(days=29))
    if d_from > d_to:
        d_from, d_to = d_to, d_from
    prev_to = d_from - timedelta(days=1)
    prev_from = prev_to - timedelta(days=(d_to - d_from).days)
    return d_from, d_to, prev_from, prev_to


def _caller(employee_code, token, role):
    """Xác thực người xem + xác định phạm vi phòng ban của họ."""
    if not employee_code or not token or not role:
        raise HTTPException(status_code=401, detail="Thiếu thông tin đăng nhập")
    if not verify_token(employee_code, token, role):
        raise HTTPException(status_code=401, detail="Token không hợp lệ")
    if role not in ("head", "deputy", "admin"):
        raise HTTPException(status_code=403, detail="Báo cáo chỉ dành cho trưởng phòng, phó phòng và quản trị viên")
    emp = fetchone("SELECT department FROM employees WHERE employee_code=:c", {"c": employee_code}) or {}
    dept = (emp.get("department") or "").strip() or None
    full = role == "admin" or (dept is not None and dept.upper() == "IT")
    return {"code": employee_code, "role": role, "dept": dept, "full": full}


def _env(key, d_from, d_to, kpis, scope=None, chart=None, charts=None, actions=None, details=None, notes=None):
    return {
        "key": key,
        "title": TITLES[key],
        "period": {"from": d_from.isoformat(), "to": d_to.isoformat()},
        "scope": scope,
        "kpis": kpis,
        "chart": chart,
        "charts": charts or [],
        "actions": actions,
        "details": details,
        "notes": notes or [],
    }


def _one(sql, params=None):
    return fetchone(sql, params or {}) or {}


def _cnt(sql, params=None):
    return _int(_one(sql, params).get("c"))


def _sf(col, scope):
    """Mảnh WHERE lọc theo phòng của người xem (scope=None nghĩa là xem toàn công ty)."""
    if scope is None:
        return "", {}
    return f" AND LOWER(COALESCE({col}, '')) = LOWER(:dept)", {"dept": scope}


def _in_period(col):
    return f"{_d(col)} BETWEEN :f AND :t"


def _daily(table, col, d_from, d_to, scope=None, mode="safe"):
    expr = _d(f"t.{col}") if mode == "safe" else f"(t.{col} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date"
    frag, sp = ("", {})
    if scope is not None and mode == "safe":
        frag, sp = _sf("t.department", scope)
    rows = fetchall(
        f"""SELECT to_char(gs.day, 'YYYY-MM-DD') AS d, COUNT(t.id) AS c
            FROM generate_series(:f, :t, interval '1 day') AS gs(day)
            LEFT JOIN {table} t ON {expr} = gs.day::date {frag}
            GROUP BY gs.day ORDER BY gs.day""",
        {"f": d_from, "t": d_to, **sp},
    )
    return [{"name": r["d"], "value": _int(r["c"])} for r in rows]


# ─── Điều hành (chỉ admin + IT) ──────────────────────────────────────────────
def rep_dieuhanh(d_from, d_to, pf, pt, scope):
    nv = _cnt("SELECT COUNT(*) AS c FROM employees WHERE status='active'")
    tk_open = _cnt("SELECT COUNT(*) AS c FROM tickets WHERE status IN ('Cho xu ly','Dang xu ly')")
    tk_new = _cnt(f"SELECT COUNT(*) AS c FROM tickets WHERE {_in_period('created_at')}", {"f": d_from, "t": d_to})
    tk_new_p = _cnt(f"SELECT COUNT(*) AS c FROM tickets WHERE {_in_period('created_at')}", {"f": pf, "t": pt})
    overdue = _cnt(f"SELECT COUNT(*) AS c FROM todos WHERE {_d('due_date')} < CURRENT_DATE AND status NOT IN ('completed','cancelled')")
    stock = _cnt("SELECT COUNT(*) AS c FROM equipment WHERE lifecycle_status='Trong kho'")
    trips = _cnt(f"SELECT COUNT(*) AS c FROM business_trips WHERE {_in_period('start_date')}", {"f": d_from, "t": d_to})
    trips_p = _cnt(f"SELECT COUNT(*) AS c FROM business_trips WHERE {_in_period('start_date')}", {"f": pf, "t": pt})
    charts = [
        {"kind": "line", "title": "Tickets mới theo ngày", "items": _daily("tickets", "created_at", d_from, d_to)},
        {"kind": "donut", "title": "Tickets theo trạng thái", "items": [
            {"name": _st(r["status"]), "value": _int(r["c"])}
            for r in fetchall("SELECT status, COUNT(*) AS c FROM tickets GROUP BY status ORDER BY c DESC")
        ]},
        {"kind": "bar", "title": "Nhân viên đang làm theo phòng ban", "items": [
            {"name": r["department"] or "(chưa rõ)", "value": _int(r["c"])}
            for r in fetchall("SELECT department, COUNT(*) AS c FROM employees WHERE status='active' GROUP BY department ORDER BY c DESC LIMIT 12")
        ]},
    ]
    actions = T("Tickets mở lâu nhất — cần xử lý", ["Tiêu đề", "Phòng ban", "Ưu tiên", "Ngày tạo", "Số ngày mở"], [
        [r["title"], r["department"], r["priority"], r["d"], _int(r["days"])]
        for r in fetchall(f"""SELECT title, department, priority,
                to_char({_d('created_at')},'DD/MM/YYYY') AS d,
                (CURRENT_DATE - {_d('created_at')}) AS days
            FROM tickets WHERE status IN ('Cho xu ly','Dang xu ly') ORDER BY {_d('created_at')} ASC NULLS LAST LIMIT 8""")
    ])
    details = T("Tickets mới trong kỳ", ["Tiêu đề", "Người yêu cầu", "Phòng ban", "Trạng thái", "Ngày tạo"], [
        [r["title"], r["full_name"], r["department"], _st(r["status"]), r["d"]]
        for r in fetchall(f"""SELECT title, full_name, department, status,
                to_char({_d('created_at')},'DD/MM/YYYY') AS d
            FROM tickets WHERE {_in_period('created_at')}
            ORDER BY {_d('created_at')} DESC LIMIT 10""", {"f": d_from, "t": d_to})
    ])
    notes = ["Module Diễn đàn và Mail chưa có dữ liệu đồng bộ — xem trang Trao đổi nội bộ.",
             "Báo cáo Đơn hàng lấy số từ hệ thống bán hàng bên ngoài, chưa kết nối."]
    return _env("dieuhanh", d_from, d_to,
                [K("Nhân viên đang làm", nv, "người"),
                 K("Tickets mới trong kỳ", tk_new, "ticket", _delta(tk_new, tk_new_p)),
                 K("Tickets đang mở", tk_open, "ticket"),
                 K("Việc quá hạn", overdue, "việc"),
                 K("Thiết bị đang trong kho", stock, "thiết bị"),
                 K("Chuyến công tác trong kỳ", trips, "chuyến", _delta(trips, trips_p))],
                charts=charts, actions=actions, details=details, notes=notes)


# ─── Nhân sự ─────────────────────────────────────────────────────────────────
def rep_nhansu(d_from, d_to, pf, pt, scope):
    frag, sp = _sf("department", scope)
    active = _cnt(f"SELECT COUNT(*) AS c FROM employees WHERE status='active'{frag}", sp)
    resigned = _cnt(f"SELECT COUNT(*) AS c FROM employees WHERE status='resigned'{frag}", sp)
    joined = _cnt(f"SELECT COUNT(*) AS c FROM employees WHERE {_in_period('start_date')}{frag}", {"f": d_from, "t": d_to, **sp})
    joined_p = _cnt(f"SELECT COUNT(*) AS c FROM employees WHERE {_in_period('start_date')}{frag}", {"f": pf, "t": pt, **sp})
    left = _cnt(f"SELECT COUNT(*) AS c FROM employees WHERE {_in_period('handover_date')}{frag}", {"f": d_from, "t": d_to, **sp})
    notes = ["Một số hồ sơ cũ nhập từ Excel chưa có ngày vào làm — các hồ sơ đó không tính vào 'Vào làm trong kỳ'."]
    if scope is None:
        depts = _cnt("SELECT COUNT(*) AS c FROM departments")
        chart = {"kind": "bar", "title": "Nhân viên đang làm theo phòng ban", "items": [
            {"name": r["department"] or "(chưa rõ)", "value": _int(r["c"])}
            for r in fetchall("SELECT department, COUNT(*) AS c FROM employees WHERE status='active' GROUP BY department ORDER BY c DESC LIMIT 15")
        ]}
        details = T("Nhân sự theo phòng ban", ["Phòng ban", "Đang làm", "Đã nghỉ", "Tổng"], [
            [r["department"] or "(chưa rõ)", _int(r["a"]), _int(r["r"]), _int(r["t"])]
            for r in fetchall("""SELECT department,
                    COUNT(*) FILTER (WHERE status='active') AS a,
                    COUNT(*) FILTER (WHERE status='resigned') AS r,
                    COUNT(*) AS t FROM employees GROUP BY department ORDER BY t DESC""")
        ])
        kpis = [K("Đang làm việc", active, "người"), K("Đã nghỉ việc", resigned, "người"),
                K("Số phòng ban", depts, "phòng"), K("Vào làm trong kỳ", joined, "người", _delta(joined, joined_p)),
                K("Nghỉ việc trong kỳ", left, "người")]
    else:
        chart = {"kind": "bar", "title": f"Nhân viên phòng {scope} theo chức vụ", "items": [
            {"name": r["position"] or "(chưa rõ)", "value": _int(r["c"])}
            for r in fetchall(f"SELECT position, COUNT(*) AS c FROM employees WHERE status='active'{frag} GROUP BY position ORDER BY c DESC LIMIT 12", sp)
        ]}
        details = T(f"Danh sách nhân viên phòng {scope}", ["Họ tên", "Mã NV", "Chức vụ", "Trạng thái", "Ngày vào"], [
            [r["full_name"], r["employee_code"], r["position"], _emp_st(r["status"]), r["d"]]
            for r in fetchall(f"""SELECT full_name, employee_code, position, status,
                    to_char({_d('start_date')},'DD/MM/YYYY') AS d FROM employees
                WHERE 1=1{frag} ORDER BY status, full_name LIMIT 30""", sp)
        ])
        kpis = [K("Đang làm việc", active, "người"), K("Đã nghỉ việc", resigned, "người"),
                K("Vào làm trong kỳ", joined, "người", _delta(joined, joined_p)),
                K("Nghỉ việc trong kỳ", left, "người")]
    actions = T("Nhân viên mới trong kỳ", ["Họ tên", "Mã NV", "Phòng ban", "Chức vụ", "Ngày vào"], [
        [r["full_name"], r["employee_code"], r["department"], r["position"], r["d"]]
        for r in fetchall(f"""SELECT full_name, employee_code, department, position,
                to_char({_d('start_date')},'DD/MM/YYYY') AS d FROM employees
            WHERE {_in_period('start_date')}{frag} ORDER BY {_d('start_date')} DESC LIMIT 10""", {"f": d_from, "t": d_to, **sp})
    ])
    return _env("nhansu", d_from, d_to, kpis, scope=scope, chart=chart, actions=actions, details=details, notes=notes)


# ─── Thiết bị (phạm vi = thiết bị do nhân viên phòng mình đang giữ) ─────────
def rep_thietbi(d_from, d_to, pf, pt, scope):
    join = "LEFT JOIN employees e ON e.id = eq.employee_id"
    frag, sp = _sf("e.department", scope)
    total = _cnt(f"SELECT COUNT(*) AS c FROM equipment eq {join} WHERE 1=1{frag}", sp)
    issued = _cnt(f"SELECT COUNT(*) AS c FROM equipment eq {join} WHERE eq.lifecycle_status='Đã cấp phát'{frag}", sp)
    stock = _cnt(f"SELECT COUNT(*) AS c FROM equipment eq {join} WHERE eq.lifecycle_status='Trong kho'{frag}", sp)
    recalled = _cnt(f"SELECT COUNT(*) AS c FROM equipment eq {join} WHERE eq.lifecycle_status='Thu hồi'{frag}", sp)
    chart = {"kind": "bar", "title": "Thiết bị theo loại", "items": [
        {"name": r["equipment_type"] or "(chưa rõ)", "value": _int(r["c"])}
        for r in fetchall(f"SELECT eq.equipment_type, COUNT(*) AS c FROM equipment eq {join} WHERE 1=1{frag} GROUP BY eq.equipment_type ORDER BY c DESC LIMIT 12", sp)
    ]}
    details = T("Thiết bị theo trạng thái vòng đời", ["Trạng thái", "Số lượng"], [
        [r["lifecycle_status"] or "(chưa rõ)", _int(r["c"])]
        for r in fetchall(f"SELECT eq.lifecycle_status, COUNT(*) AS c FROM equipment eq {join} WHERE 1=1{frag} GROUP BY eq.lifecycle_status ORDER BY c DESC", sp)
    ])
    if scope is None:
        actions = T("Thiết bị đang trong kho", ["Mã tài sản", "Loại", "Số serial", "Trạng thái"], [
            [r["asset_code"], r["equipment_type"], r["serial_number"], r["status"]]
            for r in fetchall("""SELECT asset_code, equipment_type, serial_number, status FROM equipment
                WHERE lifecycle_status='Trong kho' ORDER BY asset_code LIMIT 12""")
        ])
        notes = ["Cột ngày mua và giá mua của thiết bị đang trống trong dữ liệu nguồn nên trang này chưa có thống kê giá trị tài sản."]
    else:
        actions = T(f"Thiết bị nhân viên phòng {scope} đang giữ", ["Mã tài sản", "Loại", "Người giữ", "Trạng thái"], [
            [r["asset_code"], r["equipment_type"], r["full_name"], r["lifecycle_status"]]
            for r in fetchall(f"""SELECT eq.asset_code, eq.equipment_type, e.full_name, eq.lifecycle_status
                FROM equipment eq {join} WHERE eq.lifecycle_status='Đã cấp phát'{frag}
                ORDER BY eq.asset_code LIMIT 12""", sp)
        ])
        notes = [f"Phạm vi phòng {scope}: chỉ tính thiết bị đã cấp cho nhân viên của phòng; thiết bị trong kho dùng chung không tính ở đây."]
    return _env("thietbi", d_from, d_to,
                [K("Tổng thiết bị", total, "thiết bị"), K("Đã cấp phát", issued, "thiết bị"),
                 K("Trong kho", stock, "thiết bị"), K("Đã thu hồi", recalled, "thiết bị")],
                scope=scope, chart=chart, actions=actions, details=details, notes=notes)


# ─── Bản quyền & License ─────────────────────────────────────────────────────
def rep_banquyen(d_from, d_to, pf, pt, scope):
    join = "LEFT JOIN employees e ON e.id = l.employee_id"
    frag, sp = _sf("e.department", scope)
    total = _cnt(f"SELECT COUNT(*) AS c FROM licenses l {join} WHERE 1=1{frag}", sp)
    products = _cnt(f"SELECT COUNT(DISTINCT l.product_name) AS c FROM licenses l {join} WHERE 1=1{frag}", sp)
    assigned = _cnt(f"SELECT COUNT(*) AS c FROM licenses l {join} WHERE l.employee_id IS NOT NULL{frag}", sp)
    chart = {"kind": "bar", "title": "License theo sản phẩm", "items": [
        {"name": r["product_name"] or "(chưa rõ)", "value": _int(r["c"])}
        for r in fetchall(f"SELECT l.product_name, COUNT(*) AS c FROM licenses l {join} WHERE 1=1{frag} GROUP BY l.product_name ORDER BY c DESC LIMIT 12", sp)
    ]}
    details = T("License theo sản phẩm", ["Sản phẩm", "Số license", "Đã gán nhân viên"], [
        [r["product_name"] or "(chưa rõ)", _int(r["c"]), _int(r["a"])]
        for r in fetchall(f"""SELECT l.product_name, COUNT(*) AS c,
                COUNT(*) FILTER (WHERE l.employee_id IS NOT NULL) AS a
            FROM licenses l {join} WHERE 1=1{frag} GROUP BY l.product_name ORDER BY c DESC""", sp)
    ])
    if scope is None:
        actions = T("License chưa gán nhân viên", ["Sản phẩm", "Mã thiết bị"], [
            [r["product_name"], r["asset_code"]]
            for r in fetchall("""SELECT l.product_name, e.asset_code FROM licenses l
                LEFT JOIN equipment e ON e.id = l.equipment_id
                WHERE l.employee_id IS NULL ORDER BY l.product_name LIMIT 12""")
        ])
    else:
        actions = T(f"License phòng {scope} đang giữ", ["Sản phẩm", "Người giữ", "Mã thiết bị"], [
            [r["product_name"], r["full_name"], r["asset_code"]]
            for r in fetchall(f"""SELECT l.product_name, e.full_name, eq.asset_code
                FROM licenses l {join} LEFT JOIN equipment eq ON eq.id = l.equipment_id
                WHERE l.employee_id IS NOT NULL{frag} ORDER BY l.product_name LIMIT 12""", sp)
        ])
    notes = ["Cột ngày hết hạn (expiry_date) và trạng thái kích hoạt của license đang trống trong dữ liệu nguồn — "
             "khi được nhập bổ sung, trang này sẽ có cảnh báo hết hạn 30/60/90 ngày."]
    return _env("banquyen", d_from, d_to,
                [K("Tổng license", total, "license"), K("Loại sản phẩm", products, "sản phẩm"),
                 K("Đã gán nhân viên", assigned, "license"), K("Chưa gán nhân viên", total - assigned, "license")],
                scope=scope, chart=chart, actions=actions, details=details, notes=notes)


# ─── Tickets ─────────────────────────────────────────────────────────────────
def rep_tickets(d_from, d_to, pf, pt, scope):
    frag, sp = _sf("department", scope)
    new = _cnt(f"SELECT COUNT(*) AS c FROM tickets WHERE {_in_period('created_at')}{frag}", {"f": d_from, "t": d_to, **sp})
    new_p = _cnt(f"SELECT COUNT(*) AS c FROM tickets WHERE {_in_period('created_at')}{frag}", {"f": pf, "t": pt, **sp})
    open_now = _cnt(f"SELECT COUNT(*) AS c FROM tickets WHERE status IN ('Cho xu ly','Dang xu ly'){frag}", sp)
    done = _cnt(f"SELECT COUNT(*) AS c FROM tickets WHERE status='Da xu ly' AND {_in_period('updated_at')}{frag}", {"f": d_from, "t": d_to, **sp})
    total = _cnt(f"SELECT COUNT(*) AS c FROM tickets WHERE 1=1{frag}", sp)
    rate = round(done * 100.0 / new, 1) if new else None
    charts = [
        {"kind": "donut", "title": "Trạng thái tickets", "items": [
            {"name": _st(r["status"]), "value": _int(r["c"])}
            for r in fetchall(f"SELECT status, COUNT(*) AS c FROM tickets WHERE 1=1{frag} GROUP BY status ORDER BY c DESC", sp)
        ]},
        {"kind": "line", "title": "Tickets mới theo ngày", "items": _daily("tickets", "created_at", d_from, d_to, scope=scope)},
    ]
    if scope is None:
        charts.append({"kind": "bar", "title": "Tickets theo phòng ban (kỳ này)", "items": [
            {"name": r["department"] or "(chưa rõ)", "value": _int(r["c"])}
            for r in fetchall(f"""SELECT department, COUNT(*) AS c FROM tickets
                WHERE {_in_period('created_at')} GROUP BY department ORDER BY c DESC LIMIT 10""", {"f": d_from, "t": d_to})
        ]})
    actions = T("Tickets mở lâu nhất", ["Tiêu đề", "Phòng ban", "Ưu tiên", "Số ngày mở"], [
        [r["title"], r["department"], r["priority"], _int(r["days"])]
        for r in fetchall(f"""SELECT title, department, priority,
                (CURRENT_DATE - {_d('created_at')}) AS days
            FROM tickets WHERE status IN ('Cho xu ly','Dang xu ly'){frag} ORDER BY {_d('created_at')} ASC NULLS LAST LIMIT 10""", sp)
    ])
    details = T("Tickets theo mức ưu tiên (kỳ này)", ["Ưu tiên", "Số tickets"], [
        [r["priority"], _int(r["c"])]
        for r in fetchall(f"""SELECT priority, COUNT(*) AS c FROM tickets
            WHERE {_in_period('created_at')}{frag} GROUP BY priority ORDER BY c DESC""", {"f": d_from, "t": d_to, **sp})
    ])
    kpis = [K("Tickets mới trong kỳ", new, "ticket", _delta(new, new_p)),
            K("Đang mở hiện tại", open_now, "ticket"),
            K("Đã xử lý trong kỳ", done, "ticket"),
            K("Tổng tickets", total, "ticket")]
    if rate is not None:
        kpis.append(K("Tỉ lệ xử lý / mới", rate, "%"))
    return _env("tickets", d_from, d_to, kpis, scope=scope, charts=charts, actions=actions, details=details)


# ─── Phê duyệt ───────────────────────────────────────────────────────────────
def rep_pheduyet(d_from, d_to, pf, pt, scope):
    frag, sp = _sf("requester_dept", scope)
    total = _cnt(f"SELECT COUNT(*) AS c FROM approval_requests WHERE {_in_period('created_at')}{frag}", {"f": d_from, "t": d_to, **sp})
    total_p = _cnt(f"SELECT COUNT(*) AS c FROM approval_requests WHERE {_in_period('created_at')}{frag}", {"f": pf, "t": pt, **sp})
    approved = _cnt(f"SELECT COUNT(*) AS c FROM approval_requests WHERE status='approved'{frag}", sp)
    cancelled = _cnt(f"SELECT COUNT(*) AS c FROM approval_requests WHERE status='cancelled'{frag}", sp)
    pending = _cnt(f"SELECT COUNT(*) AS c FROM approval_requests WHERE status NOT IN ('approved','cancelled'){frag}", sp)
    kpis = [K("Yêu cầu trong kỳ", total, "yêu cầu", _delta(total, total_p)),
            K("Đã duyệt", approved, "yêu cầu"),
            K("Đã hủy", cancelled, "yêu cầu"),
            K("Đang chờ duyệt", pending, "yêu cầu")]
    if scope is None:
        kpis.append(K("Mẫu quy trình", _cnt("SELECT COUNT(*) AS c FROM workflow_templates"), "mẫu"))
    chart = {"kind": "donut", "title": "Yêu cầu theo trạng thái", "items": [
        {"name": _st(r["status"]), "value": _int(r["c"])}
        for r in fetchall(f"SELECT status, COUNT(*) AS c FROM approval_requests WHERE 1=1{frag} GROUP BY status ORDER BY c DESC", sp)
    ]}
    details = T("Yêu cầu gần nhất", ["Tiêu đề", "Người yêu cầu", "Phòng ban", "Trạng thái", "Bước", "Ngày tạo"], [
        [r["title"], r["requester_name"], r["requester_dept"], _st(r["status"]), f"{_int(r['current_step'])}/{_int(r['total_steps'])}", r["d"]]
        for r in fetchall(f"""SELECT title, requester_name, requester_dept, status, current_step, total_steps,
                to_char({_d('created_at')},'DD/MM/YYYY') AS d
            FROM approval_requests WHERE 1=1{frag} ORDER BY {_d('created_at')} DESC NULLS LAST LIMIT 12""", sp)
    ])
    actions = T("Yêu cầu đang chờ duyệt", ["Tiêu đề", "Người yêu cầu", "Bước hiện tại", "Ngày tạo"], [
        [r["title"], r["requester_name"], f"{_int(r['current_step'])}/{_int(r['total_steps'])}", r["d"]]
        for r in fetchall(f"""SELECT title, requester_name, current_step, total_steps,
                to_char({_d('created_at')},'DD/MM/YYYY') AS d
            FROM approval_requests WHERE status NOT IN ('approved','cancelled'){frag} ORDER BY {_d('created_at')} ASC NULLS LAST LIMIT 10""", sp)
    ])
    notes = ["Số yêu cầu phê duyệt ghi nhận trong hệ thống hiện còn ít — module mới được sử dụng gần đây."]
    return _env("pheduyet", d_from, d_to, kpis, scope=scope, chart=chart, actions=actions, details=details, notes=notes)


# ─── Công tác ────────────────────────────────────────────────────────────────
def rep_congtac(d_from, d_to, pf, pt, scope):
    frag, sp = _sf("department", scope)
    trips = _cnt(f"SELECT COUNT(*) AS c FROM business_trips WHERE {_in_period('start_date')}{frag}", {"f": d_from, "t": d_to, **sp})
    trips_p = _cnt(f"SELECT COUNT(*) AS c FROM business_trips WHERE {_in_period('start_date')}{frag}", {"f": pf, "t": pt, **sp})
    days = _int(_one(f"""SELECT COALESCE(SUM(CASE WHEN {_d('end_date')} IS NOT NULL AND {_d('start_date')} IS NOT NULL
            THEN {_d('end_date')} - {_d('start_date')} + 1 END),0) AS c
        FROM business_trips WHERE {_in_period('start_date')}{frag}""", {"f": d_from, "t": d_to, **sp}).get("c"))
    going = _cnt(f"SELECT COUNT(*) AS c FROM business_trips WHERE {_d('start_date')} <= CURRENT_DATE AND {_d('end_date')} >= CURRENT_DATE{frag}", sp)
    people = _cnt(f"SELECT COUNT(DISTINCT employee_code) AS c FROM business_trips WHERE {_in_period('start_date')}{frag}", {"f": d_from, "t": d_to, **sp})
    charts = []
    if scope is None:
        charts.append({"kind": "bar", "title": "Chuyến công tác theo phòng ban (kỳ này)", "items": [
            {"name": r["department"] or "(chưa rõ)", "value": _int(r["c"])}
            for r in fetchall(f"""SELECT department, COUNT(*) AS c FROM business_trips
                WHERE {_in_period('start_date')} GROUP BY department ORDER BY c DESC LIMIT 10""", {"f": d_from, "t": d_to})
        ]})
    details = T("Chuyến công tác gần nhất", ["Nhân viên", "Phòng ban", "Nơi đến", "Từ ngày", "Đến ngày", "Trạng thái"], [
        [r["full_name"], r["department"], r["destination"], r["s"], r["e"], _trip_st(r["status"])]
        for r in fetchall(f"""SELECT full_name, department, destination, status,
                to_char({_d('start_date')},'DD/MM/YYYY') AS s, to_char({_d('end_date')},'DD/MM/YYYY') AS e
            FROM business_trips WHERE 1=1{frag} ORDER BY {_d('start_date')} DESC NULLS LAST LIMIT 12""", sp)
    ])
    actions = T("Chuyến sắp diễn ra", ["Nhân viên", "Nơi đến", "Bắt đầu", "Kết thúc"], [
        [r["full_name"], r["destination"], r["s"], r["e"]]
        for r in fetchall(f"""SELECT full_name, destination,
                to_char({_d('start_date')},'DD/MM/YYYY') AS s, to_char({_d('end_date')},'DD/MM/YYYY') AS e
            FROM business_trips WHERE {_d('start_date')} >= CURRENT_DATE{frag} ORDER BY {_d('start_date')} ASC LIMIT 8""", sp)
    ])
    notes = ["Module Lịch (Booking) hiện chưa có lượt đặt nào được ghi nhận."]
    return _env("congtac", d_from, d_to,
                [K("Chuyến trong kỳ", trips, "chuyến", _delta(trips, trips_p)),
                 K("Tổng ngày công tác trong kỳ", days, "ngày"),
                 K("Đang đi công tác", going, "chuyến"),
                 K("Số nhân viên đi trong kỳ", people, "người")],
                scope=scope, charts=charts, actions=actions, details=details, notes=notes)


# ─── Công việc — xếp theo từng phòng ban ─────────────────────────────────────
def rep_congviec(d_from, d_to, pf, pt, scope):
    frag, sp = _sf("department", scope)
    new = _cnt(f"SELECT COUNT(*) AS c FROM todos WHERE {_in_period('created_at')}{frag}", {"f": d_from, "t": d_to, **sp})
    new_p = _cnt(f"SELECT COUNT(*) AS c FROM todos WHERE {_in_period('created_at')}{frag}", {"f": pf, "t": pt, **sp})
    doing = _cnt(f"SELECT COUNT(*) AS c FROM todos WHERE status='in_progress'{frag}", sp)
    done = _cnt(f"SELECT COUNT(*) AS c FROM todos WHERE {_in_period('completed_at')}{frag}", {"f": d_from, "t": d_to, **sp})
    overdue = _cnt(f"SELECT COUNT(*) AS c FROM todos WHERE {_d('due_date')} < CURRENT_DATE AND status NOT IN ('completed','cancelled'){frag}", sp)
    charts = [
        {"kind": "donut", "title": "Công việc theo trạng thái", "items": [
            {"name": _st(r["status"]), "value": _int(r["c"])}
            for r in fetchall(f"SELECT status, COUNT(*) AS c FROM todos WHERE 1=1{frag} GROUP BY status ORDER BY c DESC", sp)
        ]},
    ]
    if scope is None:
        charts.append({"kind": "bar", "title": "Việc đang mở theo phòng ban", "items": [
            {"name": r["department"] or "(không ghi phòng)", "value": _int(r["c"])}
            for r in fetchall("""SELECT department, COUNT(*) AS c FROM todos
                WHERE status NOT IN ('completed','cancelled') GROUP BY department ORDER BY c DESC LIMIT 12""")
        ]})
    # Bảng chính: mỗi phòng ban một dòng
    details = T("Công việc theo từng phòng ban", ["Phòng ban", "Tổng việc", "Đang mở", "Hoàn thành", "Quá hạn"], [
        [r["department"] or "(không ghi phòng)", _int(r["t"]), _int(r["o"]), _int(r["done"]), _int(r["od"])]
        for r in fetchall(f"""SELECT department, COUNT(*) AS t,
                COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled')) AS o,
                COUNT(*) FILTER (WHERE status='completed') AS done,
                COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled') AND {_d('due_date')} < CURRENT_DATE) AS od
            FROM todos WHERE 1=1{frag} GROUP BY department ORDER BY t DESC""", sp)
    ])
    od_rows = fetchall(f"""SELECT id, title, department, assignee_name, to_char({_d('due_date')},'DD/MM/YYYY') AS d,
            (CURRENT_DATE - {_d('due_date')}) AS days FROM todos
        WHERE {_d('due_date')} < CURRENT_DATE AND status NOT IN ('completed','cancelled'){frag}
        ORDER BY {_d('due_date')} ASC LIMIT 12""", sp)
    actions = T("Việc quá hạn — cần xử lý", ["Tiêu đề", "Phòng ban", "Người thực hiện", "Hạn", "Quá hạn (ngày)"],
                [[r["title"], r["department"], r["assignee_name"], r["d"], _int(r["days"])] for r in od_rows])
    actions["ids"] = [r["id"] for r in od_rows]
    return _env("congviec", d_from, d_to,
                [K("Việc mới trong kỳ", new, "việc", _delta(new, new_p)),
                 K("Đang thực hiện", doing, "việc"),
                 K("Hoàn thành trong kỳ", done, "việc"),
                 K("Quá hạn hiện tại", overdue, "việc")],
                scope=scope, charts=charts, actions=actions, details=details)


# ─── Lương (chỉ admin + IT; gộp trong Python vì data_json có dòng lỗi) ──────
def _f(v):
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace(" ", "").replace(",", "")
    try:
        return float(s)
    except Exception:
        return 0.0


def rep_luong(d_from, d_to, pf, pt, scope):
    raw = fetchall("SELECT employee_code, data_json::text AS dj FROM salaries")
    agg = {}
    bad = 0
    for r in raw:
        try:
            d = json.loads(r["dj"]) if r["dj"] else {}
        except Exception:
            bad += 1
            continue
        try:
            y, m = int(d.get("YEAR")), int(d.get("MONTH"))
        except Exception:
            bad += 1
            continue
        a = agg.setdefault((y, m), {"n": set(), "tn": 0.0, "kt": 0.0, "pb": {}})
        a["n"].add(r["employee_code"])
        tn = _f(d.get("TONG_THU_NHAP"))
        a["tn"] += tn
        a["kt"] += _f(d.get("TONG_KHAU_TRU"))
        pb = str(d.get("PB") or "(chưa rõ)")
        p = a["pb"].setdefault(pb, {"n": set(), "tn": 0.0})
        p["n"].add(r["employee_code"])
        p["tn"] += tn
    if not agg:
        return _env("luong", d_from, d_to, [], notes=["Chưa có dữ liệu lương hợp lệ trong bảng salaries."])
    keys = sorted(agg.keys())[-12:]
    rows = [(k, agg[k]) for k in keys]
    (ly, lm), last = rows[-1]
    prev = rows[-2][1] if len(rows) > 1 else None
    chart = {"kind": "bar", "title": "Tổng thu nhập theo tháng (12 tháng gần nhất)", "items": [
        {"name": f"{k[1]}/{k[0]}", "value": round(a["tn"], 0)} for k, a in rows
    ]}
    details = T("Tổng hợp lương theo tháng", ["Tháng", "Số nhân viên", "Tổng thu nhập", "Tổng khấu trừ", "Thực lĩnh"], [
        [f"{k[1]}/{k[0]}", len(a["n"]), round(a["tn"], 0), round(a["kt"], 0), round(a["tn"] - a["kt"], 0)]
        for k, a in reversed(rows)
    ])
    actions = T(f"Thu nhập theo phòng ban — tháng {lm}/{ly}", ["Phòng ban (PB)", "Số nhân viên", "Tổng thu nhập"], [
        [pb, len(v["n"]), round(v["tn"], 0)]
        for pb, v in sorted(last["pb"].items(), key=lambda x: -x[1]["tn"])[:10]
    ])
    slips = _cnt("SELECT COUNT(*) AS c FROM salary_slips")
    notes = [f"Module Phiếu lương mới có {slips} phiếu phát hành qua hệ thống — số liệu trang này lấy từ bảng lương tổng hợp (salaries)."]
    if bad:
        notes.append(f"Có {bad} dòng lương lỗi định dạng JSON đã bị bỏ qua khi tổng hợp.")
    return _env("luong", d_from, d_to,
                [K(f"Nhân viên có lương tháng {lm}/{ly}", len(last["n"]), "người"),
                 K("Tổng thu nhập tháng mới nhất", round(last["tn"], 0), "đ", _delta(last["tn"], prev["tn"]) if prev else None),
                 K("Tổng khấu trừ tháng mới nhất", round(last["kt"], 0), "đ"),
                 K("Thực lĩnh tháng mới nhất", round(last["tn"] - last["kt"], 0), "đ"),
                 K("Số kỳ lương đã có dữ liệu", len(agg), "tháng")],
                chart=chart, actions=actions, details=details, notes=notes)


# ─── Tài liệu & Chia sẻ (chỉ admin + IT — lượt chia sẻ do admin tạo, không theo phòng) ──
def rep_tailieu(d_from, d_to, pf, pt, scope):
    shares = _cnt("SELECT COUNT(*) AS c FROM document_shares")
    notif = _cnt("SELECT COUNT(*) AS c FROM notifications")
    attach = _cnt("SELECT COUNT(*) AS c FROM attachments")
    cols = [c["column_name"] for c in fetchall(
        "SELECT column_name FROM information_schema.columns WHERE table_name='document_shares'")]
    details = None
    if "file_name" in cols and "created_at" in cols:
        raw = fetchall(f"""SELECT file_name, created_by,
                to_char({_d('created_at')},'DD/MM/YYYY') AS d
            FROM document_shares ORDER BY {_d('created_at')} DESC NULLS LAST LIMIT 12""")
        details = T("Lượt chia sẻ gần nhất", ["Tài liệu", "Người chia sẻ", "Ngày"],
                    [[r.get("file_name"), r.get("created_by") or "", r.get("d")] for r in raw])
    notes = []
    if attach == 0:
        notes.append("Chưa có tệp đính kèm nào được ghi nhận trong bảng attachments.")
    return _env("tailieu", d_from, d_to,
                [K("Lượt chia sẻ tài liệu", shares, "lượt"),
                 K("Thông báo hệ thống", notif, "thông báo"),
                 K("Tệp đính kèm", attach, "tệp")],
                details=details, notes=notes)


# ─── Trao đổi nội bộ (chỉ admin + IT) ────────────────────────────────────────
def rep_traodoi(d_from, d_to, pf, pt, scope):
    rooms = _cnt("SELECT COUNT(*) AS c FROM chat_rooms")
    msgs = _cnt("SELECT COUNT(*) AS c FROM chat_messages WHERE (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN :f AND :t", {"f": d_from, "t": d_to})
    posts = _cnt("SELECT COUNT(*) AS c FROM forum_posts")
    replies = _cnt("SELECT COUNT(*) AS c FROM forum_replies")
    chart = {"kind": "line", "title": "Tin nhắn chat theo ngày", "items": _daily("chat_messages", "created_at", d_from, d_to, mode="ts")}
    notes = ["Diễn đàn chưa có bài viết nào được đăng.",
             "Mail nội bộ chưa đồng bộ dữ liệu về hệ thống (0 tài khoản mail, 0 thư) — trang Mail lấy thư trực tiếp khi người dùng mở."]
    return _env("traodoi", d_from, d_to,
                [K("Phòng chat", rooms, "phòng"), K("Tin nhắn trong kỳ", msgs, "tin"),
                 K("Bài viết diễn đàn", posts, "bài"), K("Trả lời diễn đàn", replies, "lượt")],
                chart=chart, notes=notes)


# ─── Công thức & In ấn (chỉ admin + IT — dữ liệu nhà máy, không theo phòng) ──
def rep_congthuc(d_from, d_to, pf, pt, scope):
    recipes = _cnt("SELECT COUNT(*) AS c FROM formula_recipes")
    logs = _cnt("SELECT COUNT(*) AS c FROM formula_print_logs")
    jobs = _cnt("SELECT COUNT(*) AS c FROM formula_print_jobs")
    raw = fetchall(f"""SELECT id, recipe_id, printed_by,
            to_char({_d('printed_at')},'DD/MM/YYYY') AS d
        FROM formula_print_logs ORDER BY {_d('printed_at')} DESC NULLS LAST LIMIT 12""")
    details = T("Lượt in gần nhất", ["Mã", "Công thức (recipe_id)", "Người in", "Ngày"],
                [[r.get("id"), r.get("recipe_id"), r.get("printed_by") or "", r.get("d")] for r in raw]) if raw else None
    return _env("congthuc", d_from, d_to,
                [K("Công thức", recipes, "công thức"), K("Lượt in đã ghi", logs, "lượt"),
                 K("Job in đang chờ", jobs, "job")],
                details=details)


# ─── Đơn hàng (nguồn ngoài) ──────────────────────────────────────────────────
def rep_donhang(d_from, d_to, pf, pt, scope):
    return _env("donhang", d_from, d_to, [],
                notes=["Dữ liệu đơn hàng nằm ở hệ thống bán hàng bên ngoài (module Đơn hàng kết nối qua API riêng).",
                       "Trang báo cáo này sẽ được nối số khi có quyền đọc API tổng hợp của hệ thống bán hàng."])


BUILDERS = {
    "dieuhanh": rep_dieuhanh, "nhansu": rep_nhansu, "thietbi": rep_thietbi,
    "banquyen": rep_banquyen, "tickets": rep_tickets, "pheduyet": rep_pheduyet,
    "congtac": rep_congtac, "congviec": rep_congviec, "luong": rep_luong,
    "tailieu": rep_tailieu, "traodoi": rep_traodoi, "congthuc": rep_congthuc,
    "donhang": rep_donhang,
}


def _dept_list():
    """Danh sách phòng ban có nhân viên thật, gộp các biến thể hoa/thường (Sản Xuất vs Sản xuất)."""
    best = {}
    for r in fetchall("SELECT department, COUNT(*) AS c FROM employees WHERE department IS NOT NULL AND department <> '' GROUP BY department"):
        k = r["department"].lower()
        if k not in best or _int(r["c"]) > best[k][1]:
            best[k] = (r["department"], _int(r["c"]))
    return sorted([v[0] for v in best.values()])


@router.get("/todo/{todo_id}")
def report_todo_detail(todo_id: int, employee_code: str = "", token: str = "", role: str = ""):
    """Chi tiết một công việc cho popup ở báo cáo Công việc (áp dụng cùng quy tắc phạm vi phòng ban)."""
    caller = _caller(employee_code, token, role)
    row = fetchone(f"""SELECT id, title, description, department, creator_name, assignee_name,
                              status, priority, tags,
                              to_char({_d('due_date')}, 'DD/MM/YYYY') AS due,
                              to_char({_d('created_at')}, 'DD/MM/YYYY') AS created,
                              to_char({_d('completed_at')}, 'DD/MM/YYYY') AS completed
                       FROM todos WHERE id = :id""", {"id": todo_id})
    if not row:
        raise HTTPException(status_code=404, detail="Không tìm thấy công việc")
    if not caller["full"]:
        dept = (row["department"] or "").strip().lower()
        if not caller["dept"] or dept != caller["dept"].lower():
            raise HTTPException(status_code=403, detail="Công việc này thuộc phòng ban khác")
    return {"data": dict(row)}


@router.get("")
def reports_index(employee_code: str = "", token: str = "", role: str = ""):
    caller = _caller(employee_code, token, role)
    data = [{"key": k, "title": t, "built": k in BUILT,
             "allowed": caller["full"] or k in DEPT_TABS,
             "scopable": k not in FULL_ONLY and k != "donhang"} for k, t in REPORTS]
    return {"data": data, "scope": None if caller["full"] else caller["dept"],
            "full": caller["full"], "departments": _dept_list() if caller["full"] else []}


@router.get("/{key}")
def report_detail(key: str, employee_code: str = "", token: str = "", role: str = "",
                  date_from: date = Query(None, alias="from"), date_to: date = Query(None, alias="to"),
                  dept: str = ""):
    caller = _caller(employee_code, token, role)
    if key not in BUILDERS:
        raise HTTPException(status_code=404, detail="Không có báo cáo này")
    if key in FULL_ONLY and not caller["full"]:
        raise HTTPException(status_code=403, detail="Báo cáo tổng chỉ dành cho Quản trị viên và phòng IT")
    if key not in DEPT_TABS and not caller["full"]:
        raise HTTPException(status_code=403, detail="Báo cáo phòng ban chỉ gồm: Nhân sự, Phê duyệt, Công tác, Công việc")
    if not caller["full"] and not caller["dept"]:
        raise HTTPException(status_code=403, detail="Tài khoản chưa gắn phòng ban nên chưa xem được báo cáo phòng ban")
    d_from, d_to, pf, pt = _period(date_from, date_to)
    if caller["full"]:
        scope = None
        if dept and key not in FULL_ONLY:
            match = {d.lower(): d for d in _dept_list()}
            scope = match.get(dept.strip().lower())
            if scope is None:
                raise HTTPException(status_code=400, detail="Phòng ban không tồn tại")
    else:
        # Trưởng phòng: luôn khóa theo phòng của mình, bỏ qua tham số dept nếu có
        scope = caller["dept"]
    return BUILDERS[key](d_from, d_to, pf, pt, scope)
