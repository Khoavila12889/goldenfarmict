import json
from fastapi import APIRouter, Query
from ..core.db import fetchall, fetchone, execute

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
def dashboard_stats(user_code: str = Query(""), user_role: str = Query("")):
    total_employees = fetchone("SELECT COUNT(*) as cnt FROM employees WHERE status='active'")
    total_equipment = fetchone("SELECT COUNT(*) as cnt FROM equipment")
    pending_tickets = fetchone("SELECT COUNT(*) as cnt FROM tickets WHERE status='Cho xu ly'")
    active_bookings = fetchone("SELECT COUNT(*) as cnt FROM bookings WHERE status='active'")
    total_tickets = fetchone("SELECT COUNT(*) as cnt FROM tickets")
    total_bookings = fetchone("SELECT COUNT(*) as cnt FROM bookings")
    departments = fetchall("SELECT DISTINCT department FROM employees WHERE department != ''")

    tickets_by_dept = fetchall(
        "SELECT department, COUNT(*) as count FROM tickets WHERE department != '' GROUP BY department ORDER BY count DESC"
    )

    tickets_by_status = fetchall(
        "SELECT status, COUNT(*) as count FROM tickets GROUP BY status"
    )

    bookings_today = fetchall(
        "SELECT b.*, r.name as resource_name, r.type as resource_type FROM bookings b "
        "JOIN resources r ON r.id=b.resource_id WHERE b.book_date::date = CURRENT_DATE "
        "ORDER BY b.start_time"
    )

    # ── Lọc danh sách công tác / nghỉ phép đang hoạt động hôm nay ──
    # Nguồn 1: business_trips (đã materialize từ approval_requests)
    # Nguồn 2 (FALLBACK): approval_requests đã approved mà chưa materialize
    # → Đảm bảo hiển thị ngay cả khi _materialize_trip_from_request fail silent
    today_str = fetchone("SELECT CURRENT_DATE::text as d")["d"]

    active_absences = fetchall(
        "SELECT bt.id, bt.employee_code, bt.destination, bt.purpose, bt.start_date, bt.end_date, bt.status, bt.type, "
        "COALESCE(e.full_name, bt.full_name) as full_name, "
        "COALESCE(e.department, bt.department) as department "
        "FROM business_trips bt "
        "LEFT JOIN employees e ON bt.employee_code = e.employee_code "
        "WHERE bt.start_date IS NOT NULL AND bt.start_date != '' "
        "AND bt.end_date IS NOT NULL AND bt.end_date != '' "
        "AND bt.start_date <= :today "
        "AND bt.end_date >= :today "
        "AND bt.status IN ('active', 'approved') "
        "ORDER BY bt.start_date ASC",
        {"today": today_str}
    )

    #── Track IDs đã có trong business_trips để tránh duplicate fallback ──
    materialized_request_ids = set()
    for r in active_absences:
        if r.get("approval_request_id"):
            materialized_request_ids.add(r["approval_request_id"])

    trips_today = []
    leaves_today = []

    for trip in active_absences:
        item = {
            "id": trip.get("id"),
            "employee_code": trip.get("employee_code"),
            "full_name": trip.get("full_name") or "",
            "department": trip.get("department") or "",
            "destination": trip.get("destination") or "",
            "purpose": trip.get("purpose") or "",
            "start_date": str(trip.get("start_date")),
            "end_date": str(trip.get("end_date")),
        }
        dest_purpose = f"{trip.get('destination', '')} {trip.get('purpose', '')}".lower()
        if trip.get("type") == "leave" or "nghỉ" in dest_purpose or "phép" in dest_purpose:
            leaves_today.append(item)
        else:
            trips_today.append(item)

    # ── FALLBACK: lấy approved requests từ approval_requests nếu business_trips thiếu ──
    if not leaves_today:
        approved_leaves = fetchall(
            "SELECT ar.id, ar.requester_code, ar.requester_name, ar.requester_dept, ar.metadata_json "
            "FROM approval_requests ar "
            "WHERE ar.status = 'approved' "
            "AND ar.metadata_json IS NOT NULL "
            "AND ar.metadata_json != '' "
            "AND ar.metadata_json != 'null'",
        )
        for ar in approved_leaves:
            if ar["id"] in materialized_request_ids:
                continue
            try:
                meta = json.loads(ar.get("metadata_json") or "{}")
            except Exception:
                meta = {}
            if meta.get("kind") != "leave":
                continue
            sd = meta.get("start_date", "")
            ed = meta.get("end_date", "")
            if not sd or not ed:
                continue
            if sd <= today_str and ed >= today_str:
                leaves_today.append({
                    "id": ar["id"],
                    "employee_code": meta.get("employee_code", "") or ar.get("requester_code", ""),
                    "full_name": meta.get("full_name", "") or ar.get("requester_name", ""),
                    "department": meta.get("department", "") or ar.get("requester_dept", ""),
                    "destination": meta.get("destination", "") or "Nghỉ phép",
                    "purpose": meta.get("purpose", "") or "",
                    "start_date": sd,
                    "end_date": ed,
                })

    # ── Nhân viên ĐANG XIN nghỉ phép / công tác (approval_request chờ duyệt) ──
    # - admin: toàn công ty
    # - head: chỉ nhân viên cùng phòng ban
    # - user: chỉ đơn của chính mình
    #
    # LƯU Ý: metadata_json::jsonb có thể fail nếu metadata_json rỗng/NULL/invalid JSON.
    # → Dùng filter SQL an toàn, sau đó filter thêm ở Python.
    pending_sql = (
        "SELECT id, title, requester_code, requester_name, requester_dept, status, created_at, metadata_json "
        "FROM approval_requests "
        "WHERE status IN ('pending','in_progress') "
        "AND metadata_json IS NOT NULL "
        "AND metadata_json != '' "
        "AND metadata_json != 'null'"
    )
    pending_params = {}

    emp = fetchone(
        "SELECT department FROM employees WHERE employee_code=:code",
        {"code": user_code}
    ) if user_code else None
    dept = (emp or {}).get("department", "") if emp else ""

    if user_role == "head" and dept:
        pending_sql += " AND requester_dept=:dept"
        pending_params["dept"] = dept
    elif user_role == "user" and user_code:
        pending_sql += " AND requester_code=:code"
        pending_params["code"] = user_code

    pending_sql += " ORDER BY id DESC"
    pending_rows = fetchall(pending_sql, pending_params)

    pending_items = []
    seen_emps = set()
    for p in pending_rows:
        try:
            meta = json.loads(p.get("metadata_json") or "{}")
        except Exception:
            meta = {}
        kind = meta.get("kind", "")
        if kind not in ("leave", "business_trip"):
            continue
        code = p.get("requester_code", "")
        if code:
            seen_emps.add(code)
        pending_items.append({
            "request_id": p.get("id"),
            "employee_code": code,
            "full_name": p.get("requester_name") or "",
            "department": p.get("requester_dept") or "",
            "kind": kind,
            "title": p.get("title") or "",
            "start_date": meta.get("start_date", ""),
            "end_date": meta.get("end_date", ""),
            "status": p.get("status", ""),
            "created_at": str(p.get("created_at", "")),
        })

    return {
        "total_employees": total_employees["cnt"],
        "total_equipment": total_equipment["cnt"],
        "pending_tickets": pending_tickets["cnt"],
        "active_bookings": active_bookings["cnt"],
        "total_tickets": total_tickets["cnt"],
        "total_bookings": total_bookings["cnt"],
        "total_departments": len(departments),
        "tickets_by_dept": tickets_by_dept,
        "tickets_by_status": tickets_by_status,
        "bookings_today": bookings_today,
        "trips_today": trips_today,
        "leaves_today": leaves_today,
        "trips_count": len(trips_today),
        "leaves_count": len(leaves_today),
        "pending_absences": {
            "total_requests": len(pending_items),
            "total_employees": len(seen_emps),
            "items": pending_items,
        },
    }
