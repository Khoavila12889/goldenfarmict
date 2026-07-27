from fastapi import APIRouter, Query
from ..core.db import fetchall, fetchone, execute, insert
from ..core.events import publish_sync

router = APIRouter(prefix="/api/equipment", tags=["equipment"])


def _close_history(equipment_id, old_employee_id):
    old = fetchone("SELECT employee_code FROM employees WHERE id=:eid", {"eid": old_employee_id})
    if old:
        execute(
            "UPDATE equipment_history SET return_date=CURRENT_DATE "
            "WHERE equipment_id=:eid AND employee_code=:code AND return_date=''",
            {"eid": equipment_id, "code": old["employee_code"]}
        )


def _add_history(equipment_id, employee_code, employee_name):
    execute(
        "INSERT INTO equipment_history (equipment_id, employee_code, employee_name, handover_date) "
        "VALUES (:eid, :code, :name, CURRENT_DATE)",
        {"eid": equipment_id, "code": employee_code, "name": employee_name}
    )


@router.get("")
def list_equipment(
    storage: str = Query("all"),
    employee_id: int | None = Query(None),
    search: str = Query(""),
):
    sql = """
        SELECT eq.*, emp.full_name, emp.department, emp.employee_code as emp_code
        FROM equipment eq
        LEFT JOIN employees emp ON emp.id=eq.employee_id
        WHERE 1=1
    """
    params = {}
    if employee_id is not None:
        sql += " AND eq.employee_id=:employee_id"
        params["employee_id"] = employee_id
    if storage == "in_stock":
        sql += " AND eq.employee_id IS NULL"
    elif storage == "allocated":
        sql += " AND eq.employee_id IS NOT NULL"
    if search:
        sql += " AND (eq.equipment_type ILIKE :search OR eq.specs ILIKE :search OR eq.serial_number ILIKE :search OR eq.asset_code ILIKE :search)"
        params["search"] = f"%{search}%"
    sql += " ORDER BY eq.id DESC"
    rows = fetchall(sql, params)
    return {"data": rows}


@router.post("")
def create_equipment(body: dict):
    asset_code = body.get("asset_code", "").strip()
    if not asset_code:
        max_row = fetchone("SELECT MAX(id) as max_id FROM equipment")
        seq = (max_row["max_id"] or 0) + 1
        asset_code = f"TS-{seq:05d}"
    new_id = insert("""
        INSERT INTO equipment (employee_id, equipment_type, specs, os_info, serial_number,
                               asset_code, status, description, issued_date, notes)
        VALUES (:eid, :type, :specs, :os, :sn, :ac, :status, :desc, :issued, :notes)
        RETURNING id
    """, {
        "eid": body.get("employee_id"),
        "type": body.get("equipment_type", ""),
        "specs": body.get("specs", ""),
        "os": body.get("os_info", ""),
        "sn": body.get("serial_number", ""),
        "ac": asset_code,
        "status": body.get("status", ""),
        "desc": body.get("description", ""),
        "issued": body.get("issued_date", ""),
        "notes": body.get("notes", ""),
    })
    publish_sync("equipment_created", {"id": new_id})
    return {"success": True, "id": new_id, "asset_code": asset_code}


@router.put("/{equipment_id}")
def update_equipment(equipment_id: int, body: dict):
    fields = []
    params = {}
    for col in ["equipment_type", "specs", "os_info", "serial_number", "asset_code",
                "status", "description", "notes", "issued_date"]:
        if col in body:
            fields.append(f"{col}=:{col}")
            params[col] = body[col]
    if not fields:
        return {"success": False, "error": "No fields"}
    params["eid"] = equipment_id
    execute(f"UPDATE equipment SET {', '.join(fields)}, updated_at=CURRENT_TIMESTAMP WHERE id=:eid", params)
    return {"success": True}


@router.put("/{equipment_id}/transfer")
def transfer_equipment(equipment_id: int, body: dict):
    new_employee_id = body.get("employee_id")
    new_employee_code = body.get("employee_code", "")
    new_employee_name = body.get("employee_name", "")
    if not new_employee_id:
        return {"error": "Missing employee_id"}
    eq = fetchone("SELECT employee_id FROM equipment WHERE id=:eid", {"eid": equipment_id})
    if not eq:
        return {"error": "Equipment not found"}
    if eq["employee_id"]:
        _close_history(equipment_id, eq["employee_id"])
    execute("UPDATE equipment SET employee_id=:eid2, issued_date=CURRENT_DATE WHERE id=:eid",
            {"eid2": new_employee_id, "eid": equipment_id})
    _add_history(equipment_id, new_employee_code, new_employee_name)
    publish_sync("equipment_updated", {"id": equipment_id, "action": "transfer"})
    return {"success": True}


@router.put("/{equipment_id}/revoke")
def revoke_equipment(equipment_id: int):
    eq = fetchone("SELECT employee_id FROM equipment WHERE id=:eid", {"eid": equipment_id})
    if not eq:
        return {"error": "Equipment not found"}
    if eq["employee_id"]:
        _close_history(equipment_id, eq["employee_id"])
    execute("UPDATE equipment SET employee_id=NULL, issued_date='', updated_at=CURRENT_TIMESTAMP WHERE id=:eid", {"eid": equipment_id})
    publish_sync("equipment_updated", {"id": equipment_id, "action": "revoke"})
    return {"success": True}


@router.put("/{equipment_id}/allocate")
def allocate_equipment(equipment_id: int, body: dict):
    employee_id = body.get("employee_id")
    employee_code = body.get("employee_code", "")
    employee_name = body.get("employee_name", "")
    if not employee_id:
        return {"error": "Missing employee_id"}
    eq = fetchone("SELECT employee_id FROM equipment WHERE id=:eid", {"eid": equipment_id})
    if not eq:
        return {"error": "Equipment not found"}
    execute("UPDATE equipment SET employee_id=:eid2, issued_date=CURRENT_DATE, updated_at=CURRENT_TIMESTAMP WHERE id=:eid",
            {"eid2": employee_id, "eid": equipment_id})
    _add_history(equipment_id, employee_code, employee_name)
    publish_sync("equipment_updated", {"id": equipment_id, "action": "allocate"})
    return {"success": True}


@router.get("/{equipment_id}")
def get_equipment(equipment_id: int):
    row = fetchone(
        "SELECT eq.*, emp.full_name, emp.department, emp.employee_code as emp_code "
        "FROM equipment eq LEFT JOIN employees emp ON emp.id=eq.employee_id WHERE eq.id=:eid",
        {"eid": equipment_id}
    )
    if not row:
        return {"error": "Not found"}
    return row


@router.get("/{equipment_id}/licenses")
def get_equipment_licenses(equipment_id: int):
    rows = fetchall(
        "SELECT * FROM licenses WHERE equipment_id=:eid ORDER BY id",
        {"eid": equipment_id}
    )
    return {"data": rows}


@router.get("/{equipment_id}/history")
def get_equipment_history(equipment_id: int):
    rows = fetchall(
        "SELECT * FROM equipment_history WHERE equipment_id=:eid ORDER BY id DESC",
        {"eid": equipment_id}
    )
    return {"data": rows}
