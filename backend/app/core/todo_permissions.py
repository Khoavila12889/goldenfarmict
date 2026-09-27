"""Shared authorization rules for Todos and their child resources."""

from typing import Any

from fastapi import HTTPException

ADMIN = "admin"
HEAD = "head"
USER = "user"
PERSONAL = "personal"
DEPARTMENT = "department"


def _same_dept(a: Any, b: Any) -> bool:
    return bool(a) and bool(b) and str(a).strip().casefold() == str(b).strip().casefold()


def _headed_departments(user: dict) -> list[str]:
    departments = user.get("headed_departments") or []
    if departments:
        return [str(dept).strip() for dept in departments if str(dept).strip()]
    dept = str(user.get("department") or "").strip()
    return [dept] if user.get("user_role") == HEAD and dept else []


def departments_for(user: dict) -> list[str] | None:
    """Departments visible for assignment lists; None means unrestricted ADMIN."""
    role = user.get("user_role")
    if role == ADMIN:
        return None
    if role == HEAD:
        return _headed_departments(user)
    dept = str(user.get("department") or "").strip()
    return [dept] if dept else []


def can_manage_department(user: dict, department: Any) -> bool:
    if user.get("user_role") == ADMIN:
        return True
    return any(_same_dept(department, item) for item in (departments_for(user) or []))


def can_create_in_scope(user: dict, scope: str, department: Any = None) -> bool:
    if scope == PERSONAL:
        return True
    if scope != DEPARTMENT:
        return False
    return can_manage_department(user, department)


def requires_department_approval(user: dict, scope: str) -> bool:
    return scope == DEPARTMENT and user.get("user_role") == USER


def capabilities_for(user: dict) -> dict:
    allowed = departments_for(user)
    role = user.get("user_role")
    return {
        "can_create": True,
        "can_create_personal": can_create_in_scope(user, PERSONAL),
        "can_create_department": role == ADMIN or bool(allowed),
        "can_choose_department": role in (ADMIN, HEAD) and bool(allowed is None or allowed),
        "allowed_departments": allowed,
        "requires_department_approval": role == USER,
        "default_scope": DEPARTMENT if role == HEAD else PERSONAL,
    }


def _in_department(user: dict, department: Any) -> bool:
    if user.get("user_role") == ADMIN:
        return True
    allowed = _headed_departments(user) if user.get("user_role") == HEAD else [user.get("department")]
    return any(_same_dept(department, item) for item in allowed)


def can_view(user: dict, todo: dict) -> bool:
    if user.get("user_role") == ADMIN:
        return True
    code = user.get("user_code")
    scope = todo.get("scope")
    if scope == PERSONAL:
        return code in (todo.get("creator_code"), todo.get("assignee_code"))
    if scope == DEPARTMENT and _in_department(user, todo.get("department")):
        approved = str(todo.get("is_dept_approved") or "0").strip() in {"1", "true", "True"}
        return user.get("user_role") == HEAD or approved or todo.get("creator_code") == code
    return False


def can_edit(user: dict, todo: dict) -> bool:
    if user.get("user_role") == ADMIN:
        return True
    code = user.get("user_code")
    if user.get("user_role") == HEAD and todo.get("scope") == DEPARTMENT:
        return _in_department(user, todo.get("department"))
    return code in (todo.get("creator_code"), todo.get("assignee_code")) and can_view(user, todo)


def can_delete(user: dict, todo: dict) -> bool:
    if user.get("user_role") == ADMIN:
        return True
    if todo.get("scope") == DEPARTMENT and user.get("user_role") == HEAD:
        return _in_department(user, todo.get("department"))
    return todo.get("creator_code") == user.get("user_code") and can_view(user, todo)


def can_change_status(user: dict, todo: dict) -> bool:
    if user.get("user_role") == ADMIN:
        return True
    if user.get("user_role") == HEAD and todo.get("scope") == DEPARTMENT:
        return _in_department(user, todo.get("department"))
    return user.get("user_code") in (todo.get("creator_code"), todo.get("assignee_code")) and can_view(user, todo)


def can_approve(user: dict, todo: dict) -> bool:
    approved = str(todo.get("is_dept_approved") or "0").strip() in {"1", "true", "True"}
    if todo.get("scope") != DEPARTMENT or approved:
        return False
    return user.get("user_role") == ADMIN or (
        user.get("user_role") == HEAD and _in_department(user, todo.get("department"))
    )


def can_delete_attachment(user: dict, todo: dict, uploader_code: str) -> bool:
    return can_view(user, todo) and (
        user.get("user_role") == ADMIN or uploader_code == user.get("user_code")
    )


def permissions_for(user: dict, todo: dict) -> dict:
    visible = can_view(user, todo)
    editable = can_edit(user, todo)
    return {
        "can_view": visible,
        "can_edit": editable,
        "can_delete": can_delete(user, todo),
        "can_change_status": can_change_status(user, todo),
        "can_approve": can_approve(user, todo),
        "can_comment": visible,
        "can_manage_subtasks": editable,
        "can_manage_attachments": editable,
    }


def require_view(user: dict, todo: dict) -> None:
    if not can_view(user, todo):
        raise HTTPException(status_code=403, detail="Bạn không có quyền truy cập công việc này")


def require_edit(user: dict, todo: dict) -> None:
    if not can_edit(user, todo):
        raise HTTPException(status_code=403, detail="Bạn không có quyền chỉnh sửa công việc này")


def visible_sql(user: dict, alias: str = "") -> tuple[str, dict]:
    """Return the shared list visibility predicate and its bound SQL parameters."""
    prefix = f"{alias}." if alias else ""
    code = user.get("user_code") or ""
    role = user.get("user_role")
    if role == ADMIN:
        return "1=1", {}

    if role == HEAD:
        departments = _headed_departments(user)
        if departments:
            params = {f"todo_dept_{idx}": dept.casefold() for idx, dept in enumerate(departments)}
            dept_sql = ", ".join(f":todo_dept_{idx}" for idx in range(len(departments)))
            return (
                f"(({prefix}scope = 'personal' AND ({prefix}creator_code = :todo_code OR {prefix}assignee_code = :todo_code)) "
                f"OR ({prefix}scope = 'department' AND LOWER(TRIM({prefix}department)) IN ({dept_sql})))",
                {"todo_code": code, **params},
            )
        return f"{prefix}scope = 'personal' AND ({prefix}creator_code = :todo_code OR {prefix}assignee_code = :todo_code)", {"todo_code": code}

    dept = str(user.get("department") or "").strip().casefold()
    if not dept:
        return f"{prefix}scope = 'personal' AND ({prefix}creator_code = :todo_code OR {prefix}assignee_code = :todo_code)", {"todo_code": code}
    return (
        f"(({prefix}scope = 'personal' AND ({prefix}creator_code = :todo_code OR {prefix}assignee_code = :todo_code)) "
        f"OR ({prefix}scope = 'department' AND LOWER(TRIM({prefix}department)) = :todo_dept "
        f"AND ({prefix}is_dept_approved = 1 OR {prefix}creator_code = :todo_code)))",
        {"todo_code": code, "todo_dept": dept},
    )
