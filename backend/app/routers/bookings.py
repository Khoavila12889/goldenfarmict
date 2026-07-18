from fastapi import APIRouter, Query
from ..core.database import get_conn
from ..core.events import publish_sync

router = APIRouter(prefix="/api/bookings", tags=["bookings"])


@router.get("")
def list_bookings(
    date: str = Query(""),
    resource_type: str = Query("all"),
    status: str = Query("all"),
):
    conn = get_conn()
    sql = """
        SELECT b.*, r.name as resource_name, r.type as resource_type
        FROM bookings b JOIN resources r ON r.id = b.resource_id WHERE 1=1
    """
    params = []
    if date:
        sql += " AND b.book_date=?"
        params.append(date)
    if resource_type != "all":
        sql += " AND r.type=?"
        params.append(resource_type)
    if status != "all":
        sql += " AND b.status=?"
        params.append(status)
    sql += " ORDER BY b.start_time ASC"

    rows = [dict(r) for r in conn.execute(sql, params).fetchall()]
    return {"data": rows}


@router.post("")
def create_booking(body: dict):
    conn = get_conn()
    conn.execute("""
        INSERT INTO bookings (resource_id, title, employee_id, full_name, department,
                              book_date, start_time, end_time, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    """, (
        body["resource_id"], body.get("title", ""), body.get("employee_id"),
        body.get("full_name", ""), body.get("department", ""),
        body.get("book_date"), body.get("start_time"), body.get("end_time"),
        body.get("notes", ""),
    ))
    conn.commit()
    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    publish_sync("booking_created", {"id": new_id})
    return {"success": True, "id": new_id}


@router.put("/{booking_id}")
def update_booking(booking_id: int, body: dict):
    conn = get_conn()
    new_status = body.get("status", "active")
    extra = ", completed_at=datetime('now','localtime')" if new_status == "finished" else ""
    conn.execute(
        f"UPDATE bookings SET status=?, updated_at=datetime('now','localtime'){extra} WHERE id=?",
        (new_status, booking_id)
    )
    conn.commit()
    publish_sync("booking_updated", {"id": booking_id, "status": new_status})
    return {"success": True}


@router.get("/resources")
def list_resources():
    conn = get_conn()
    resources = [dict(r) for r in conn.execute(
        "SELECT r.*, (SELECT COUNT(*) FROM bookings WHERE resource_id=r.id) as booking_count "
        "FROM resources r ORDER BY r.type, r.name"
    ).fetchall()]
    return {"data": resources}


@router.post("/resources")
def create_resource(body: dict):
    conn = get_conn()
    resource_type = body.get("type", "car")
    name = body.get("name", "").strip()
    description = body.get("description", "").strip()
    if not name:
        return {"success": False, "error": "Tên tài nguyên không được để trống"}
    conn.execute(
        "INSERT INTO resources (type, name, description) VALUES (?, ?, ?)",
        (resource_type, name, description)
    )
    conn.commit()
    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    return {"success": True, "id": new_id}


@router.delete("/resources/{resource_id}")
def delete_resource(resource_id: int):
    conn = get_conn()
    row = conn.execute("SELECT COUNT(*) as cnt FROM bookings WHERE resource_id=?", (resource_id,)).fetchone()
    if row and row["cnt"] > 0:
        return {"success": False, "error": f"Không thể xoá — tài nguyên đang có {row['cnt']} lịch đặt."}
    conn.execute("DELETE FROM resources WHERE id=?", (resource_id,))
    conn.commit()
    return {"success": True}


@router.get("/dates")
def booking_dates():
    conn = get_conn()
    rows = conn.execute("SELECT DISTINCT book_date FROM bookings ORDER BY book_date").fetchall()
    return {"data": [r['book_date'] for r in rows]}


@router.get("/overlap")
def check_overlap(resource_id: int = Query(...), date: str = Query(...),
                  start_time: str = Query(...), end_time: str = Query(...)):
    conn = get_conn()
    row = conn.execute("""
        SELECT COUNT(*) FROM bookings
        WHERE resource_id=? AND book_date=? AND status='active'
        AND start_time < ? AND end_time > ?
    """, (resource_id, date, end_time, start_time)).fetchone()
    return {"overlap": row[0] > 0}
