import os
from fastapi import APIRouter, HTTPException, UploadFile, File
from ..core.database import get_conn
from ..core.events import publish_sync

router = APIRouter(prefix="/api/software", tags=["software"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'uploads', 'contracts')
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ─── Categories (Tabs) ───────────────────────────────────────

@router.get("/categories")
def list_categories():
    conn = get_conn()
    rows = [dict(r) for r in conn.execute(
        "SELECT c.*, (SELECT COUNT(*) FROM software_items WHERE category_id=c.id) AS item_count "
        "FROM software_categories c ORDER BY c.order_index ASC, c.id ASC"
    ).fetchall()]
    return {"data": rows}


@router.post("/categories")
def create_category(body: dict):
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(400, "Tên không được để trống")
    conn = get_conn()
    existing = conn.execute("SELECT id FROM software_categories WHERE name = ?", (name,)).fetchone()
    if existing:
        raise HTTPException(400, "Tên tab đã tồn tại")
    conn.execute(
        "INSERT INTO software_categories (name, icon_name, order_index) VALUES (?, ?, ?)",
        (name, body.get("icon_name", "📄"), body.get("order_index", 0)),
    )
    conn.commit()
    publish_sync("tab_updated", {})
    return {"success": True, "id": conn.execute("SELECT last_insert_rowid()").fetchone()[0]}


@router.put("/categories/{cat_id}")
def update_category(cat_id: int, body: dict):
    conn = get_conn()
    name = body.get("name", "").strip()
    if name:
        existing = conn.execute(
            "SELECT id FROM software_categories WHERE name = ? AND id != ?", (name, cat_id)
        ).fetchone()
        if existing:
            raise HTTPException(400, "Tên tab đã tồn tại")
    fields = []
    params = []
    for col in ["name", "icon_name", "order_index"]:
        if col in body:
            fields.append(f"{col}=?")
            params.append(body[col])
    if not fields:
        raise HTTPException(400, "No fields to update")
    params.append(cat_id)
    conn.execute(f"UPDATE software_categories SET {', '.join(fields)} WHERE id=?", params)
    conn.commit()
    publish_sync("tab_updated", {})
    return {"success": True}


@router.delete("/categories/{cat_id}")
def delete_category(cat_id: int):
    conn = get_conn()
    row = conn.execute("SELECT COUNT(*) AS cnt FROM software_items WHERE category_id=?", (cat_id,)).fetchone()
    if row["cnt"] > 0:
        raise HTTPException(400, "Không thể xóa tab đang chứa dữ liệu")
    conn.execute("DELETE FROM software_categories WHERE id=?", (cat_id,))
    conn.commit()
    publish_sync("tab_updated", {})
    return {"success": True}


# ─── Items (Software entries) per Category ──────────────────

@router.get("/categories/{cat_id}/items")
def list_items(cat_id: int, search: str = ""):
    conn = get_conn()
    sql = "SELECT * FROM software_items WHERE category_id=?"
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
        "INSERT INTO software_items (category_id, name, registered_date, expiration_date, notes) VALUES (?, ?, ?, ?, ?)",
        (cat_id, body.get("name", ""), body.get("registered_date", ""), body.get("expiration_date", ""), body.get("notes", "")),
    )
    conn.commit()
    publish_sync("software_updated", {})
    return {"success": True, "id": conn.execute("SELECT last_insert_rowid()").fetchone()[0]}


@router.put("/items/{item_id}")
def update_item(item_id: int, body: dict):
    conn = get_conn()
    fields = []
    params = []
    for col in ["name", "registered_date", "expiration_date", "notes"]:
        if col in body:
            fields.append(f"{col}=?")
            params.append(body[col])
    if not fields:
        raise HTTPException(400, "No fields to update")
    params.append(item_id)
    conn.execute(f"UPDATE software_items SET {', '.join(fields)}, updated_at=datetime('now','localtime') WHERE id=?", params)
    conn.commit()
    publish_sync("software_updated", {})
    return {"success": True}


@router.delete("/items/{item_id}")
def delete_item(item_id: int):
    conn = get_conn()
    row = conn.execute("SELECT contract_info FROM software_items WHERE id=?", (item_id,)).fetchone()
    if row and row["contract_info"]:
        fp = os.path.join(UPLOAD_DIR, row["contract_info"])
        if os.path.exists(fp):
            os.remove(fp)
    conn.execute("DELETE FROM software_items WHERE id=?", (item_id,))
    conn.commit()
    publish_sync("software_updated", {})
    return {"success": True}


@router.post("/items/{item_id}/upload")
async def upload_contract(item_id: int, file: UploadFile = File(...)):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(400, "Chỉ hỗ trợ file PDF")
    conn = get_conn()
    row = conn.execute("SELECT id FROM software_items WHERE id=?", (item_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Item not found")
    ext = os.path.splitext(file.filename)[1]
    fname = f"contract_{item_id}{ext}"
    fpath = os.path.join(UPLOAD_DIR, fname)
    content = await file.read()
    with open(fpath, "wb") as f:
        f.write(content)
    conn.execute("UPDATE software_items SET contract_info=?, updated_at=datetime('now','localtime') WHERE id=?", (fname, item_id))
    conn.commit()
    publish_sync("software_updated", {})
    return {"success": True, "filename": fname, "size": len(content)}


@router.get("/contracts/{filename}")
def get_contract(filename: str):
    from fastapi.responses import FileResponse
    fpath = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(fpath):
        raise HTTPException(404, "File not found")
    return FileResponse(fpath, media_type="application/pdf", filename=filename)
