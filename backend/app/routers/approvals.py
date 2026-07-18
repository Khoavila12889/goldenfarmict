"""
Approval Workflow Module
- Workflow Templates (dynamic multi-step approval process)
- Multi-level Approval Requests
- Approval Logs (history trail)
"""
import json
from fastapi import APIRouter, Query, HTTPException
from ..core.database import get_conn
from ..core.events import publish_sync

router = APIRouter(prefix="/api", tags=["approvals"])


def _conn():
    return get_conn()


def _employee(conn, code):
    return conn.execute(
        "SELECT id, full_name, department, position, employee_code FROM employees WHERE employee_code=?",
        (code,)
    ).fetchone()


# ─── WORKFLOW TEMPLATES ─────────────────────────────────────────


@router.get("/workflows")
def list_workflows(active: bool = Query(True)):
    conn = _conn()
    rows = [dict(r) for r in conn.execute(
        "SELECT * FROM workflow_templates WHERE is_active=? ORDER BY id", (1 if active else 0,)
    ).fetchall()]
    for r in rows:
        r["steps"] = [dict(s) for s in conn.execute(
            "SELECT * FROM workflow_steps WHERE template_id=? ORDER BY step_order", (r["id"],)
        ).fetchall()]
    if active:
        rows = [r for r in rows if r["steps"]]
    conn.close()
    return {"data": rows}


@router.post("/workflows")
def create_workflow(body: dict):
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(400, "Missing workflow name")
    conn = _conn()
    conn.execute(
        "INSERT INTO workflow_templates (name, description, icon) VALUES (?, ?, ?)",
        (name, body.get("description", ""), body.get("icon", "FileCheck"))
    )
    conn.commit()
    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    publish_sync("workflow_created", {"id": new_id})
    return {"success": True, "id": new_id}


