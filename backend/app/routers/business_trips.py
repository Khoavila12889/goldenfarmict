from fastapi import APIRouter, Query, HTTPException
from ..core.database import get_conn
from ..core.events import publish_sync

router = APIRouter(prefix="/api/business-trips", tags=["business_trips"])


@router.get("")
def list_trips(
    user_code: str = Query(""),
    user_role: str = Query("user"),
    user_dept: str = Query(""),
    date_from: str = Query(""),
    date_to: str = Query(""),
    status: str = Query(""),
):
    """
    Phân quyền:
    - Admin: xem tất cả
    - User: chỉ xem trong cùng bộ phận
    """
    conn = get_conn()
    sql = "SELECT * FROM business_trips WHERE 1=1"
    params = []
    
    # Nếu là user (không phải admin), chỉ xem lịch của bộ phận mình
    if user_role != "admin" and user_dept:
        sql += " AND department=?"
        params.append(user_dept)
    
    if date_from:
        sql += " AND end_date>=?"
        params.append(date_from)
    if date_to:
        sql += " AND start_date<=?"
        params.append(date_to)
    if status:
        sql += " AND status=?"
        params.append(status)
    
    sql += " ORDER BY start_date DESC"
    rows = [dict(r) for r in conn.execute(sql, params).fetchall()]
    conn.close()
    return {"data": rows}


@router.post("")
def create_trip(body: dict):
    conn = get_conn()
    conn.execute("""
        INSERT INTO business_trips (employee_code, full_name, department,
                                    destination, purpose, start_date, end_date, notes, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    """, (
        body.get("employee_code", ""), body.get("full_name", ""),
        body.get("department", ""), body.get("destination", ""),
        body.get("purpose", ""), body.get("start_date"),
        body.get("end_date"), body.get("notes", ""),
    ))
    conn.commit()
    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    publish_sync("trip_created", {"id": new_id})
    return {"success": True, "id": new_id}


@router.put("/{trip_id}")
def update_trip(trip_id: int, body: dict):
    """
    Phân quyền: chỉ người tạo được phép kết thúc/hủy
    """
    user_code = body.get("user_code", "")
    user_role = body.get("user_role", "user")
    
    conn = get_conn()
    
    # Lấy thông tin trip
    trip = conn.execute("SELECT * FROM business_trips WHERE id=?", (trip_id,)).fetchone()
    if not trip:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy lịch công tác")
    
    # Kiểm tra quyền: chỉ người tạo hoặc admin mới được phép sửa
    if user_role != "admin" and trip["employee_code"] != user_code:
        conn.close()
        raise HTTPException(status_code=403, detail="Bạn không có quyền thao tác lịch này")
    
    fields = []
    params = []
    for key in ("destination", "purpose", "start_date", "end_date", "notes", "status"):
        if key in body and key not in ("user_code", "user_role"):
            fields.append(f"{key}=?")
            params.append(body[key])
    
    if not fields:
        conn.close()
        return {"success": False, "error": "No fields to update"}
    
    if body.get("status") == "finished":
        fields.append("completed_at=datetime('now','localtime')")
    
    fields.append("updated_at=datetime('now','localtime')")
    params.append(trip_id)
    
    conn.execute(
        f"UPDATE business_trips SET {', '.join(fields)} WHERE id=?",
        params
    )
    conn.commit()
    conn.close()
    publish_sync("trip_updated", {"id": trip_id})
    return {"success": True}


@router.delete("/{trip_id}")
def delete_trip(trip_id: int, user_code: str = Query(""), user_role: str = Query("user")):
    """
    Phân quyền: chỉ người tạo được phép xóa (hoặc hủy)
    """
    conn = get_conn()
    
    # Lấy thông tin trip
    trip = conn.execute("SELECT * FROM business_trips WHERE id=?", (trip_id,)).fetchone()
    if not trip:
        conn.close()
        raise HTTPException(status_code=404, detail="Không tìm thấy lịch công tác")
    
    # Kiểm tra quyền: chỉ người tạo hoặc admin mới được phép xóa
    if user_role != "admin" and trip["employee_code"] != user_code:
        conn.close()
        raise HTTPException(status_code=403, detail="Bạn không có quyền xóa lịch này")
    
    # Thay vì xóa, đổi status thành cancelled
    conn.execute("UPDATE business_trips SET status='cancelled', updated_at=datetime('now','localtime') WHERE id=?", (trip_id,))
    conn.commit()
    conn.close()
    publish_sync("trip_deleted", {"id": trip_id})
    return {"success": True}
