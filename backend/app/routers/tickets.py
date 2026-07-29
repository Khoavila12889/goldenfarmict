from fastapi import APIRouter, Query
from ..core.db import fetchall, fetchone, execute, insert
from ..core.events import publish_sync

router = APIRouter(prefix="/api/tickets", tags=["tickets"])


@router.get("")
def list_tickets(
    status: str = Query("Tất cả"),
    priority: str = Query("Tất cả"),
    search: str = Query(""),
):
    sql = "SELECT * FROM tickets WHERE 1=1"
    params = {}
    if status != "Tất cả":
        sql += " AND status=:status"
        params["status"] = status
    if priority != "Tất cả":
        sql += " AND priority=:priority"
        params["priority"] = priority
    if search:
        sql += " AND (LOWER(full_name) LIKE LOWER(:search) OR LOWER(department) LIKE LOWER(:search) OR LOWER(title) LIKE LOWER(:search) OR LOWER(resolution) LIKE LOWER(:search))"
        params["search"] = f"%{search}%"
    sql += " ORDER BY id DESC"

    rows = fetchall(sql, params)
    return {"data": rows, "total": len(rows)}


@router.post("")
def create_ticket(body: dict):
    new_id = insert("""
        INSERT INTO tickets (employee_id, full_name, department, title, description, priority, status, employee_code)
        VALUES (:eid, :name, :dept, :title, :desc, :priority, 'Cho xu ly', :code)
        RETURNING id
    """, {
        "eid": body.get("employee_id"),
        "name": body.get("full_name", ""),
        "dept": body.get("department", ""),
        "title": body.get("title", ""),
        "desc": body.get("description", ""),
        "priority": body.get("priority", "Binh thuong"),
        "code": body.get("employee_code", ""),
    })
    publish_sync("new_ticket", {"id": new_id})
    return {"success": True, "id": new_id}


@router.put("/{ticket_id}")
def update_ticket(ticket_id: int, body: dict):
    execute("""
        UPDATE tickets SET status=:status, resolution=:res, admin_notes=:notes, updated_at=CURRENT_TIMESTAMP
        WHERE id=:tid
    """, {
        "status": body.get("status", "Cho xu ly"),
        "res": body.get("resolution", ""),
        "notes": body.get("admin_notes", ""),
        "tid": ticket_id,
    })
    publish_sync("update_ticket", {"id": ticket_id})
    return {"success": True}


@router.delete("/{ticket_id}")
def delete_ticket(ticket_id: int):
    execute("DELETE FROM tickets WHERE id=:tid", {"tid": ticket_id})
    publish_sync("delete_ticket", {"id": ticket_id})
    return {"success": True}


@router.get("/my")
def my_tickets(employee_id: int = Query(...)):
    rows = fetchall(
        "SELECT id, title, description, priority, status, resolution, admin_notes, created_at, updated_at "
        "FROM tickets WHERE employee_id=:eid ORDER BY id DESC",
        {"eid": employee_id}
    )
    return {"data": rows}


@router.get("/stats")
def ticket_stats():
    total = fetchone("SELECT COUNT(*) as cnt FROM tickets")
    pending = fetchone("SELECT COUNT(*) as cnt FROM tickets WHERE status='Cho xu ly'")
    max_id = fetchone("SELECT COALESCE(MAX(id),0) as max_id FROM tickets")
    return {"total": total["cnt"], "pending": pending["cnt"], "max_id": max_id["max_id"]}


@router.get("/queue-position")
def ticket_queue_position(user_code: str = Query('')):
    """
    Trả về vị trí của user trong hàng đợi ticket
    - pending_before: số ticket đang chờ của người khác trước user
    - total_pending: tổng số ticket đang chờ
    - user_pending: số ticket của user đang chờ
    - rank: vị trí xếp hạng (1 = đầu hàng đợi)
    """
    if not user_code:
        raise HTTPException(400, "user_code is required")

    emp = fetchone(
        "SELECT id, full_name FROM employees WHERE employee_code=:code",
        {"code": user_code.strip()}
    )

    if not emp:
        raise HTTPException(404, "User not found")

    user_id = emp['id']
    user_name = emp['full_name']

    total_pending = fetchone(
        "SELECT COUNT(*) as cnt FROM tickets WHERE status='Cho xu ly'"
    )

    user_pending = fetchone(
        "SELECT COUNT(*) as cnt FROM tickets WHERE employee_id=:eid AND status='Cho xu ly'",
        {"eid": user_id}
    )

    pending_before = fetchone(
        """
        SELECT COUNT(*) as cnt FROM tickets
        WHERE status='Cho xu ly'
          AND id < (SELECT COALESCE(MIN(id), 0) FROM tickets WHERE employee_id=:eid AND status='Cho xu ly')
        """,
        {"eid": user_id}
    )

    rank = pending_before["cnt"] + 1

    return {
        "user_code": user_code,
        "user_name": user_name,
        "total_pending": total_pending["cnt"],
        "user_pending": user_pending["cnt"],
        "pending_before": pending_before["cnt"],
        "rank": rank
    }
