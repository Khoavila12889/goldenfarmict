from fastapi import APIRouter
from ..core.db import fetchall, fetchone, execute

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
def dashboard_stats():
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

    # Lọc danh sách công tác / nghỉ phép đang hoạt động hôm nay
    # Status active hoặc approved (hỗ trợ cả active và approved)
    active_absences = fetchall(
        "SELECT bt.id, bt.employee_code, bt.destination, bt.purpose, bt.start_date, bt.end_date, bt.status, "
        "COALESCE(e.full_name, bt.full_name) as full_name, "
        "COALESCE(e.department, bt.department) as department "
        "FROM business_trips bt "
        "LEFT JOIN employees e ON bt.employee_code = e.employee_code "
        "WHERE bt.start_date <= CURRENT_DATE::text "
        "AND bt.end_date >= CURRENT_DATE::text "
        "AND bt.status IN ('active', 'approved') "
        "ORDER BY bt.start_date ASC"
    )

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
    }
