from fastapi import APIRouter
from ..core.database import get_conn

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
def dashboard_stats():
    conn = get_conn()
    total_employees = conn.execute("SELECT COUNT(*) FROM employees WHERE status='active'").fetchone()[0]
    total_equipment = conn.execute("SELECT COUNT(*) FROM equipment").fetchone()[0]
    pending_tickets = conn.execute("SELECT COUNT(*) FROM tickets WHERE status='Cho xu ly'").fetchone()[0]
    active_bookings = conn.execute("SELECT COUNT(*) FROM bookings WHERE status='active'").fetchone()[0]
    total_tickets = conn.execute("SELECT COUNT(*) FROM tickets").fetchone()[0]
    total_bookings = conn.execute("SELECT COUNT(*) FROM bookings").fetchone()[0]
    departments = conn.execute("SELECT DISTINCT department FROM employees WHERE department != ''").fetchall()

    tickets_by_dept = [dict(r) for r in conn.execute(
        "SELECT department, COUNT(*) as count FROM tickets WHERE department != '' GROUP BY department ORDER BY count DESC"
    ).fetchall()]

    tickets_by_status = [dict(r) for r in conn.execute(
        "SELECT status, COUNT(*) as count FROM tickets GROUP BY status"
    ).fetchall()]

    bookings_today = [dict(r) for r in conn.execute(
        "SELECT b.*, r.name as resource_name, r.type as resource_type FROM bookings b "
        "JOIN resources r ON r.id=b.resource_id WHERE b.book_date=date('now','localtime') "
        "ORDER BY b.start_time"
    ).fetchall()]

    return {
        "total_employees": total_employees,
        "total_equipment": total_equipment,
        "pending_tickets": pending_tickets,
        "active_bookings": active_bookings,
        "total_tickets": total_tickets,
        "total_bookings": total_bookings,
        "total_departments": len(departments),
        "tickets_by_dept": tickets_by_dept,
        "tickets_by_status": tickets_by_status,
        "bookings_today": bookings_today,
    }