@router.get("/workflows/{wf_id}")
def get_workflow(wf_id: int):
    conn = _conn()
    row = conn.execute("SELECT * FROM workflow_templates WHERE id=?", (wf_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Workflow not found")
    r = dict(row)
    r["steps"] = [dict(s) for s in conn.execute(
        "SELECT * FROM workflow_steps WHERE template_id=? ORDER BY step_order", (wf_id,)
    ).fetchall()]
    conn.close()
    return r


@router.put("/workflows/{wf_id}")
def update_workflow(wf_id: int, body: dict):
    conn = _conn()
    fields, params = [], []
    for col in ["name", "description", "icon", "is_active"]:
        if col in body:
            fields.append(f"{col}=?")
            params.append(body[col])
    if not fields:
        conn.close()
        return {"success": False, "error": "No fields"}
    params.append(wf_id)
    conn.execute(f"UPDATE workflow_templates SET {', '.join(fields)}, updated_at=datetime('now','localtime') WHERE id=?", params)
    conn.commit()
    conn.close()
    publish_sync("workflow_updated", {"id": wf_id})
    return {"success": True}


@router.delete("/workflows/{wf_id}")
def delete_workflow(wf_id: int):
    conn = _conn()
    conn.execute("DELETE FROM workflow_steps WHERE template_id=?", (wf_id,))
    conn.execute("DELETE FROM workflow_templates WHERE id=?", (wf_id,))
    conn.commit()
    conn.close()
    return {"success": True}


# ─── WORKFLOW STEPS ──────────────────────────────────────────────


@router.post("/workflows/{wf_id}/steps")
def add_step(wf_id: int, body: dict):
    conn = _conn()
    max_order = conn.execute(
        "SELECT COALESCE(MAX(step_order),0) FROM workflow_steps WHERE template_id=?", (wf_id,)
    ).fetchone()[0]
    new_order = max_order + 1
    conn.execute(
        "INSERT INTO workflow_steps (template_id, step_order, approver_type, approver_value, department_match, can_edit) VALUES (?,?,?,?,?,?)",
        (wf_id, new_order, body.get("approver_type", "role"),
         body.get("approver_value", ""), body.get("department_match", 1), body.get("can_edit", 0))
    )
    conn.commit()
    step_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute("UPDATE workflow_templates SET updated_at=datetime('now','localtime') WHERE id=?", (wf_id,))
    conn.commit()
    conn.close()
    return {"success": True, "id": step_id, "step_order": new_order}


@router.put("/workflows/steps/{step_id}")
def update_step(step_id: int, body: dict):
    conn = _conn()
    fields, params = [], []
    for col in ["step_order", "approver_type", "approver_value", "department_match", "can_edit"]:
        if col in body:
            fields.append(f"{col}=?")
            params.append(body[col])
    if not fields:
        conn.close()
        return {"success": False}
    params.append(step_id)
    conn.execute(f"UPDATE workflow_steps SET {', '.join(fields)} WHERE id=?", params)
    conn.commit()
    conn.close()
    return {"success": True}


@router.delete("/workflows/steps/{step_id}")
def delete_step(step_id: int):
    conn = _conn()
    conn.execute("DELETE FROM workflow_steps WHERE id=?", (step_id,))
    conn.commit()
    conn.close()
    return {"success": True}


# ─── APPROVAL REQUESTS ────────────────────────────────────────────


@router.post("/requests")
def create_request(body: dict):
    title = body.get("title", "").strip()
    if not title:
        raise HTTPException(400, "Missing request title")
    template_id = body.get("template_id")
    if not template_id:
        raise HTTPException(400, "Missing template_id")
    conn = _conn()
    tmpl = conn.execute("SELECT * FROM workflow_templates WHERE id=?", (template_id,)).fetchone()
    if not tmpl:
        conn.close()
        raise HTTPException(404, "Workflow template not found")
    steps = conn.execute(
        "SELECT * FROM workflow_steps WHERE template_id=? ORDER BY step_order", (template_id,)
    ).fetchall()
    if not steps:
        conn.close()
        raise HTTPException(400, "Workflow has no steps")
    requester_code = body.get("requester_code", "")
    requester_name = ""
    requester_dept = ""
    if requester_code:
        emp = _employee(conn, requester_code)
        if emp:
            requester_name = emp["full_name"]
            requester_dept = emp["department"]
    conn.execute(
        "INSERT INTO approval_requests (template_id, title, description, requester_code, requester_name, requester_dept, status, current_step, total_steps, metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (template_id, title, body.get("description", ""), requester_code,
         requester_name, requester_dept, "draft", 1, len(steps),
         json.dumps(body.get("metadata", {}), ensure_ascii=False))
    )
    conn.commit()
    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    return {"success": True, "id": new_id}


@router.get("/requests")
def list_requests(
    status: str = Query("all"),
    requester: str = Query(""),
    template_id: int | None = Query(None),
    search: str = Query(""),
):
    conn = _conn()
    sql = "SELECT * FROM approval_requests WHERE 1=1"
    params = []
    if status != "all":
        sql += " AND status=?"
        params.append(status)
    if requester:
        sql += " AND requester_code=?"
        params.append(requester)
    if template_id:
        sql += " AND template_id=?"
        params.append(template_id)
    if search:
        sql += " AND (title LIKE ? OR requester_name LIKE ? OR requester_code LIKE ?)"
        kw = f"%{search}%"
        params.extend([kw, kw, kw])
    sql += " ORDER BY id DESC"
    rows = [dict(r) for r in conn.execute(sql, params).fetchall()]
    for r in rows:
        r["logs"] = [dict(l) for l in conn.execute(
            "SELECT * FROM approval_logs WHERE request_id=? ORDER BY id", (r["id"],)
        ).fetchall()]
    conn.close()
    return {"data": rows}


@router.get("/requests/pending")
def pending_requests(user_code: str = Query("")):
    """Get all approval requests awaiting action from the specified user (by role/dept match)."""
    if not user_code:
        raise HTTPException(400, "Missing user_code")
    conn = _conn()
    emp = _employee(conn, user_code)
    if not emp:
        conn.close()
        return {"data": []}
    rows = []
    all_reqs = [dict(r) for r in conn.execute(
        "SELECT * FROM approval_requests WHERE status IN ('pending','in_progress') ORDER BY id DESC"
    ).fetchall()]
    for req in all_reqs:
        steps = conn.execute(
            "SELECT * FROM workflow_steps WHERE template_id=? ORDER BY step_order", (req["template_id"],)
        ).fetchall()
        current = next((s for s in steps if s["step_order"] == req["current_step"]), None)
        if not current:
            continue
        if _is_approver(conn, current, req, emp):
            req["logs"] = [dict(l) for l in conn.execute(
                "SELECT * FROM approval_logs WHERE request_id=? ORDER BY id", (req["id"],)
            ).fetchall()]
            req["current_step_info"] = dict(current)
            rows.append(req)
    conn.close()
    return {"data": rows}


def _is_approver(conn, step, request, emp):
    if step["approver_type"] == "specific":
        return emp["employee_code"] == step["approver_value"]
    elif step["approver_type"] == "role":
        pos_match = emp["position"] == step["approver_value"]
        if step["department_match"]:
            return pos_match and emp["department"] == request["requester_dept"]
        return pos_match
    return False


def _get_approval_request(conn, req_id):
    req = conn.execute(
        "SELECT * FROM approval_requests WHERE id=? AND status IN ('pending','in_progress')",
        (req_id,)
    ).fetchone()
    if not req:
        raise HTTPException(400, "Request not found or not pending")
    steps = conn.execute(
        "SELECT * FROM workflow_steps WHERE template_id=? ORDER BY step_order",
        (req["template_id"],)
    ).fetchall()
    current_step = next((s for s in steps if s["step_order"] == req["current_step"]), None)
    if not current_step:
        raise HTTPException(400, "Invalid current step")
    return req, steps, current_step


@router.get("/requests/{req_id}")
def get_request(req_id: int):
    conn = _conn()
    row = conn.execute("SELECT * FROM approval_requests WHERE id=?", (req_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Request not found")
    r = dict(row)
    r["logs"] = [dict(l) for l in conn.execute(
        "SELECT * FROM approval_logs WHERE request_id=? ORDER BY id", (req_id,)
    ).fetchall()]
    tmpl = conn.execute("SELECT * FROM workflow_templates WHERE id=?", (r["template_id"],)).fetchone()
    r["template"] = dict(tmpl) if tmpl else None
    r["steps"] = [dict(s) for s in conn.execute(
        "SELECT * FROM workflow_steps WHERE template_id=? ORDER BY step_order", (r["template_id"],)
    ).fetchall()]
    conn.close()
    return r


@router.put("/requests/{req_id}")
def update_request(req_id: int, body: dict):
    conn = _conn()
    existing = conn.execute(
        "SELECT * FROM approval_requests WHERE id=? AND status='draft'", (req_id,)
    ).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(400, "Only draft requests can be edited")
    fields, params = [], []
    for col in ["title", "description", "metadata_json"]:
        if col in body:
            fields.append(f"{col}=?")
            params.append(body[col])
    if not fields:
        conn.close()
        return {"success": False}
    params.append(req_id)
    conn.execute(f"UPDATE approval_requests SET {', '.join(fields)}, updated_at=datetime('now','localtime') WHERE id=?", params)
    conn.commit()
    conn.close()
    return {"success": True}


@router.put("/requests/{req_id}/submit")
def submit_request(req_id: int):
    conn = _conn()
    req = conn.execute(
        "SELECT * FROM approval_requests WHERE id=? AND status='draft'", (req_id,)
    ).fetchone()
    if not req:
        conn.close()
        raise HTTPException(400, "Request not found or not in draft status")
    conn.execute(
        "UPDATE approval_requests SET status='pending', updated_at=datetime('now','localtime') WHERE id=?",
        (req_id,)
    )
    conn.commit()
    conn.close()
    publish_sync("request_submitted", {"id": req_id, "title": req["title"]})
    return {"success": True}


@router.put("/requests/{req_id}/cancel")
def cancel_request(req_id: int):
    conn = _conn()
    req = conn.execute(
        "SELECT * FROM approval_requests WHERE id=? AND status IN ('draft','pending','in_progress')",
        (req_id,)
    ).fetchone()
    if not req:
        conn.close()
        raise HTTPException(400, "Request cannot be cancelled")
    conn.execute(
        "UPDATE approval_requests SET status='cancelled', updated_at=datetime('now','localtime') WHERE id=?",
        (req_id,)
    )
    conn.commit()
    conn.close()
    return {"success": True}


@router.put("/requests/{req_id}/approve")
def approve_request(req_id: int, body: dict):
    approver_code = body.get("approver_code", "").strip()
    comment = body.get("comment", "").strip()
    if not approver_code:
        raise HTTPException(400, "Missing approver_code")
    conn = _conn()
    try:
        req, steps, current_step = _get_approval_request(conn, req_id)
        emp = _employee(conn, approver_code)
        if not emp:
            raise HTTPException(400, "Approver not found")
        if not _is_approver(conn, current_step, req, emp):
            raise HTTPException(403, "User is not the assigned approver for this step")
        conn.execute(
            "INSERT INTO approval_logs (request_id, step_order, approver_code, approver_name, action, comment) VALUES (?,?,?,?,?,?)",
            (req_id, req["current_step"], approver_code, emp["full_name"], "approved", comment)
        )
        next_step = req["current_step"] + 1
        if next_step > req["total_steps"]:
            conn.execute(
                "UPDATE approval_requests SET status='approved', updated_at=datetime('now','localtime') WHERE id=?",
                (req_id,)
            )
        else:
            conn.execute(
                "UPDATE approval_requests SET status='in_progress', current_step=?, updated_at=datetime('now','localtime') WHERE id=?",
                (next_step, req_id)
            )
        conn.commit()
    except HTTPException:
        raise
    finally:
        conn.close()
    publish_sync("request_approved", {"id": req_id})
    return {"success": True}


@router.put("/requests/{req_id}/reject")
def reject_request(req_id: int, body: dict):
    approver_code = body.get("approver_code", "").strip()
    comment = body.get("comment", "").strip()
    if not approver_code:
        raise HTTPException(400, "Missing approver_code")
    conn = _conn()
    try:
        req, steps, current_step = _get_approval_request(conn, req_id)
        emp = _employee(conn, approver_code)
        if not emp:
            raise HTTPException(400, "Approver not found")
        if not _is_approver(conn, current_step, req, emp):
            raise HTTPException(403, "User is not the assigned approver for this step")
        conn.execute(
            "INSERT INTO approval_logs (request_id, step_order, approver_code, approver_name, action, comment) VALUES (?,?,?,?,?,?)",
            (req_id, req["current_step"], approver_code, emp["full_name"], "rejected", comment)
        )
        conn.execute(
            "UPDATE approval_requests SET status='rejected', updated_at=datetime('now','localtime') WHERE id=?",
            (req_id,)
        )
        conn.commit()
    except HTTPException:
        raise
    finally:
        conn.close()
    publish_sync("request_rejected", {"id": req_id})
    return {"success": True}
