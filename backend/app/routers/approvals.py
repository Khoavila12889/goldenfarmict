"""
Approval Workflow Module
- Workflow Templates (dynamic multi-step approval process)
- Multi-level Approval Requests
- Approval Logs (history trail)
"""
import json
from fastapi import APIRouter, Query, HTTPException
from ..core.db import fetchall, fetchone, execute, insert
from ..core.events import publish_sync

router = APIRouter(prefix="/api", tags=["approvals"])


def _employee(code):
    return fetchone(
        "SELECT id, full_name, department, position, employee_code FROM employees WHERE employee_code=:code",
        {"code": code}
    )


# ─── WORKFLOW TEMPLATES ─────────────────────────────────────────


@router.get("/workflows")
def list_workflows(active: bool = Query(True)):
    rows = fetchall(
        "SELECT * FROM workflow_templates WHERE is_active=:active ORDER BY id",
        {"active": 1 if active else 0}
    )
    for r in rows:
        r["steps"] = fetchall(
            "SELECT * FROM workflow_steps WHERE template_id=:id ORDER BY step_order",
            {"id": r["id"]}
        )
    if active:
        rows = [r for r in rows if r["steps"]]
    return {"data": rows}


@router.post("/workflows")
def create_workflow(body: dict):
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(400, "Missing workflow name")
    new_id = insert(
        "INSERT INTO workflow_templates (name, description, icon) VALUES (:name, :description, :icon) RETURNING id",
        {"name": name, "description": body.get("description", ""), "icon": body.get("icon", "FileCheck")}
    )
    publish_sync("workflow_created", {"id": new_id})
    return {"success": True, "id": new_id}


@router.get("/workflows/{wf_id}")
def get_workflow(wf_id: int):
    row = fetchone("SELECT * FROM workflow_templates WHERE id=:id", {"id": wf_id})
    if not row:
        raise HTTPException(404, "Workflow not found")
    row["steps"] = fetchall(
        "SELECT * FROM workflow_steps WHERE template_id=:id ORDER BY step_order",
        {"id": wf_id}
    )
    return row


@router.put("/workflows/{wf_id}")
def update_workflow(wf_id: int, body: dict):
    fields, params = [], {}
    for col in ["name", "description", "icon", "is_active"]:
        if col in body:
            fields.append(f"{col}=:{col}")
            params[col] = body[col]
    if not fields:
        return {"success": False, "error": "No fields"}
    params["wf_id"] = wf_id
    execute(f"UPDATE workflow_templates SET {', '.join(fields)}, updated_at=CURRENT_TIMESTAMP WHERE id=:wf_id", params)
    publish_sync("workflow_updated", {"id": wf_id})
    return {"success": True}


@router.delete("/workflows/{wf_id}")
def delete_workflow(wf_id: int):
    execute("DELETE FROM workflow_steps WHERE template_id=:id", {"id": wf_id})
    execute("DELETE FROM workflow_templates WHERE id=:id", {"id": wf_id})
    return {"success": True}


# ─── WORKFLOW STEPS ──────────────────────────────────────────────


@router.post("/workflows/{wf_id}/steps")
def add_step(wf_id: int, body: dict):
    result = fetchone(
        "SELECT COALESCE(MAX(step_order),0) AS max_order FROM workflow_steps WHERE template_id=:id",
        {"id": wf_id}
    )
    new_order = (result["max_order"] if result else 0) + 1
    step_id = insert(
        "INSERT INTO workflow_steps (template_id, step_order, approver_type, approver_value, department_match, can_edit) VALUES (:template_id, :step_order, :approver_type, :approver_value, :department_match, :can_edit) RETURNING id",
        {"template_id": wf_id, "step_order": new_order, "approver_type": body.get("approver_type", "role"),
         "approver_value": body.get("approver_value", ""), "department_match": body.get("department_match", 1),
         "can_edit": body.get("can_edit", 0)}
    )
    execute("UPDATE workflow_templates SET updated_at=CURRENT_TIMESTAMP WHERE id=:id", {"id": wf_id})
    return {"success": True, "id": step_id, "step_order": new_order}


@router.put("/workflows/steps/{step_id}")
def update_step(step_id: int, body: dict):
    fields, params = [], {}
    for col in ["step_order", "approver_type", "approver_value", "department_match", "can_edit"]:
        if col in body:
            fields.append(f"{col}=:{col}")
            params[col] = body[col]
    if not fields:
        return {"success": False}
    params["step_id"] = step_id
    execute(f"UPDATE workflow_steps SET {', '.join(fields)} WHERE id=:step_id", params)
    return {"success": True}


