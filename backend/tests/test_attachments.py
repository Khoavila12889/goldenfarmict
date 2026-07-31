"""Integration tests for Attachments Router."""

import io
import os
import sys
import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

COMMON_HEADERS = {
    "X-User-Code": "admin",
    "X-User-Role": "admin",
    "X-User-Dept": "IT",
    "X-User-Token": "mock_token",
}


class TestGetAttachments:
    def test_todo_not_found(self, mock_db_layer):
        mock_db_layer["fetchone"].return_value = None

        resp = client.get("/api/todos/999/attachments", headers=COMMON_HEADERS)
        assert resp.status_code == 404

    def test_empty_attachments(self, mock_db_layer):
        mock_db_layer["fetchone"].return_value = {"id": 1}
        mock_db_layer["fetchall"].return_value = []

        resp = client.get("/api/todos/1/attachments", headers=COMMON_HEADERS)
        assert resp.status_code == 200
        assert resp.json()["data"] == []

    def test_returns_attachment_list(self, mock_db_layer):
        mock_db_layer["fetchone"].return_value = {"id": 1}
        mock_db_layer["fetchall"].return_value = [
            {
                "id": 1, "todo_id": 1, "uploader_code": "admin",
                "file_name": "doc.pdf", "file_type": "pdf",
                "file_size": 1024, "file_url": "/api/uploads/todos/abc.pdf",
                "created_at": "2026-01-01", "uploader_name": "Admin"
            },
        ]

        resp = client.get("/api/todos/1/attachments", headers=COMMON_HEADERS)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data) == 1
        assert data[0]["file_name"] == "doc.pdf"


class TestCreateAttachment:
    @pytest.mark.asyncio
    async def test_upload_success(self, mock_db, mock_events):
        # First fetchone call → todo exists; second → return created attachment
        mock_db["fetchone"].side_effect = [
            {"id": 1},
            {"id": 42, "todo_id": 1, "uploader_code": "admin",
             "file_name": "report.pdf", "file_type": "pdf",
             "file_size": 14, "file_url": "/api/uploads/todos/abc.pdf",
             "created_at": "2026-01-01"},
        ]
        mock_db["insert"].return_value = 42

        resp = client.post(
            "/api/todos/1/attachments",
            headers=COMMON_HEADERS,
            files={"file": ("report.pdf", io.BytesIO(b"%PDF-1.4 data"), "application/pdf")}
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "success"
        assert data["data"]["file_name"] == "report.pdf"

    @pytest.mark.asyncio
    async def test_upload_rejected_extension(self, mock_db_layer):
        mock_db_layer["fetchone"].return_value = {"id": 1}

        resp = client.post(
            "/api/todos/1/attachments",
            headers=COMMON_HEADERS,
            files={"file": ("script.exe", io.BytesIO(b"bad"), "application/octet-stream")}
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_upload_todo_not_found(self, mock_db_layer):
        mock_db_layer["fetchone"].return_value = None

        resp = client.post(
            "/api/todos/999/attachments",
            headers=COMMON_HEADERS,
            files={"file": ("doc.pdf", io.BytesIO(b"data"), "application/pdf")}
        )
        assert resp.status_code == 404


class TestDeleteAttachment:
    def test_delete_success(self, mock_db_layer, mock_events):
        mock_db_layer["fetchone"].return_value = {
            "id": 5, "todo_id": 1, "uploader_code": "admin",
            "file_name": "doc.pdf", "file_url": "/api/uploads/todos/abc123.pdf"
        }

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr('app.routers.attachments.delete_stored_file', lambda x: True)
            resp = client.delete("/api/attachments/5", headers=COMMON_HEADERS)
            assert resp.status_code == 200
            assert resp.json()["status"] == "success"

    def test_delete_not_found(self, mock_db_layer):
        mock_db_layer["fetchone"].return_value = None

        resp = client.delete("/api/attachments/999", headers=COMMON_HEADERS)
        assert resp.status_code == 404

    def test_delete_forbidden_non_owner(self, mock_db_layer, mock_auth_session):
        mock_db_layer["fetchone"].return_value = {
            "id": 5, "todo_id": 1, "uploader_code": "other_user",
            "file_url": "/api/uploads/todos/file.pdf"
        }
        # Override mock_auth_session return value for this test
        mock_auth_session.return_value = {
            "user_code": "current_user",
            "user_role": "user",
            "department": "IT",
            "full_name": "Current User"
        }

        resp = client.delete("/api/attachments/5", headers={
            "X-User-Code": "current_user",
            "X-User-Role": "user",
            "X-User-Dept": "IT",
            "X-User-Token": "mock_token",
        })
        assert resp.status_code == 403

    def test_delete_admin_can_delete_any(self, mock_db_layer, mock_events):
        mock_db_layer["fetchone"].return_value = {
            "id": 5, "todo_id": 1, "uploader_code": "other_user",
            "file_url": "/api/uploads/todos/file.pdf"
        }

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr('app.routers.attachments.delete_stored_file', lambda x: True)
            resp = client.delete("/api/attachments/5", headers=COMMON_HEADERS)
            assert resp.status_code == 200


class TestServeFile:
    def test_serve_nonexistent_file(self):
        resp = client.get("/api/uploads/todos/nonexistent.pdf")
        # Windows realpath may resolve differently for non-existent paths
        assert resp.status_code in (400, 404)
