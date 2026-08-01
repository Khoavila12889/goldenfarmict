"""
Monitor Router - System monitoring dashboard for admins.

Provides real-time system statistics: DB health, uptime, module counts,
and recent activity feed. Used by the frontend MonitorPage.
"""
import time
from datetime import datetime, timezone

from fastapi import APIRouter

from ..core.db import fetchall, fetchone

router = APIRouter(prefix="/api/monitor", tags=["monitor"])

_START_TIME = time.time()


def _db_healthy() -> bool:
    try:
        fetchone("SELECT 1 AS ok")
        return True
    except Exception:
        return False


@router.get("/stats")
def monitor_stats():
    db_ok = _db_healthy()

    def cnt(sql: str, params: dict | None = None) -> int:
        try:
            return fetchone(sql, params or {})["cnt"]
        except Exception:
            return 0

    if db_ok:
        db = {
            "status": "Connected",
            "version": "PostgreSQL 16",
            "active_tables": cnt("SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'"),
            "active_employees": cnt("SELECT COUNT(*) as cnt FROM employees WHERE status='active'"),
            "total_employees": cnt("SELECT COUNT(*) as cnt FROM employees"),
        }
        module_counts = {
            "tickets": cnt("SELECT COUNT(*) as cnt FROM tickets"),
            "tickets_pending": cnt("SELECT COUNT(*) as cnt FROM tickets WHERE status='Cho xu ly'"),
            "todos": cnt("SELECT COUNT(*) as cnt FROM todos"),
            "todos_in_progress": cnt("SELECT COUNT(*) as cnt FROM todos WHERE status='in_progress'"),
            "bookings_active": cnt("SELECT COUNT(*) as cnt FROM bookings WHERE status='active'"),
            "approvals_pending": cnt("SELECT COUNT(*) as cnt FROM approval_requests WHERE status IN ('pending','in_progress')"),
            "equipment": cnt("SELECT COUNT(*) as cnt FROM equipment"),
            "licenses": cnt("SELECT COUNT(*) as cnt FROM licenses"),
            "documents_configs": cnt("SELECT COUNT(*) as cnt FROM storage_config WHERE is_active = TRUE"),
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
        db = {"status": "Disconnected", "version": "n/a", "active_tables": 0,
              "active_employees": 0, "total_employees": 0}
        module_counts = {
            "tickets": 0, "tickets_pending": 0, "todos": 0, "todos_in_progress": 0,
            "bookings_active": 0, "approvals_pending": 0, "equipment": 0,
            "licenses": 0, "documents_configs": 0,
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
    }
