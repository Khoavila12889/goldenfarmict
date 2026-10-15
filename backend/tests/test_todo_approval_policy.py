from app.core import todo_permissions as policy


def test_department_setting_controls_all_roles(monkeypatch):
    user = {"user_role": "user", "department": "Sales"}

    def lookup(sql, params):
        if "department_permissions" in sql:
            return {"can_view": 0, "can_edit": 0} if params["dept"] == "Sales" else {"can_view": 1, "can_edit": 0}
        return {"can_view": 1, "can_edit": 0}

    monkeypatch.setattr(policy, "fetchone", lookup)
    assert policy.requires_department_approval(user, "department", "Sales") is False
    assert policy.requires_department_approval(user, "department", "Factory") is True
    assert policy.requires_department_approval(user, "personal", "Factory") is False


def test_capabilities_follow_viewers_department(monkeypatch):
    user = {"user_role": "head", "department": "Sales", "headed_departments": ["Sales", "Factory"]}

    def lookup(sql, params):
        if "department_permissions" in sql:
            return {"can_view": 1, "can_edit": 0} if params["dept"] == "Factory" else None
        return {"can_view": 0, "can_edit": 0}

    monkeypatch.setattr(policy, "fetchone", lookup)
    monkeypatch.setattr(policy, "fetchall", lambda sql, params: (
        [{"department": "Factory", "can_view": 1, "can_edit": 0}] if "department_permissions" in sql
        else [{"role": "head", "can_view": 0, "can_edit": 0}]
    ))
    capabilities = policy.capabilities_for(user)
    assert capabilities["approval_by_department"] == {"Sales": False, "Factory": True}
    assert capabilities["review_by_department"] == {"Sales": False, "Factory": True}
    assert capabilities["requires_department_approval"] is False


def test_role_grant_does_not_enable_unconfigured_department(monkeypatch):
    def rows(sql, params=None):
        if "department_permissions" in sql:
            return []
        if "role_permissions" in sql:
            return [{"role": "user", "can_view": 1, "can_edit": 0},
                    {"role": "admin", "can_view": 0, "can_edit": 0}]
        return [{"department": "Sales"}]

    monkeypatch.setattr(policy, "fetchall", rows)
    capabilities = policy.capabilities_for({"user_role": "admin", "department": "", "user_code": "admin"})
    assert capabilities["approval_by_department"] == {"Sales": False}
    assert capabilities["review_by_department"] == {"Sales": False}
    assert capabilities["requires_department_approval"] is False


def test_disabled_department_hides_review_for_every_role(monkeypatch):
    def rows(sql, params=None):
        if "department_permissions" in sql:
            return [{"department": "Kỹ thuật", "can_view": 0, "can_edit": 0},
                    {"department": "Kinh doanh", "can_view": 1, "can_edit": 0}]
        if "role_permissions" in sql:
            return [{"role": role, "can_view": 1, "can_edit": 0} for role in ("user", "head", "admin")]
        return [{"department": "Kỹ thuật"}, {"department": "Kinh doanh"}]

    monkeypatch.setattr(policy, "fetchall", rows)
    monkeypatch.setattr(policy, "fetchone", lambda sql, params: next(
        (row for row in rows("department_permissions", params)
         if row["department"].casefold() == params["dept"].casefold()), None
    ) if "department_permissions" in sql else {"can_view": 1, "can_edit": 0})

    for role in ("user", "head", "admin"):
        user = {"user_role": role, "department": "Kỹ thuật"}
        capabilities = policy.capabilities_for(user)
        assert capabilities["requires_department_approval"] is False
        assert policy.requires_department_approval(user, "department", "Kỹ thuật") is False


def test_unconfigured_department_is_approved_directly(monkeypatch):
    monkeypatch.setattr(policy, "fetchone", lambda sql, params: None)
    assert policy.requires_department_approval({"user_role": "user", "department": "Sales"}, "department") is False


def test_role_setting_does_not_enable_department(monkeypatch):
    monkeypatch.setattr(
        policy, "fetchone",
        lambda sql, params: None if "department_permissions" in sql else {"can_view": 1, "can_edit": 0},
    )
    assert policy.requires_department_approval({"user_role": "user", "department": "Sales"}, "department") is False
