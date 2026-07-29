from fastapi import APIRouter, Query, HTTPException
from ..core.db import fetchall, fetchone, execute, insert
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
    sql = "SELECT * FROM business_trips WHERE 1=1"
    params = {}

    if user_role != "admin" and user_dept:
        sql += " AND department=:dept"
        params["dept"] = user_dept

    if date_from:
        sql += " AND end_date>=:date_from"
        params["date_from"] = date_from
    if date_to:
        sql += " AND start_date<=:date_to"
        params["date_to"] = date_to
    if status:
        sql += " AND status=:status"
        params["status"] = status

    sql += " ORDER BY start_date DESC"
    rows = fetchall(sql, params)
    return {"data": rows}


@router.post("")
def create_trip(body: dict):
    new_id = insert("""
        INSERT INTO business_trips (employee_code, full_name, department,
                                    destination, purpose, start_date, end_date, notes, status)
        VALUES (:employee_code, :full_name, :department, :destination, :purpose,
                :start_date, :end_date, :notes, 'active')
        RETURNING id
    """, {
        "employee_code": body.get("employee_code", ""),
        "full_name": body.get("full_name", ""),
        "department": body.get("department", ""),
        "destination": body.get("destination", ""),
        "purpose": body.get("purpose", ""),
        "start_date": body.get("start_date"),
        "end_date": body.get("end_date"),
        "notes": body.get("notes", ""),
    })
    publish_sync("trip_created", {"id": new_id})
    return {"success": True, "id": new_id}


@router.put("/{trip_id}")
def update_trip(trip_id: int, body: dict):
    user_code = body.get("user_code", "")
    user_role = body.get("user_role", "user")

    trip = fetchone("SELECT * FROM business_trips WHERE id=:trip_id", {"trip_id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Không tìm thấy lịch công tác")

    if user_role != "admin" and trip["employee_code"] != user_code:
        raise HTTPException(status_code=403, detail="Bạn không có quyền thao tác lịch này")

    fields = []
    params = {}
    for key in ("destination", "purpose", "start_date", "end_date", "notes", "status"):
        if key in body and key not in ("user_code", "user_role"):
            fields.append(f"{key}=:{key}")
            params[key] = body[key]

    if not fields:
        return {"success": False, "error": "No fields to update"}

    if body.get("status") == "finished":
        fields.append("completed_at=CURRENT_TIMESTAMP::text")

    fields.append("updated_at=CURRENT_TIMESTAMP::text")
    params["trip_id"] = trip_id

    execute(f"UPDATE business_trips SET {', '.join(fields)} WHERE id=:trip_id", params)
    publish_sync("trip_updated", {"id": trip_id})
    return {"success": True}


@router.delete("/{trip_id}")
def delete_trip(trip_id: int, user_code: str = Query(""), user_role: str = Query("user")):
    trip = fetchone("SELECT * FROM business_trips WHERE id=:trip_id", {"trip_id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Không tìm thấy lịch công tác")

    if user_role != "admin" and trip["employee_code"] != user_code:
        raise HTTPException(status_code=403, detail="Bạn không có quyền xóa lịch này")

    execute("UPDATE business_trips SET status='cancelled', updated_at=CURRENT_TIMESTAMP::text WHERE id=:trip_id", {"trip_id": trip_id})
    publish_sync("trip_deleted", {"id": trip_id})
    return {"success": True}
