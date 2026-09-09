from typing import Optional
from fastapi import APIRouter, Query, Header, HTTPException
from ..core.db import fetchall, fetchone, execute, insert
from ..core.events import publish_sync
from ..core.auth import verify_session
from .auth import _get_effective_permissions

router = APIRouter(prefix="/api/bookings", tags=["bookings"])


def _require_resource_admin(
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
) -> dict:
    """User system admin hoặc có quyền bookings.can_edit mới được quản lý tài nguyên."""
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    if user["user_role"] == "admin":
        return user
    perms = _get_effective_permissions(user["user_code"])
    if not (perms.get("bookings") or {}).get("can_edit"):
        raise HTTPException(status_code=403, detail="Bạn không có quyền quản lý tài nguyên lịch")
    return user


def _resolve_user_info(
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
) -> dict:
    """Resolve authenticated user info for booking creation. Returns user dict."""
    return verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)


@router.get("")
def list_bookings(
    date: str = Query(""),
    resource_type: str = Query("all"),
    status: str = Query("all"),
):
    sql = """
        SELECT b.*, r.name as resource_name, r.type as resource_type
        FROM bookings b JOIN resources r ON r.id = b.resource_id WHERE 1=1
    """
    params = {}
    if date:
        sql += " AND b.book_date=:date"
        params["date"] = date
    if resource_type != "all":
        sql += " AND r.type=:rtype"
        params["rtype"] = resource_type
    if status != "all":
        sql += " AND b.status=:status"
        params["status"] = status
    sql += " ORDER BY b.start_time ASC"

    rows = fetchall(sql, params)
    return {"data": rows}


@router.post("")
def create_booking(
    body: dict,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    # Authenticate user
    user = _resolve_user_info(x_user_code, x_user_role, x_user_dept, x_user_token)
    user_code = user["user_code"]
    full_name = user["full_name"]
    department = user["department"]

    # Validate required fields
    resource_id = body.get("resource_id")
    book_date = body.get("book_date")
    start_time = body.get("start_time")
    end_time = body.get("end_time")
    title = body.get("title", "").strip()

    if not resource_id or not book_date or not start_time or not end_time:
        raise HTTPException(status_code=400, detail="Thiếu thông tin bắt buộc: resource_id, book_date, start_time, end_time")
    if not title:
        raise HTTPException(status_code=400, detail="Vui lòng nhập mục đích đặt lịch")

    # Resolve employee info from user_code
    emp = fetchone(
        "SELECT id, employee_code, full_name, department FROM employees WHERE employee_code = :code",
        {"code": user_code}
    )
    employee_id = emp["id"] if emp else None
    emp_full_name = emp["full_name"] if emp else full_name
    emp_department = emp["department"] if emp else department

    # Use authenticated user's info (overrides body data for security/accuracy)
    new_id = insert("""
        INSERT INTO bookings (resource_id, title, employee_id, full_name, department,
                              book_date, start_time, end_time, status, notes, created_at)
        VALUES (:rid, :title, :eid, :name, :dept, :date, :st, :et, 'active', :notes, CURRENT_TIMESTAMP)
        RETURNING id
    """, {
        "rid": int(resource_id),
        "title": title,
        "eid": employee_id,
        "name": emp_full_name,
        "dept": emp_department,
        "date": book_date,
        "st": start_time,
        "et": end_time,
        "notes": body.get("notes", "").strip(),
    })
    publish_sync("booking_created", {"id": new_id})
    return {"success": True, "id": new_id}


@router.put("/{booking_id}")
def update_booking(booking_id: int, body: dict):
    new_status = body.get("status", "active")
    extra = ", completed_at=CURRENT_TIMESTAMP" if new_status == "finished" else ""
    execute(
        f"UPDATE bookings SET status=:status, updated_at=CURRENT_TIMESTAMP{extra} WHERE id=:bid",
        {"status": new_status, "bid": booking_id}
    )
    publish_sync("booking_updated", {"id": booking_id, "status": new_status})
    return {"success": True}


@router.get("/resources")
def list_resources():
    resources = fetchall(
        "SELECT r.*, (SELECT COUNT(*) FROM bookings WHERE resource_id=r.id) as booking_count "
        "FROM resources r ORDER BY r.type, r.name"
    )
    return {"data": resources}


@router.post("/resources")
def create_resource(
    body: dict,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    _require_resource_admin(x_user_code, x_user_role, x_user_dept, x_user_token)
    resource_type = body.get("type", "car")
    name = body.get("name", "").strip()
    description = body.get("description", "").strip()
    if not name:
        return {"success": False, "error": "Tên tài nguyên không được để trống"}
    new_id = insert(
        "INSERT INTO resources (type, name, description) VALUES (:type, :name, :desc) RETURNING id",
        {"type": resource_type, "name": name, "desc": description}
    )
    return {"success": True, "id": new_id}


@router.delete("/resources/{resource_id}")
def delete_resource(
    resource_id: int,
    x_user_code: Optional[str] = Header(None, alias="X-User-Code"),
    x_user_role: Optional[str] = Header(None, alias="X-User-Role"),
    x_user_dept: Optional[str] = Header(None, alias="X-User-Dept"),
    x_user_token: Optional[str] = Header(None, alias="X-User-Token"),
):
    _require_resource_admin(x_user_code, x_user_role, x_user_dept, x_user_token)
    row = fetchone("SELECT COUNT(*) as cnt FROM bookings WHERE resource_id=:rid", {"rid": resource_id})
    deleted_bookings = row["cnt"] if row else 0
    if deleted_bookings > 0:
        execute("DELETE FROM bookings WHERE resource_id=:rid", {"rid": resource_id})
    execute("DELETE FROM resources WHERE id=:rid", {"rid": resource_id})
    return {"success": True, "deleted_bookings": deleted_bookings}


@router.get("/dates")
def booking_dates():
    rows = fetchall("SELECT DISTINCT book_date FROM bookings ORDER BY book_date")
    return {"data": [r['book_date'] for r in rows]}


@router.get("/overlap")
def check_overlap(resource_id: int = Query(...), date: str = Query(...),
                  start_time: str = Query(...), end_time: str = Query(...)):
    row = fetchone("""
        SELECT COUNT(*) as cnt FROM bookings
        WHERE resource_id=:rid AND book_date=:date AND status='active'
        AND start_time < :et AND end_time > :st
    """, {"rid": resource_id, "date": date, "et": end_time, "st": start_time})
    return {"overlap": row["cnt"] > 0}
