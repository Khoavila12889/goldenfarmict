from fastapi import APIRouter, Query
from ..core.database import get_conn
from ..core.events import publish_sync

router = APIRouter(prefix="/api/tickets", tags=["tickets"])


@router.get("")
def list_tickets(
    status: str = Query("Tất cả"),
    priority: str = Query("Tất cả"),
    search: str = Query(""),
):
    conn = get_conn()
    sql = "SELECT * FROM tickets WHERE 1=1"
    params = []
    if status != "Tất cả":
        sql += " AND status=?"
        params.append(status)
    if priority != "Tất cả":
        sql += " AND priority=?"
        params.append(priority)
    if search:
        sql += " AND (full_name LIKE ? OR department LIKE ? OR title LIKE ? OR resolution LIKE ?)"
        kw = f"%{search}%"
        params.extend([kw, kw, kw, kw])
    sql += " ORDER BY id DESC"

    rows = [dict(r) for r in conn.execute(sql, params).fetchall()]
    return {"data": rows, "total": len(rows)}


@router.post("")
def create_ticket(body: dict):
    conn = get_conn()
    conn.execute("""
        INSERT INTO tickets (employee_id, full_name, department, title, description, priority, status, employee_code)
        VALUES (?, ?, ?, ?, ?, ?, 'Cho xu ly', ?)
    """, (
        body.get("employee_id"),
        body.get("full_name", ""),
        body.get("department", ""),
        body.get("title", ""),
        body.get("description", ""),
        body.get("priority", "Binh thuong"),
        body.get("employee_code", ""),
    ))
    conn.commit()
    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    publish_sync("new_ticket", {"id": new_id})
    return {"success": True, "id": new_id}


@router.put("/{ticket_id}")
def update_ticket(ticket_id: int, body: dict):
    conn = get_conn()
    conn.execute("""
        UPDATE tickets SET status=?, resolution=?, admin_notes=?, updated_at=datetime('now','localtime')
        WHERE id=?
    """, (
        body.get("status", "Cho xu ly"),
        body.get("resolution", ""),
        body.get("admin_notes", ""),
        ticket_id,
    ))
    conn.commit()
    publish_sync("update_ticket", {"id": ticket_id})
    return {"success": True}


@router.delete("/{ticket_id}")
def delete_ticket(ticket_id: int):
    conn = get_conn()
    conn.execute("DELETE FROM tickets WHERE id=?", (ticket_id,))
    conn.commit()
    publish_sync("delete_ticket", {"id": ticket_id})
    return {"success": True}


@router.get("/my")
def my_tickets(employee_id: int = Query(...)):
    conn = get_conn()
    rows = [dict(r) for r in conn.execute(
        "SELECT id, title, description, priority, status, resolution, admin_notes, created_at, updated_at "
        "FROM tickets WHERE employee_id=? ORDER BY id DESC",
        (employee_id,)
    ).fetchall()]
    return {"data": rows}


@router.get("/stats")
def ticket_stats():
    conn = get_conn()
    total = conn.execute("SELECT COUNT(*) FROM tickets").fetchone()[0]
    pending = conn.execute("SELECT COUNT(*) FROM tickets WHERE status='Cho xu ly'").fetchone()[0]
    max_id = conn.execute("SELECT COALESCE(MAX(id),0) FROM tickets").fetchone()[0]
    return {"total": total, "pending": pending, "max_id": max_id}


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
    
    conn = get_conn()
    
    # Lấy user employee_id
    emp = conn.execute(
        "SELECT id, full_name FROM employees WHERE employee_code=?",
        (user_code.strip(),)
    ).fetchone()
    
    if not emp:
        conn.close()
        raise HTTPException(404, "User not found")
    
    user_id = emp['id']
    user_name = emp['full_name']
    
    # Tổng số ticket đang chờ
    total_pending = conn.execute(
        "SELECT COUNT(*) FROM tickets WHERE status='Cho xu ly'"
    ).fetchone()[0]
    
    # Số ticket của user đang chờ
    user_pending = conn.execute(
        "SELECT COUNT(*) FROM tickets WHERE employee_id=? AND status='Cho xu ly'",
        (user_id,)
    ).fetchone()[0]
    
    # Số ticket của người khác đang chờ (được xếp trước user)
    # Dựa vào id (ticket cũ có id nhỏ hơn, được xử lý trước)
    pending_before = conn.execute(
        """
        SELECT COUNT(*) FROM tickets 
        WHERE status='Cho xu ly' 
          AND id < (SELECT COALESCE(MIN(id), 0) FROM tickets WHERE employee_id=? AND status='Cho xu ly')
        """,
        (user_id,)
    ).fetchone()[0]
    
    # Rank: position trong hàng đợi = pending_before + 1
    rank = pending_before + 1
    
    conn.close()
    
    return {
        "user_code": user_code,
        "user_name": user_name,
        "total_pending": total_pending,
        "user_pending": user_pending,
        "pending_before": pending_before,
        "rank": rank
    }
