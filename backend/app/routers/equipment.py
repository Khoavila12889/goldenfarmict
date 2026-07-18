from fastapi import APIRouter, Query
from ..core.database import get_conn
from ..core.events import publish_sync

router = APIRouter(prefix="/api/equipment", tags=["equipment"])


def _conn():
    return get_conn()


def _close_history(conn, equipment_id, old_employee_id):
    old = conn.execute("SELECT employee_code FROM employees WHERE id=?", (old_employee_id,)).fetchone()
    if old:
        conn.execute(
            "UPDATE equipment_history SET return_date=date('now','localtime') "
            "WHERE equipment_id=? AND employee_code=? AND return_date=''",
            (equipment_id, old["employee_code"])
        )


def _add_history(conn, equipment_id, employee_code, employee_name):
    conn.execute(
        "INSERT INTO equipment_history (equipment_id, employee_code, employee_name, handover_date) VALUES (?, ?, ?, date('now','localtime'))",
        (equipment_id, employee_code, employee_name)
    )


@router.get("")
def list_equipment(
    storage: str = Query("all"),
    employee_id: int | None = Query(None),
    search: str = Query(""),
):
    conn = _conn()
    sql = """
        SELECT eq.*, emp.full_name, emp.department, emp.employee_code as emp_code
        FROM equipment eq
        LEFT JOIN employees emp ON emp.id=eq.employee_id
        WHERE 1=1
    """
    params = []
    if employee_id is not None:
        sql += " AND eq.employee_id=?"
        params.append(employee_id)
    if storage == "in_stock":
        sql += " AND eq.employee_id IS NULL"
    elif storage == "allocated":
        sql += " AND eq.employee_id IS NOT NULL"
    if search:
        sql += " AND (eq.equipment_type LIKE ? OR eq.specs LIKE ? OR eq.serial_number LIKE ? OR eq.asset_code LIKE ?)"
        kw = f"%{search}%"
        params.extend([kw, kw, kw, kw])
    sql += " ORDER BY eq.id DESC"
    rows = [dict(r) for r in conn.execute(sql, params).fetchall()]
    conn.close()
    return {"data": rows}


@router.post("")
def create_equipment(body: dict):
    conn = _conn()
    asset_code = body.get("asset_code", "").strip()
    if not asset_code:
        max_row = conn.execute("SELECT MAX(id) FROM equipment").fetchone()[0]
        seq = (max_row or 0) + 1
        asset_code = f"TS-{seq:05d}"
    conn.execute("""
        INSERT INTO equipment (employee_id, equipment_type, specs, os_info, serial_number,
                               asset_code, status, description, issued_date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        body.get("employee_id"),
        body.get("equipment_type", ""),
        body.get("specs", ""),
        body.get("os_info", ""),
        body.get("serial_number", ""),
        asset_code,
        body.get("status", ""),
        body.get("description", ""),
        body.get("issued_date", ""),
        body.get("notes", ""),
    ))
    conn.commit()
    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    publish_sync("equipment_created", {"id": new_id})
    return {"success": True, "id": new_id, "asset_code": asset_code}


@router.put("/{equipment_id}")
def update_equipment(equipment_id: int, body: dict):
    conn = _conn()
    fields = []
    params = []
    for col in ["equipment_type", "specs", "os_info", "serial_number", "asset_code",
                "status", "description", "notes", "issued_date"]:
        if col in body:
            fields.append(f"{col}=?")
            params.append(body[col])
    if not fields:
        conn.close()
        return {"success": False, "error": "No fields"}
    params.append(equipment_id)
    conn.execute(f"UPDATE equipment SET {', '.join(fields)}, updated_at=datetime('now','localtime') WHERE id=?", params)
    conn.commit()
    conn.close()
    return {"success": True}


@router.put("/{equipment_id}/transfer")
def transfer_equipment(equipment_id: int, body: dict):
    new_employee_id = body.get("employee_id")
    new_employee_code = body.get("employee_code", "")
    new_employee_name = body.get("employee_name", "")
    if not new_employee_id:
        return {"error": "Missing employee_id"}
    conn = _conn()
    eq = conn.execute("SELECT employee_id FROM equipment WHERE id=?", (equipment_id,)).fetchone()
    if not eq:
        conn.close()
        return {"error": "Equipment not found"}
    if eq["employee_id"]:
        _close_history(conn, equipment_id, eq["employee_id"])
    conn.execute("UPDATE equipment SET employee_id=?, issued_date=date('now','localtime') WHERE id=?", (new_employee_id, equipment_id))
    _add_history(conn, equipment_id, new_employee_code, new_employee_name)
    conn.commit()
    conn.close()
    publish_sync("equipment_updated", {"id": equipment_id, "action": "transfer"})
    return {"success": True}


@router.put("/{equipment_id}/revoke")
def revoke_equipment(equipment_id: int):
    conn = _conn()
    eq = conn.execute("SELECT employee_id FROM equipment WHERE id=?", (equipment_id,)).fetchone()
    if not eq:
        conn.close()
        return {"error": "Equipment not found"}
    if eq["employee_id"]:
        _close_history(conn, equipment_id, eq["employee_id"])
    conn.execute("UPDATE equipment SET employee_id=NULL, issued_date='', updated_at=datetime('now','localtime') WHERE id=?", (equipment_id,))
    conn.commit()
    conn.close()
    publish_sync("equipment_updated", {"id": equipment_id, "action": "revoke"})
    return {"success": True}


@router.put("/{equipment_id}/allocate")
def allocate_equipment(equipment_id: int, body: dict):
    employee_id = body.get("employee_id")
    employee_code = body.get("employee_code", "")
    employee_name = body.get("employee_name", "")
    if not employee_id:
        return {"error": "Missing employee_id"}
    conn = _conn()
    eq = conn.execute("SELECT employee_id FROM equipment WHERE id=?", (equipment_id,)).fetchone()
    if not eq:
        conn.close()
        return {"error": "Equipment not found"}
    conn.execute("UPDATE equipment SET employee_id=?, issued_date=date('now','localtime'), updated_at=datetime('now','localtime') WHERE id=?", (employee_id, equipment_id))
    _add_history(conn, equipment_id, employee_code, employee_name)
    conn.commit()
    conn.close()
    publish_sync("equipment_updated", {"id": equipment_id, "action": "allocate"})
    return {"success": True}


@router.get("/{equipment_id}")
def get_equipment(equipment_id: int):
    conn = _conn()
    row = conn.execute(
        "SELECT eq.*, emp.full_name, emp.department, emp.employee_code as emp_code "
        "FROM equipment eq LEFT JOIN employees emp ON emp.id=eq.employee_id WHERE eq.id=?",
        (equipment_id,)
    ).fetchone()
    conn.close()
    if not row:
        return {"error": "Not found"}
    return dict(row)


@router.get("/{equipment_id}/licenses")
def get_equipment_licenses(equipment_id: int):
    conn = _conn()
    rows = [dict(r) for r in conn.execute(
        "SELECT * FROM licenses WHERE equipment_id=? ORDER BY id",
        (equipment_id,)
    ).fetchall()]
    conn.close()
    return {"data": rows}


@router.get("/{equipment_id}/history")
def get_equipment_history(equipment_id: int):
    conn = _conn()
    rows = [dict(r) for r in conn.execute(
        "SELECT * FROM equipment_history WHERE equipment_id=? ORDER BY id DESC",
        (equipment_id,)
    ).fetchall()]
    conn.close()
    return {"data": rows}
