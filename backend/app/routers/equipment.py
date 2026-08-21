from fastapi import APIRouter, Query, HTTPException
from sqlalchemy import text
from ..core.db import fetchall, fetchone, execute, insert
from ..core.events import publish_sync
from ..core.session import SessionLocal

router = APIRouter(prefix="/api/equipment", tags=["equipment"])

_EQUIPMENT_COLS = [
    "equipment_type", "specs", "os_info", "serial_number",
    "status", "description", "notes", "issued_date",
    "purchase_date", "purchase_cost", "lifecycle_status",
]


def _norm(v):
    return "" if v is None else str(v).strip()


def _close_history(equipment_id, old_employee_id):
    old = fetchone("SELECT employee_code FROM employees WHERE id=:eid", {"eid": old_employee_id})
    if old:
        execute(
            "UPDATE equipment_history SET return_date=CURRENT_DATE::text "
            "WHERE equipment_id=:eid AND employee_code=:code AND return_date=''",
            {"eid": equipment_id, "code": old["employee_code"]}
        )


def _add_history(equipment_id, employee_code, employee_name):
    execute(
        "INSERT INTO equipment_history (equipment_id, employee_code, employee_name, handover_date) "
        "VALUES (:eid, :code, :name, CURRENT_DATE::text)",
        {"eid": equipment_id, "code": employee_code, "name": employee_name}
    )


@router.get("")
def list_equipment(
    storage: str = Query("all"),
    employee_id: int | None = Query(None),
    search: str = Query(""),
):
    sql = """
        SELECT eq.*, emp.full_name, emp.department, emp.employee_code as emp_code,
               lic.license_key, lic.product_name as license_product, lic.expiry_date as license_expiry,
               lic.activated as license_activated,
               (SELECT h.handover_date FROM equipment_history h WHERE h.equipment_id=eq.id ORDER BY h.id DESC LIMIT 1) as handover_date,
               (SELECT h.return_date FROM equipment_history h WHERE h.equipment_id=eq.id ORDER BY h.id DESC LIMIT 1) as return_date
        FROM equipment eq
        LEFT JOIN employees emp ON emp.id=eq.employee_id
        LEFT JOIN licenses lic ON lic.equipment_id=eq.id
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
        sql += " AND (LOWER(eq.equipment_type) LIKE LOWER(:search) OR LOWER(eq.specs) LIKE LOWER(:search) OR LOWER(eq.serial_number) LIKE LOWER(:search) OR LOWER(eq.asset_code) LIKE LOWER(:search))"
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


@router.post("/import")
def import_equipment(body: dict):
    items = body.get("equipment", [])
    if not items:
        raise HTTPException(400, "No equipment data provided")

    stats = {"total": len(items), "created": 0, "updated": 0, "skipped": 0, "errors": []}

    with SessionLocal() as sess:
        for i, item in enumerate(items):
            line_no = i + 1
            asset_code = _norm(item.get("asset_code"))
            try:
                if not asset_code:
                    stats["errors"].append(f"Dòng {line_no}: thiếu mã tài sản (Mã TS)")
                    continue

                employee_id = None
                emp_name = ""
                emp_code = _norm(item.get("employee_code"))
                emp_full = _norm(item.get("employee_name"))
                if not emp_code and emp_full:
                    emp = sess.execute(
                        text("SELECT id, employee_code FROM employees WHERE LOWER(full_name) = LOWER(:c) LIMIT 1"),
                        {"c": emp_full},
                    ).first()
                    if emp:
                        employee_id = emp[0]
                        emp_code = emp[1]
                        emp_name = emp_full
                if emp_code:
                    emp = sess.execute(
                        text("SELECT id, full_name FROM employees WHERE employee_code = :c"),
                        {"c": emp_code},
                    ).first()
                    if emp:
                        employee_id = emp[0]
                        emp_name = emp[1]

                fields = {col: _norm(item.get(col)) for col in _EQUIPMENT_COLS}
                fields["employee_id"] = employee_id
                lic_key = _norm(item.get("license_key"))
                lic_product = _norm(item.get("license_product"))
                lic_expiry = _norm(item.get("license_expiry"))
                lic_activated = _norm(item.get("license_activated"))

                existing = sess.execute(
                    text("SELECT id FROM equipment WHERE asset_code = :c"),
                    {"c": asset_code},
                ).first()

                if existing:
                    set_clause = ", ".join(f"{col}=:{col}" for col in _EQUIPMENT_COLS)
                    sess.execute(
                        text(
                            f"UPDATE equipment SET {set_clause}, employee_id=:employee_id, "
                            "updated_at=CURRENT_TIMESTAMP::text WHERE id=:id"
                        ),
                        {**fields, "id": existing[0]},
                    )
                    stats["updated"] += 1
                    new_id = existing[0]
                else:
                    cols = _EQUIPMENT_COLS + ["employee_id"]
                    insert_cols = ", ".join(cols)
                    insert_vals = ", ".join(f":{col}" for col in cols)
                    new_id = sess.execute(
                        text(
                            f"INSERT INTO equipment ({insert_cols}, asset_code, created_at) "
                            f"VALUES ({insert_vals}, :asset_code, CURRENT_TIMESTAMP::text) "
                            "RETURNING id"
                        ),
                        {**fields, "asset_code": asset_code},
                    ).scalar()
                    stats["created"] += 1
                    if employee_id:
                        sess.execute(
                            text(
                                "INSERT INTO equipment_history (equipment_id, employee_code, employee_name, handover_date) "
                                "VALUES (:eid, :code, :name, CURRENT_DATE::text)"
                            ),
                            {"eid": new_id, "code": emp_code, "name": emp_name},
                        )

                if lic_key:
                    lic_existing = sess.execute(
                        text("SELECT id FROM licenses WHERE equipment_id=:eid AND license_key=:key"),
                        {"eid": new_id, "key": lic_key},
                    ).first()
                    if lic_existing:
                        sess.execute(
                            text(
                                "UPDATE licenses SET product_name=:product, activated=:act, "
                                "expiry_date=:expiry, updated_at=CURRENT_TIMESTAMP::text WHERE id=:id"
                            ),
                            {"product": lic_product, "act": lic_activated, "expiry": lic_expiry, "id": lic_existing[0]},
                        )
                    else:
                        sess.execute(
                            text(
                                "INSERT INTO licenses (equipment_id, license_key, product_name, activated, expiry_date, created_at) "
                                "VALUES (:eid, :key, :product, :act, :expiry, CURRENT_TIMESTAMP::text)"
                            ),
                            {"eid": new_id, "key": lic_key, "product": lic_product, "act": lic_activated, "expiry": lic_expiry},
                        )
            except Exception as e:
                stats["errors"].append(f"Dòng {line_no}: {asset_code} — {str(e)}")

        sess.commit()

    if stats["created"] or stats["updated"]:
        publish_sync("equipment_imported", {"created": stats["created"], "updated": stats["updated"]})
    return stats


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
    execute(f"UPDATE equipment SET {', '.join(fields)}, updated_at=CURRENT_TIMESTAMP::text WHERE id=:eid", params)
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
    execute("UPDATE equipment SET employee_id=:eid2, issued_date=CURRENT_DATE::text WHERE id=:eid",
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
    execute("UPDATE equipment SET employee_id=NULL, issued_date='', updated_at=CURRENT_TIMESTAMP::text WHERE id=:eid", {"eid": equipment_id})
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
    execute("UPDATE equipment SET employee_id=:eid2, issued_date=CURRENT_DATE::text, updated_at=CURRENT_TIMESTAMP::text WHERE id=:eid",
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
