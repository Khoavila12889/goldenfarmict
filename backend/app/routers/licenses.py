import re, os, shutil
from fastapi import APIRouter, Query, UploadFile, File
from sqlalchemy import text
from ..core.db import fetchall, fetchone, execute, insert
from ..core.session import SessionLocal

router = APIRouter(prefix="/api/licenses", tags=["licenses"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'uploads', 'contracts')
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.get("")
def list_licenses(search: str = ""):
    sql = """
        SELECT lic.*, eq.equipment_type, eq.serial_number, eq.asset_code,
               emp.full_name, emp.department, emp.employee_code
        FROM licenses lic
        JOIN equipment eq ON eq.id=lic.equipment_id
        JOIN employees emp ON emp.id=eq.employee_id
    """
    params = {}
    if search:
        sql += " WHERE LOWER(lic.license_key) LIKE LOWER(:search) OR LOWER(lic.product_name) LIKE LOWER(:search) OR LOWER(emp.full_name) LIKE LOWER(:search)"
        params["search"] = f"%{search}%"
    sql += " ORDER BY lic.id DESC"
    rows = fetchall(sql, params)
    return {"data": rows, "total": len(rows)}


@router.get("/stats")
def license_stats():
    total = fetchone("SELECT COUNT(*) as cnt FROM licenses")["cnt"]
    has_product = fetchone("SELECT COUNT(*) as cnt FROM licenses WHERE product_name != ''")["cnt"]
    has_expiry = fetchone("SELECT COUNT(*) as cnt FROM licenses WHERE expiry_date != ''")["cnt"]
    return {"total": total, "has_product": has_product, "has_expiry": has_expiry}


@router.post("")
def create_license(body: dict):
    new_id = insert(
        "INSERT INTO licenses (equipment_id, license_key, product_name, activated, expiry_date, notes) VALUES (:equipment_id, :license_key, :product_name, :activated, :expiry_date, :notes) RETURNING id",
        {
            "equipment_id": body.get("equipment_id"),
            "license_key": body.get("license_key", ""),
            "product_name": body.get("product_name", ""),
            "activated": body.get("activated", ""),
            "expiry_date": body.get("expiry_date", ""),
            "notes": body.get("notes", ""),
        },
    )
    return {"success": True, "id": new_id}


@router.put("/{license_id}")
def update_license(license_id: int, body: dict):
    execute(
        "UPDATE licenses SET license_key=:license_key, product_name=:product_name, activated=:activated, expiry_date=:expiry_date, notes=:notes, updated_at=CURRENT_TIMESTAMP WHERE id=:id",
        {
            "license_key": body.get("license_key", ""),
            "product_name": body.get("product_name", ""),
            "activated": body.get("activated", ""),
            "expiry_date": body.get("expiry_date", ""),
            "notes": body.get("notes", ""),
            "id": license_id,
        },
    )
    return {"success": True}


@router.delete("/{license_id}")
def delete_license(license_id: int):
    execute("DELETE FROM licenses WHERE id=:id", {"id": license_id})
    return {"success": True}


@router.post("/bulk")
def bulk_import(body: dict):
    keys = body.get("keys", [])
    equipment_id = body.get("equipment_id")
    product_name = body.get("product_name", "")
    added = 0
    for k in keys:
        k = k.strip()
        if k:
            execute("INSERT INTO licenses (equipment_id, license_key, product_name) VALUES (:eid, :key, :product)", {"eid": equipment_id, "key": k, "product": product_name})
            added += 1
    return {"success": True, "added": added}


@router.post("/import")
def import_licenses(body: dict):
    rows = body.get("licenses", []) or []
    stats = {"total": len(rows), "created": 0, "updated": 0, "skipped": 0, "errors": []}

    def _norm(v):
        return "" if v is None else str(v).strip()

    for line_no, item in enumerate(rows, start=2):
        try:
            lic_key = _norm(item.get("license_key"))
            if not lic_key:
                stats["skipped"] += 1
                stats["errors"].append(f"Dòng {line_no}: thiếu License Key")
                continue

            product = _norm(item.get("product_name"))
            activated = _norm(item.get("activated"))
            expiry = _norm(item.get("expiry_date"))
            notes = _norm(item.get("notes"))

            equipment_id = item.get("equipment_id")
            if equipment_id is None or equipment_id == "":
                eq_ref = _norm(item.get("asset_code")) or _norm(item.get("serial_number"))
                if eq_ref:
                    eq = fetchone(
                        "SELECT id FROM equipment WHERE asset_code=:c OR serial_number=:c LIMIT 1",
                        {"c": eq_ref},
                    )
                    equipment_id = eq["id"] if eq else None
                if not equipment_id:
                    emp_code = _norm(item.get("employee_code"))
                    emp_name = _norm(item.get("employee_name"))
                    if not emp_code and emp_name:
                        emp = fetchone(
                            "SELECT employee_code FROM employees WHERE LOWER(full_name)=LOWER(:c) LIMIT 1",
                            {"c": emp_name},
                        )
                        emp_code = emp["employee_code"] if emp else ""
                    if emp_code:
                        eq = fetchone(
                            "SELECT id FROM equipment WHERE employee_id = "
                            "(SELECT id FROM employees WHERE employee_code=:c LIMIT 1) LIMIT 1",
                            {"c": emp_code},
                        )
                        equipment_id = eq["id"] if eq else None
            else:
                equipment_id = int(equipment_id)

            if not equipment_id:
                stats["skipped"] += 1
                stats["errors"].append(f"Dòng {line_no}: không xác định được thiết bị ({lic_key})")
                continue

            with SessionLocal() as sess:
                existing = sess.execute(
                    text("SELECT id FROM licenses WHERE equipment_id=:eid AND license_key=:key"),
                    {"eid": equipment_id, "key": lic_key},
                ).first()
                if existing:
                    sess.execute(
                        text(
                            "UPDATE licenses SET product_name=:p, activated=:a, expiry_date=:e, "
                            "notes=:n, updated_at=CURRENT_TIMESTAMP::text WHERE id=:id"
                        ),
                        {"p": product, "a": activated, "e": expiry, "n": notes, "id": existing[0]},
                    )
                    sess.commit()
                    stats["updated"] += 1
                else:
                    sess.execute(
                        text(
                            "INSERT INTO licenses (equipment_id, license_key, product_name, activated, expiry_date, notes, created_at) "
                            "VALUES (:eid, :key, :p, :a, :e, :n, CURRENT_TIMESTAMP::text)"
                        ),
                        {"eid": equipment_id, "key": lic_key, "p": product, "a": activated, "e": expiry, "n": notes},
                    )
                    sess.commit()
                    stats["created"] += 1
        except Exception as e:
            stats["errors"].append(f"Dòng {line_no}: {lic_key or ''} — {str(e)}")

    return stats


@router.post("/scan")
def scan_from_specs():
    eq_rows = fetchall("SELECT id, specs, os_info FROM equipment")
    added = 0
    for eq in eq_rows:
        eq_id = eq["id"]
        specs = eq["specs"] or ""
        os_info = eq["os_info"] or ""
        full_text = f"{specs}\n{os_info}"
        pid_match = re.search(r"Product ID\s*[:\t]\s*([^\n\r]+)", full_text, re.IGNORECASE)
        edition_match = re.search(r"Edition\s*[:\t]\s*([^\n\r]+)", full_text, re.IGNORECASE)
        if pid_match:
            pid = pid_match.group(1).strip()
            edition = edition_match.group(1).strip() if edition_match else "Windows"
            existing = fetchone("SELECT id FROM licenses WHERE equipment_id = :eid AND license_key = :key", {"eid": eq_id, "key": pid})
            if not existing:
                execute("INSERT INTO licenses (equipment_id, license_key, product_name, notes) VALUES (:eid, :key, :product, :notes)", {"eid": eq_id, "key": pid, "product": edition, "notes": "Scanned from specs"})
                added += 1
    return {"success": True, "added": added}


@router.get("/categories")
def list_categories():
    rows = fetchall(
        "SELECT c.*, (SELECT COUNT(*) FROM lic_items WHERE category_id=c.id) as item_count FROM lic_categories c ORDER BY c.sort_order ASC, c.id ASC"
    )
    return {"data": rows}


@router.post("/categories")
def create_category(body: dict):
    name = body.get("name", "").strip()
    if not name:
        return {"success": False, "error": "Tên không được để trống"}
    try:
        new_id = insert(
            "INSERT INTO lic_categories (name, icon, sort_order) VALUES (:name, :icon, :sort_order) RETURNING id",
            {"name": name, "icon": body.get("icon", "📄"), "sort_order": body.get("sort_order", 0)}
        )
        return {"success": True, "id": new_id}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.put("/categories/{cat_id}")
def update_category(cat_id: int, body: dict):
    fields = []
    params = {}
    for col in ["name", "icon", "sort_order"]:
        if col in body:
            fields.append(f"{col}=:{col}")
            params[col] = body[col]
    if not fields:
        return {"success": False, "error": "No fields"}
    params["cat_id"] = cat_id
    execute(f"UPDATE lic_categories SET {', '.join(fields)} WHERE id=:cat_id", params)
    return {"success": True}


@router.delete("/categories/{cat_id}")
def delete_category(cat_id: int):
    items = fetchall("SELECT contract_file FROM lic_items WHERE category_id=:cat_id", {"cat_id": cat_id})
    for item in items:
        if item["contract_file"]:
            fp = os.path.join(UPLOAD_DIR, item["contract_file"])
            if os.path.exists(fp):
                os.remove(fp)
    execute("DELETE FROM lic_items WHERE category_id=:cat_id", {"cat_id": cat_id})
    execute("DELETE FROM lic_categories WHERE id=:cat_id", {"cat_id": cat_id})
    return {"success": True}


@router.get("/categories/{cat_id}/items")
def list_items(cat_id: int, search: str = ""):
    sql = "SELECT * FROM lic_items WHERE category_id=:cat_id"
    params = {"cat_id": cat_id}
    if search:
        sql += " AND LOWER(name) LIKE LOWER(:search)"
        params["search"] = f"%{search}%"
    sql += " ORDER BY id DESC"
    rows = fetchall(sql, params)
    return {"data": rows, "total": len(rows)}


@router.post("/categories/{cat_id}/items")
def create_item(cat_id: int, body: dict):
    new_id = insert(
        "INSERT INTO lic_items (category_id, name, registered_date, expiry_date, notes) VALUES (:cat_id, :name, :registered_date, :expiry_date, :notes) RETURNING id",
        {
            "cat_id": cat_id,
            "name": body.get("name", ""),
            "registered_date": body.get("registered_date", ""),
            "expiry_date": body.get("expiry_date", ""),
            "notes": body.get("notes", ""),
        },
    )
    return {"success": True, "id": new_id}


@router.put("/items/{item_id}")
def update_item(item_id: int, body: dict):
    fields = []
    params = {}
    for col in ["name", "registered_date", "expiry_date", "notes"]:
        if col in body:
            fields.append(f"{col}=:{col}")
            params[col] = body[col]
    if not fields:
        return {"success": False, "error": "No fields"}
    params["item_id"] = item_id
    execute(f"UPDATE lic_items SET {', '.join(fields)}, updated_at=CURRENT_TIMESTAMP WHERE id=:item_id", params)
    return {"success": True}


@router.delete("/items/{item_id}")
def delete_item(item_id: int):
    row = fetchone("SELECT contract_file FROM lic_items WHERE id=:id", {"id": item_id})
    if row and row["contract_file"]:
        fp = os.path.join(UPLOAD_DIR, row["contract_file"])
        if os.path.exists(fp):
            os.remove(fp)
    execute("DELETE FROM lic_items WHERE id=:id", {"id": item_id})
    return {"success": True}


@router.post("/items/{item_id}/upload")
async def upload_contract(item_id: int, file: UploadFile = File(...)):
    if not file.filename.lower().endswith('.pdf'):
        return {"success": False, "error": "Chỉ hỗ trợ file PDF"}
    row = fetchone("SELECT id FROM lic_items WHERE id=:id", {"id": item_id})
    if not row:
        return {"success": False, "error": "Item not found"}
    ext = os.path.splitext(file.filename)[1]
    fname = f"contract_{item_id}{ext}"
    fpath = os.path.join(UPLOAD_DIR, fname)
    content = await file.read()
    with open(fpath, "wb") as f:
        f.write(content)
    execute("UPDATE lic_items SET contract_file=:file, updated_at=CURRENT_TIMESTAMP WHERE id=:id", {"file": fname, "id": item_id})
    return {"success": True, "filename": fname, "size": len(content)}


@router.get("/contracts/{filename}")
def get_contract(filename: str):
    from fastapi.responses import FileResponse
    fpath = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(fpath):
        from fastapi import HTTPException
        raise HTTPException(404, "File not found")
    return FileResponse(fpath, media_type="application/pdf", filename=filename)
