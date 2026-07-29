import os
from fastapi import APIRouter, HTTPException, UploadFile, File
from ..core.db import fetchall, fetchone, execute, insert
from ..core.events import publish_sync

router = APIRouter(prefix="/api/software", tags=["software"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'uploads', 'contracts')
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.get("/categories")
def list_categories():
    rows = fetchall(
        "SELECT c.*, (SELECT COUNT(*) FROM software_items WHERE category_id=c.id) AS item_count "
        "FROM software_categories c ORDER BY c.order_index ASC, c.id ASC"
    )
    return {"data": rows}


@router.post("/categories")
def create_category(body: dict):
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(400, "Tên không được để trống")
    existing = fetchone("SELECT id FROM software_categories WHERE name = :name", {"name": name})
    if existing:
        raise HTTPException(400, "Tên tab đã tồn tại")
    new_id = insert(
        "INSERT INTO software_categories (name, icon_name, order_index) VALUES (:name, :icon_name, :order_index) RETURNING id",
        {"name": name, "icon_name": body.get("icon_name", "📄"), "order_index": body.get("order_index", 0)},
    )
    publish_sync("tab_updated", {})
    return {"success": True, "id": new_id}


@router.put("/categories/{cat_id}")
def update_category(cat_id: int, body: dict):
    name = body.get("name", "").strip()
    if name:
        existing = fetchone(
            "SELECT id FROM software_categories WHERE name = :name AND id != :id", {"name": name, "id": cat_id}
        )
        if existing:
            raise HTTPException(400, "Tên tab đã tồn tại")
    fields = []
    params = {}
    for col in ["name", "icon_name", "order_index"]:
        if col in body:
            fields.append(f"{col}=:{col}")
            params[col] = body[col]
    if not fields:
        raise HTTPException(400, "No fields to update")
    params["cat_id"] = cat_id
    execute(f"UPDATE software_categories SET {', '.join(fields)} WHERE id=:cat_id", params)
    publish_sync("tab_updated", {})
    return {"success": True}


@router.delete("/categories/{cat_id}")
def delete_category(cat_id: int):
    row = fetchone("SELECT COUNT(*) AS cnt FROM software_items WHERE category_id=:cat_id", {"cat_id": cat_id})
    if row["cnt"] > 0:
        raise HTTPException(400, "Không thể xóa tab đang chứa dữ liệu")
    execute("DELETE FROM software_categories WHERE id=:cat_id", {"cat_id": cat_id})
    publish_sync("tab_updated", {})
    return {"success": True}


@router.get("/categories/{cat_id}/items")
def list_items(cat_id: int, search: str = ""):
    sql = "SELECT * FROM software_items WHERE category_id=:cat_id"
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
        "INSERT INTO software_items (category_id, name, registered_date, expiration_date, notes) VALUES (:cat_id, :name, :registered_date, :expiration_date, :notes) RETURNING id",
        {
            "cat_id": cat_id,
            "name": body.get("name", ""),
            "registered_date": body.get("registered_date", ""),
            "expiration_date": body.get("expiration_date", ""),
            "notes": body.get("notes", ""),
        },
    )
    publish_sync("software_updated", {})
    return {"success": True, "id": new_id}


@router.put("/items/{item_id}")
def update_item(item_id: int, body: dict):
    fields = []
    params = {}
    for col in ["name", "registered_date", "expiration_date", "notes"]:
        if col in body:
            fields.append(f"{col}=:{col}")
            params[col] = body[col]
    if not fields:
        raise HTTPException(400, "No fields to update")
    params["item_id"] = item_id
    execute(f"UPDATE software_items SET {', '.join(fields)}, updated_at=CURRENT_TIMESTAMP WHERE id=:item_id", params)
    publish_sync("software_updated", {})
    return {"success": True}


@router.delete("/items/{item_id}")
def delete_item(item_id: int):
    row = fetchone("SELECT contract_info FROM software_items WHERE id=:id", {"id": item_id})
    if row and row["contract_info"]:
        fp = os.path.join(UPLOAD_DIR, row["contract_info"])
        if os.path.exists(fp):
            os.remove(fp)
    execute("DELETE FROM software_items WHERE id=:id", {"id": item_id})
    publish_sync("software_updated", {})
    return {"success": True}


@router.post("/items/{item_id}/upload")
async def upload_contract(item_id: int, file: UploadFile = File(...)):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(400, "Chỉ hỗ trợ file PDF")
    row = fetchone("SELECT id FROM software_items WHERE id=:id", {"id": item_id})
    if not row:
        raise HTTPException(404, "Item not found")
    ext = os.path.splitext(file.filename)[1]
    fname = f"contract_{item_id}{ext}"
    fpath = os.path.join(UPLOAD_DIR, fname)
    content = await file.read()
    with open(fpath, "wb") as f:
        f.write(content)
    execute("UPDATE software_items SET contract_info=:file, updated_at=CURRENT_TIMESTAMP WHERE id=:id", {"file": fname, "id": item_id})
    publish_sync("software_updated", {})
    return {"success": True, "filename": fname, "size": len(content)}


@router.get("/contracts/{filename}")
def get_contract(filename: str):
    from fastapi.responses import FileResponse
    fpath = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(fpath):
        raise HTTPException(404, "File not found")
    return FileResponse(fpath, media_type="application/pdf", filename=filename)