@router.delete("/workflows/steps/{step_id}")
def delete_step(step_id: int):
    execute("DELETE FROM workflow_steps WHERE id=:id", {"id": step_id})
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
    tmpl = fetchone("SELECT * FROM workflow_templates WHERE id=:id", {"id": template_id})
    if not tmpl:
        raise HTTPException(404, "Workflow template not found")
    steps = fetchall(
        "SELECT * FROM workflow_steps WHERE template_id=:id ORDER BY step_order",
        {"id": template_id}
    )
    if not steps:
        raise HTTPException(400, "Workflow has no steps")
    requester_code = body.get("requester_code", "")
    requester_name = ""
    requester_dept = ""
    if requester_code:
        emp = _employee(requester_code)
        if emp:
            requester_name = emp["full_name"]
            requester_dept = emp["department"]
    new_id = insert(
        "INSERT INTO approval_requests (template_id, title, description, requester_code, requester_name, requester_dept, status, current_step, total_steps, metadata_json) VALUES (:template_id, :title, :description, :requester_code, :requester_name, :requester_dept, :status, :current_step, :total_steps, :metadata_json) RETURNING id",
        {"template_id": template_id, "title": title, "description": body.get("description", ""),
         "requester_code": requester_code, "requester_name": requester_name,
         "requester_dept": requester_dept, "status": "draft", "current_step": 1,
         "total_steps": len(steps), "metadata_json": json.dumps(body.get("metadata", {}), ensure_ascii=False)}
    )
    return {"success": True, "id": new_id}


@router.get("/requests")
def list_requests(
    status: str = Query("all"),
    requester: str = Query(""),
    template_id: int | None = Query(None),
    search: str = Query(""),
):
    sql = "SELECT * FROM approval_requests WHERE 1=1"
    params = {}
    if status != "all":
        sql += " AND status=:status"
        params["status"] = status
    if requester:
        sql += " AND requester_code=:requester"
        params["requester"] = requester
    if template_id:
        sql += " AND template_id=:template_id"
        params["template_id"] = template_id
    if search:
        sql += " AND (title ILIKE :search OR requester_name ILIKE :search OR requester_code ILIKE :search)"
        params["search"] = f"%{search}%"
    sql += " ORDER BY id DESC"
    rows = fetchall(sql, params)
    for r in rows:
        r["logs"] = fetchall(
            "SELECT * FROM approval_logs WHERE request_id=:id ORDER BY id",
            {"id": r["id"]}
        )
    return {"data": rows}


@router.get("/requests/pending")
def pending_requests(user_code: str = Query("")):
    """Get all approval requests awaiting action from the specified user (by role/dept match)."""
    if not user_code:
        raise HTTPException(400, "Missing user_code")
    emp = _employee(user_code)
    if not emp:
        return {"data": []}
    rows = []
    all_reqs = fetchall(
        "SELECT * FROM approval_requests WHERE status IN ('pending','in_progress') ORDER BY id DESC"
    )
    for req in all_reqs:
        steps = fetchall(
            "SELECT * FROM workflow_steps WHERE template_id=:id ORDER BY step_order",
            {"id": req["template_id"]}
        )
        current = next((s for s in steps if s["step_order"] == req["current_step"]), None)
        if not current:
            continue
        if _is_approver(current, req, emp):
            req["logs"] = fetchall(
                "SELECT * FROM approval_logs WHERE request_id=:id ORDER BY id",
                {"id": req["id"]}
            )
            req["current_step_info"] = current
            rows.append(req)
    return {"data": rows}


def _is_approver(step, request, emp):
    if step["approver_type"] == "specific":
        return emp["employee_code"] == step["approver_value"]
    elif step["approver_type"] == "role":
        pos_match = emp["position"] == step["approver_value"]
        if step["department_match"]:
            return pos_match and emp["department"] == request["requester_dept"]
        return pos_match
    return False


def _get_approval_request(req_id):
    req = fetchone(
        "SELECT * FROM approval_requests WHERE id=:id AND status IN ('pending','in_progress')",
        {"id": req_id}
    )
    if not req:
        raise HTTPException(400, "Request not found or not pending")
    steps = fetchall(
        "SELECT * FROM workflow_steps WHERE template_id=:id ORDER BY step_order",
        {"id": req["template_id"]}
    )
    current_step = next((s for s in steps if s["step_order"] == req["current_step"]), None)
    if not current_step:
        raise HTTPException(400, "Invalid current step")
    return req, steps, current_step


@router.get("/requests/{req_id}")
def get_request(req_id: int):
    row = fetchone("SELECT * FROM approval_requests WHERE id=:id", {"id": req_id})
    if not row:
        raise HTTPException(404, "Request not found")
    row["logs"] = fetchall(
        "SELECT * FROM approval_logs WHERE request_id=:id ORDER BY id",
        {"id": req_id}
    )
    tmpl = fetchone("SELECT * FROM workflow_templates WHERE id=:id", {"id": row["template_id"]})
    row["template"] = tmpl
    row["steps"] = fetchall(
        "SELECT * FROM workflow_steps WHERE template_id=:id ORDER BY step_order",
        {"id": row["template_id"]}
    )
    return row


