import re, os, shutil
from fastapi import APIRouter, Query, UploadFile, File
from ..core.database import get_conn

router = APIRouter(prefix="/api/licenses", tags=["licenses"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'uploads', 'contracts')
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ─── Existing License Endpoints ────────────────────────────────

@router.get("")
def list_licenses(search: str = ""):
    conn = get_conn()
    sql = """
        SELECT lic.*, eq.equipment_type, eq.serial_number, emp.full_name, emp.department
        FROM licenses lic
        JOIN equipment eq ON eq.id=lic.equipment_id
        JOIN employees emp ON emp.id=eq.employee_id
    """
    params = []
    if search:
        sql += " WHERE lic.license_key LIKE ? OR lic.product_name LIKE ? OR emp.full_name LIKE ?"
        kw = f"%{search}%"
        params.extend([kw, kw, kw])
    sql += " ORDER BY lic.id DESC"

    rows = [dict(r) for r in conn.execute(sql, params).fetchall()]
    return {"data": rows, "total": len(rows)}


@router.get("/stats")
def license_stats():
    conn = get_conn()
    total = conn.execute("SELECT COUNT(*) FROM licenses").fetchone()[0]
    has_product = conn.execute("SELECT COUNT(*) FROM licenses WHERE product_name != ''").fetchone()[0]
    has_expiry = conn.execute("SELECT COUNT(*) FROM licenses WHERE expiry_date != ''").fetchone()[0]
    return {"total": total, "has_product": has_product, "has_expiry": has_expiry}


@router.post("")
def create_license(body: dict):
    conn = get_conn()
    conn.execute(
        "INSERT INTO licenses (equipment_id, license_key, product_name, activated, expiry_date, notes) VALUES (?, ?, ?, ?, ?, ?)",
        (body.get("equipment_id"), body.get("license_key", ""), body.get("product_name", ""), body.get("activated", ""), body.get("expiry_date", ""), body.get("notes", "")),
    )
    conn.commit()
    return {"success": True, "id": conn.execute("SELECT last_insert_rowid()").fetchone()[0]}


@router.put("/{license_id}")
def update_license(license_id: int, body: dict):
    conn = get_conn()
    conn.execute(
        "UPDATE licenses SET license_key=?, product_name=?, activated=?, expiry_date=?, notes=?, updated_at=datetime('now','localtime') WHERE id=?",
        (body.get("license_key", ""), body.get("product_name", ""), body.get("activated", ""), body.get("expiry_date", ""), body.get("notes", ""), license_id),
    )
    conn.commit()
    return {"success": True}


@router.delete("/{license_id}")
def delete_license(license_id: int):
    conn = get_conn()
    conn.execute("DELETE FROM licenses WHERE id=?", (license_id,))
    conn.commit()
    return {"success": True}


@router.post("/bulk")
def bulk_import(body: dict):
    conn = get_conn()
    keys = body.get("keys", [])
    equipment_id = body.get("equipment_id")
    product_name = body.get("product_name", "")
    added = 0
    for k in keys:
        k = k.strip()
        if k:
            conn.execute("INSERT INTO licenses (equipment_id, license_key, product_name) VALUES (?, ?, ?)", (equipment_id, k, product_name))
            added += 1
    conn.commit()
    return {"success": True, "added": added}


@router.post("/scan")
def scan_from_specs():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id, specs, os_info FROM equipment")
    eq_rows = cur.fetchall()
    added = 0
    for eq in eq_rows:
        eq_id = eq["id"]; specs = eq["specs"] or ""; os_info = eq["os_info"] or ""
        full_text = f"{specs}\n{os_info}"
        pid_match = re.search(r"Product ID\s*[:\t]\s*([^\n\r]+)", full_text, re.IGNORECASE)
        edition_match = re.search(r"Edition\s*[:\t]\s*([^\n\r]+)", full_text, re.IGNORECASE)
        if pid_match:
            pid = pid_match.group(1).strip()
            edition = edition_match.group(1).strip() if edition_match else "Windows"
            cur.execute("SELECT id FROM licenses WHERE equipment_id = ? AND license_key = ?", (eq_id, pid))
            if not cur.fetchone():
                cur.execute("INSERT INTO licenses (equipment_id, license_key, product_name, notes) VALUES (?, ?, ?, ?)", (eq_id, pid, edition, "Scanned from specs"))
                added += 1
    conn.commit()
    return {"success": True, "added": added}


# ─── Categories ────────────────────────────────────────────────

@router.get("/categories")
def list_categories():
    conn = get_conn()
    rows = [dict(r) for r in conn.execute(
        "SELECT c.*, (SELECT COUNT(*) FROM lic_items WHERE category_id=c.id) as item_count FROM lic_categories c ORDER BY c.sort_order ASC, c.id ASC"
    ).fetchall()]
    return {"data": rows}


@router.post("/categories")
def create_category(body: dict):
    name = body.get("name", "").strip()
    if not name:
        return {"success": False, "error": "Tên không được để trống"}
    conn = get_conn()
    try:
        conn.execute("INSERT INTO lic_categories (name, icon, sort_order) VALUES (?, ?, ?)", (name, body.get("icon", "📄"), body.get("sort_order", 0)))
        conn.commit()
        return {"success": True, "id": conn.execute("SELECT last_insert_rowid()").fetchone()[0]}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.put("/categories/{cat_id}")
def update_category(cat_id: int, body: dict):
    conn = get_conn()
    fields = []; params = []
    for col in ["name", "icon", "sort_order"]:
        if col in body:
            fields.append(f"{col}=?"); params.append(body[col])
    if not fields:
        return {"success": False, "error": "No fields"}
    params.append(cat_id)
    conn.execute(f"UPDATE lic_categories SET {', '.join(fields)} WHERE id=?", params)
    conn.commit()
    return {"success": True}


@router.delete("/categories/{cat_id}")
def delete_category(cat_id: int):
    conn = get_conn()
    items = conn.execute("SELECT contract_file FROM lic_items WHERE category_id=?", (cat_id,)).fetchall()
    for item in items:
        if item["contract_file"]:
            fp = os.path.join(UPLOAD_DIR, item["contract_file"])
            if os.path.exists(fp):
                os.remove(fp)
    conn.execute("DELETE FROM lic_items WHERE category_id=?", (cat_id,))
    conn.execute("DELETE FROM lic_categories WHERE id=?", (cat_id,))
    conn.commit()
    return {"success": True}


# ─── Items ─────────────────────────────────────────────────────

@router.get("/categories/{cat_id}/items")
def list_items(cat_id: int, search: str = ""):
    conn = get_conn()
    sql = "SELECT * FROM lic_items WHERE category_id=?"
    params = [cat_id]
    if search:
        sql += " AND name LIKE ?"
        params.append(f"%{search}%")
    sql += " ORDER BY id DESC"
    rows = [dict(r) for r in conn.execute(sql, params).fetchall()]
    return {"data": rows, "total": len(rows)}


@router.post("/categories/{cat_id}/items")
def create_item(cat_id: int, body: dict):
    conn = get_conn()
    conn.execute(
        "INSERT INTO lic_items (category_id, name, registered_date, expiry_date, notes) VALUES (?, ?, ?, ?, ?)",
        (cat_id, body.get("name", ""), body.get("registered_date", ""), body.get("expiry_date", ""), body.get("notes", "")),
    )
    conn.commit()
    return {"success": True, "id": conn.execute("SELECT last_insert_rowid()").fetchone()[0]}


@router.put("/items/{item_id}")
def update_item(item_id: int, body: dict):
    conn = get_conn()
    fields = []; params = []
    for col in ["name", "registered_date", "expiry_date", "notes"]:
        if col in body:
            fields.append(f"{col}=?"); params.append(body[col])
    if not fields:
        return {"success": False, "error": "No fields"}
    params.append(item_id)
    conn.execute(f"UPDATE lic_items SET {', '.join(fields)}, updated_at=datetime('now','localtime') WHERE id=?", params)
    conn.commit()
    return {"success": True}


@router.delete("/items/{item_id}")
def delete_item(item_id: int):
    conn = get_conn()
    row = conn.execute("SELECT contract_file FROM lic_items WHERE id=?", (item_id,)).fetchone()
    if row and row["contract_file"]:
        fp = os.path.join(UPLOAD_DIR, row["contract_file"])
        if os.path.exists(fp):
            os.remove(fp)
    conn.execute("DELETE FROM lic_items WHERE id=?", (item_id,))
    conn.commit()
    return {"success": True}


@router.post("/items/{item_id}/upload")
async def upload_contract(item_id: int, file: UploadFile = File(...)):
    if not file.filename.lower().endswith('.pdf'):
        return {"success": False, "error": "Chỉ hỗ trợ file PDF"}
    conn = get_conn()
    row = conn.execute("SELECT id FROM lic_items WHERE id=?", (item_id,)).fetchone()
    if not row:
        return {"success": False, "error": "Item not found"}
    ext = os.path.splitext(file.filename)[1]
    fname = f"contract_{item_id}{ext}"
    fpath = os.path.join(UPLOAD_DIR, fname)
    content = await file.read()
    with open(fpath, "wb") as f:
        f.write(content)
    conn.execute("UPDATE lic_items SET contract_file=?, updated_at=datetime('now','localtime') WHERE id=?", (fname, item_id))
    conn.commit()
    return {"success": True, "filename": fname, "size": len(content)}


@router.get("/contracts/{filename}")
def get_contract(filename: str):
    from fastapi.responses import FileResponse
    fpath = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(fpath):
        from fastapi import HTTPException
        raise HTTPException(404, "File not found")
    return FileResponse(fpath, media_type="application/pdf", filename=filename)
