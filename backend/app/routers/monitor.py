"""
Monitor Router - System monitoring dashboard for admins.

Provides real-time system statistics: DB health, uptime, module counts,
and recent activity feed. Used by the frontend MonitorPage.
"""
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException

from ..core.auth import verify_session
from ..core.db import fetchall, fetchone

router = APIRouter(prefix="/api/monitor", tags=["monitor"])

_START_TIME = time.time()


def _chat_manager():
    """Import ConnectionManager của chat (tránh vòng lặp import tại module top-level)."""
    try:
        from .chat import manager as chat_manager
        return chat_manager
    except Exception:
        return None


def _online_users() -> list:
    """Users có ít nhất một WebSocket chat đã xác thực và còn được manager giữ.

    chat_ws gửi heartbeat mỗi 25 giây, loại kết nối nếu last_seen quá 60 giây;
    sweeper chạy mỗi 15 giây nên một socket mất kết nối có thể còn trong danh
    sách tối đa khoảng 75 giây.
    """
    mgr = _chat_manager()
    if mgr is None:
        return []
    codes = mgr.active_connections()
    if not codes:
        return []
    try:
        params = {f"code_{index}": code for index, code in enumerate(codes)}
        placeholders = ", ".join(f":code_{index}" for index in range(len(codes)))
        rows = fetchall(
            "SELECT employee_code, full_name, department, position FROM employees "
            f"WHERE employee_code IN ({placeholders}) AND (status = 'active' OR status = '')",
            params,
        )
        info = {r["employee_code"]: r for r in rows}
        return [
            {
                "employee_code": code,
                "full_name": info.get(code, {}).get("full_name") or code,
                "department": info.get(code, {}).get("department") or "",
                "position": info.get(code, {}).get("position") or "",
            }
            for code in codes
        ]
    except Exception:
        return [{"employee_code": c, "full_name": c, "department": "", "position": ""} for c in codes]


def _db_healthy() -> bool:
    try:
        fetchone("SELECT 1 AS ok")
        return True
    except Exception:
        return False


def _database_version() -> str | None:
    try:
        row = fetchone("SELECT version() AS version")
        version = row.get("version") if row else None
        return str(version).split(",", 1)[0] if version else None
    except Exception:
        return None


@router.get("/stats")
def monitor_stats(
    x_user_code: str | None = Header(None, alias="X-User-Code"),
    x_user_role: str | None = Header(None, alias="X-User-Role"),
    x_user_dept: str | None = Header(None, alias="X-User-Dept"),
    x_user_token: str | None = Header(None, alias="X-User-Token"),
):
    user = verify_session(x_user_code, x_user_role, x_user_dept, x_user_token)
    if (user.get("user_role") or user.get("role")) != "admin":
        raise HTTPException(status_code=403, detail="Chỉ quản trị viên được xem thống kê hệ thống")

    db_ok = _db_healthy()

    if db_ok:
        try:
            counts = fetchone(
                "SELECT "
                "(SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') AS active_tables, "
                "(SELECT COUNT(*) FROM employees WHERE status='active') AS active_employees, "
                "(SELECT COUNT(*) FROM employees) AS total_employees, "
                "(SELECT COUNT(*) FROM tickets) AS tickets, "
                "(SELECT COUNT(*) FROM tickets WHERE status='Cho xu ly') AS tickets_pending, "
                "(SELECT COUNT(*) FROM todos) AS todos, "
                "(SELECT COUNT(*) FROM todos WHERE status='in_progress') AS todos_in_progress, "
                "(SELECT COUNT(*) FROM bookings WHERE status='active') AS bookings_active, "
                "(SELECT COUNT(*) FROM approval_requests WHERE status IN ('pending','in_progress')) AS approvals_pending, "
                "(SELECT COUNT(*) FROM equipment) AS equipment, "
                "(SELECT COUNT(*) FROM licenses) AS licenses, "
                "(SELECT COUNT(*) FROM storage_config WHERE is_active = TRUE) AS documents_configs"
            ) or {}
        except Exception:
            # Keep the database connectivity state separate from missing/failed
            # module tables; unknown metrics render as -- on the client.
            counts = {}
        db = {
            "status": "Connected",
            "version": _database_version(),
            "active_tables": counts.get("active_tables"),
            "active_employees": counts.get("active_employees"),
            "total_employees": counts.get("total_employees"),
        }
        module_counts = {
            "tickets": counts.get("tickets"),
            "tickets_pending": counts.get("tickets_pending"),
            "todos": counts.get("todos"),
            "todos_in_progress": counts.get("todos_in_progress"),
            "bookings_active": counts.get("bookings_active"),
            "approvals_pending": counts.get("approvals_pending"),
            "equipment": counts.get("equipment"),
            "licenses": counts.get("licenses"),
            "documents_configs": counts.get("documents_configs"),
        }
        recent_activity = fetchall(
            "SELECT * FROM ("
            "  SELECT 'ticket' AS type, title, status, updated_at FROM tickets"
            "  UNION ALL"
            "  SELECT 'todo' AS type, title, status, updated_at FROM todos"
            "  UNION ALL"
            "  SELECT 'approval' AS type, title, status, updated_at FROM approval_requests"
            ") t ORDER BY updated_at DESC LIMIT 20"
        )
    else:
        db = {"status": "Disconnected", "version": None, "active_tables": None,
              "active_employees": None, "total_employees": None}
        module_counts = {
            "tickets": None, "tickets_pending": None, "todos": None, "todos_in_progress": None,
            "bookings_active": None, "approvals_pending": None, "equipment": None,
            "licenses": None, "documents_configs": None,
        }
        recent_activity = []

    uptime_sec = int(time.time() - _START_TIME)
    return {
        "api": {
            "status": "OK" if db_ok else "DEGRADED",
            "app": "GOLDENFARM ICT API",
            "version": "2.0.0",
            "uptime_sec": uptime_sec,
            "started_at": datetime.fromtimestamp(_START_TIME, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "server_time": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        "db": db,
        "modules": module_counts,
        "activity": recent_activity,
        "online_users": _online_users(),
    }