@router.put("/requests/{req_id}")
def update_request(req_id: int, body: dict):
    existing = fetchone(
        "SELECT * FROM approval_requests WHERE id=:id AND status='draft'", {"id": req_id}
    )
    if not existing:
        raise HTTPException(400, "Only draft requests can be edited")
    fields, params = [], {}
    for col in ["title", "description", "metadata_json"]:
        if col in body:
            fields.append(f"{col}=:{col}")
            params[col] = body[col]
    if not fields:
        return {"success": False}
    params["req_id"] = req_id
    execute(f"UPDATE approval_requests SET {', '.join(fields)}, updated_at=CURRENT_TIMESTAMP WHERE id=:req_id", params)
    return {"success": True}


@router.put("/requests/{req_id}/submit")
def submit_request(req_id: int):
    req = fetchone(
        "SELECT * FROM approval_requests WHERE id=:id AND status='draft'", {"id": req_id}
    )
    if not req:
        raise HTTPException(400, "Request not found or not in draft status")
    execute(
        "UPDATE approval_requests SET status='pending', updated_at=CURRENT_TIMESTAMP WHERE id=:id",
        {"id": req_id}
    )
    publish_sync("request_submitted", {"id": req_id, "title": req["title"]})
    return {"success": True}


@router.put("/requests/{req_id}/cancel")
def cancel_request(req_id: int):
    req = fetchone(
        "SELECT * FROM approval_requests WHERE id=:id AND status IN ('draft','pending','in_progress')",
        {"id": req_id}
    )
    if not req:
        raise HTTPException(400, "Request cannot be cancelled")
    execute(
        "UPDATE approval_requests SET status='cancelled', updated_at=CURRENT_TIMESTAMP WHERE id=:id",
        {"id": req_id}
    )
    return {"success": True}


@router.put("/requests/{req_id}/approve")
def approve_request(req_id: int, body: dict):
    approver_code = body.get("approver_code", "").strip()
    comment = body.get("comment", "").strip()
    if not approver_code:
        raise HTTPException(400, "Missing approver_code")
    req, steps, current_step = _get_approval_request(req_id)
    emp = _employee(approver_code)
    if not emp:
        raise HTTPException(400, "Approver not found")
    if not _is_approver(current_step, req, emp):
        raise HTTPException(403, "User is not the assigned approver for this step")
    execute(
        "INSERT INTO approval_logs (request_id, step_order, approver_code, approver_name, action, comment) VALUES (:request_id, :step_order, :approver_code, :approver_name, :action, :comment)",
        {"request_id": req_id, "step_order": req["current_step"], "approver_code": approver_code,
         "approver_name": emp["full_name"], "action": "approved", "comment": comment}
    )
    next_step = req["current_step"] + 1
    if next_step > req["total_steps"]:
        execute(
            "UPDATE approval_requests SET status='approved', updated_at=CURRENT_TIMESTAMP WHERE id=:id",
            {"id": req_id}
        )
    else:
        execute(
            "UPDATE approval_requests SET status='in_progress', current_step=:step, updated_at=CURRENT_TIMESTAMP WHERE id=:id",
            {"step": next_step, "id": req_id}
        )
    publish_sync("request_approved", {"id": req_id})
    return {"success": True}


@router.put("/requests/{req_id}/reject")
def reject_request(req_id: int, body: dict):
    approver_code = body.get("approver_code", "").strip()
    comment = body.get("comment", "").strip()
    if not approver_code:
        raise HTTPException(400, "Missing approver_code")
    req, steps, current_step = _get_approval_request(req_id)
    emp = _employee(approver_code)
    if not emp:
        raise HTTPException(400, "Approver not found")
    if not _is_approver(current_step, req, emp):
        raise HTTPException(403, "User is not the assigned approver for this step")
    execute(
        "INSERT INTO approval_logs (request_id, step_order, approver_code, approver_name, action, comment) VALUES (:request_id, :step_order, :approver_code, :approver_name, :action, :comment)",
        {"request_id": req_id, "step_order": req["current_step"], "approver_code": approver_code,
         "approver_name": emp["full_name"], "action": "rejected", "comment": comment}
    )
    execute(
        "UPDATE approval_requests SET status='rejected', updated_at=CURRENT_TIMESTAMP WHERE id=:id",
        {"id": req_id}
    )
    publish_sync("request_rejected", {"id": req_id})
    return {"success": True}
