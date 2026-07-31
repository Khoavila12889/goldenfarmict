"""Shared fixtures — collaborate module tests.

Strategy:
  Use ONE MagicMock per function and share it across all modules via
  the ``new=`` argument of patch().  This way setting .return_value on
  the mock affects every module that imported the function.
"""

from unittest.mock import MagicMock, patch
import pytest


# ── DB function mocks ───────────────────────────────────────────────
mock_fetchall = MagicMock(name="fetchall")
mock_fetchone = MagicMock(name="fetchone")
mock_execute  = MagicMock(name="execute")
mock_insert   = MagicMock(name="insert")

mock_fetchall.return_value = []
mock_fetchone.return_value = None
mock_execute.return_value = None
mock_insert.return_value = 1

_DB_MOCKS = {
    "fetchall": mock_fetchall,
    "fetchone": mock_fetchone,
    "execute":  mock_execute,
    "insert":   mock_insert,
}

# (module, [function-names …])
_DB_TARGETS = [
    ("app.core.db",              list(_DB_MOCKS)),
    ("app.routers.comments",     list(_DB_MOCKS)),
    ("app.routers.attachments",  list(_DB_MOCKS)),
    ("app.services.mention_parser", ["fetchone", "execute"]),
]


@pytest.fixture(autouse=True)
def mock_db_layer():
    for mod, funcs in _DB_TARGETS:
        for fn in funcs:
            patch(f"{mod}.{fn}", new=_DB_MOCKS[fn]).start()
    yield _DB_MOCKS
    for mod, funcs in _DB_TARGETS:
        for fn in funcs:
            patch.stopall()  # simpler: stop ALL patches started by this fixture
    # Actually stop only our patches
    # Use a simpler approach: stopall is global, so let's track patchers
    # For now just use a global list
    # Actually, the standard pattern is to call start/stop on each patcher

# Simpler approach without the complexity above:
_DB_PATCHERS = []


@pytest.fixture(autouse=True)
def mock_db():
    """Patch db function aliases with shared mocks."""
    global _DB_PATCHERS
    _DB_PATCHERS = []
    for mod, funcs in _DB_TARGETS:
        for fn in funcs:
            p = patch(f"{mod}.{fn}", new=_DB_MOCKS[fn])
            p.start()
            _DB_PATCHERS.append(p)

    # Reset state between tests (including side_effect!)
    for m in [mock_fetchall, mock_fetchone, mock_execute, mock_insert]:
        m.reset_mock()
        m.side_effect = None
    mock_fetchall.return_value = []
    mock_fetchone.return_value = None
    mock_execute.return_value = None
    mock_insert.return_value = 1

    yield _DB_MOCKS

    for p in _DB_PATCHERS:
        p.stop()
    _DB_PATCHERS = []


# ── Auth session mock ───────────────────────────────────────────────
mock_verify_session = MagicMock(name="verify_session")
mock_verify_session.return_value = {
    "user_code": "admin",
    "user_role": "admin",
    "department": "IT",
    "full_name": "Administrator",
}

_AUTH_TARGETS = [
    "app.core.auth",
    "app.routers.comments",
    "app.routers.attachments",
]

_AUTH_PATCHERS = []


@pytest.fixture(autouse=True)
def mock_auth():
    """Patch verify_session with a shared mock returning admin."""
    global _AUTH_PATCHERS
    _AUTH_PATCHERS = []
    for mod in _AUTH_TARGETS:
        p = patch(f"{mod}.verify_session", new=mock_verify_session)
        p.start()
        _AUTH_PATCHERS.append(p)

    mock_verify_session.reset_mock()
    mock_verify_session.return_value = {
        "user_code": "admin",
        "user_role": "admin",
        "department": "IT",
        "full_name": "Administrator",
    }

    yield mock_verify_session  # tests can override mock_verify_session.return_value

    for p in _AUTH_PATCHERS:
        p.stop()
    _AUTH_PATCHERS = []


# ── Events mock ─────────────────────────────────────────────────────
mock_publish_sync = MagicMock(name="publish_sync")
_EVENTS_PATCHERS = []


@pytest.fixture(autouse=True)
def mock_events():
    global _EVENTS_PATCHERS
    _EVENTS_PATCHERS = [patch('app.core.events.publish_sync', new=mock_publish_sync)]
    _EVENTS_PATCHERS[0].start()
    mock_publish_sync.reset_mock()
    yield mock_publish_sync
    _EVENTS_PATCHERS[0].stop()
    _EVENTS_PATCHERS = []


# Backward‑compatible aliases so existing test code keeps working
@pytest.fixture(autouse=True)
def mock_db_layer(mock_db):
    return mock_db

@pytest.fixture(autouse=True)
def mock_auth_session(mock_auth):
    return mock_auth
