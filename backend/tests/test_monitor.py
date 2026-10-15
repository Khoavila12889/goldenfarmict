from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app


client = TestClient(app)
HEADERS = {
    "X-User-Code": "admin",
    "X-User-Role": "admin",
    "X-User-Dept": "IT",
    "X-User-Token": "test-token",
}


def test_monitor_stats_requires_session():
    response = client.get("/api/monitor/stats")
    assert response.status_code == 401


def test_monitor_stats_forbids_non_admin():
    with patch("app.routers.monitor.verify_session", return_value={"user_role": "head"}):
        response = client.get("/api/monitor/stats", headers=HEADERS)
    assert response.status_code == 403


def test_monitor_stats_keeps_response_shape_and_reports_online_users(mock_db):
    def fetchone(sql, _params=None):
        if "SELECT 1 AS ok" in sql:
            return {"ok": 1}
        if "SELECT version()" in sql:
            return {"version": "PostgreSQL 16.4 on x86_64"}
        if "AS active_tables" in sql:
            return {
                "active_tables": 10,
                "active_employees": 3,
                "total_employees": 3,
                "tickets": 3,
                "tickets_pending": 1,
                "todos": 3,
                "todos_in_progress": 2,
                "bookings_active": 1,
                "approvals_pending": 1,
                "equipment": 2,
                "licenses": 2,
                "documents_configs": 1,
            }
        return {"cnt": 3}

    mock_db["fetchone"].side_effect = fetchone
    mock_db["fetchall"].return_value = []
    online = [{"employee_code": "E001", "full_name": "Test User"}]
    with (
        patch("app.routers.monitor.verify_session", return_value={"user_role": "admin"}),
        patch("app.routers.monitor._online_users", return_value=online),
    ):
        response = client.get("/api/monitor/stats", headers=HEADERS)

    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == {"api", "db", "modules", "activity", "online_users"}
    assert payload["db"]["status"] == "Connected"
    assert payload["db"]["version"] == "PostgreSQL 16.4 on x86_64"
    assert payload["modules"]["tickets"] == 3
    assert payload["online_users"] == online
    assert isinstance(payload["activity"], list)


def test_monitor_stats_uses_null_metrics_when_database_is_unavailable(mock_db):
    mock_db["fetchone"].side_effect = RuntimeError("database unavailable")
    with (
        patch("app.routers.monitor.verify_session", return_value={"user_role": "admin"}),
        patch("app.routers.monitor._online_users", return_value=[]),
    ):
        response = client.get("/api/monitor/stats", headers=HEADERS)

    assert response.status_code == 200
    payload = response.json()
    assert payload["api"]["status"] == "DEGRADED"
    assert payload["db"]["status"] == "Disconnected"
    assert payload["db"]["active_tables"] is None
    assert payload["modules"]["tickets"] is None
