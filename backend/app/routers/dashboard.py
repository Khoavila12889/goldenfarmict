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
        "JOIN resources r ON r.id=b.resource_id WHERE b.book_date=CURRENT_DATE "
        "ORDER BY b.start_time"
    )

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
    }
