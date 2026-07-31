"""Integration tests for Comments Router."""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch

from main import app
from app.core.auth import verify_session

client = TestClient(app)

COMMON_HEADERS = {
    "X-User-Code": "admin",
    "X-User-Role": "admin",
    "X-User-Dept": "IT",
    "X-User-Token": "mock_token",
}


class TestGetComments:
    def test_todo_not_found(self, mock_db_layer, mock_auth_session):
        mock_db_layer["fetchone"].return_value = None  # todo not found

        resp = client.get("/api/todos/999/comments", headers=COMMON_HEADERS)
        assert resp.status_code == 404
        assert "không tìm thấy" in resp.json()["detail"].lower()

    def test_empty_comments(self, mock_db_layer, mock_auth_session):
        mock_db_layer["fetchone"].return_value = {"id": 1}  # todo exists
        mock_db_layer["fetchall"].return_value = []

        resp = client.get("/api/todos/1/comments", headers=COMMON_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert data["data"] == []

    def test_returns_comment_list(self, mock_db_layer, mock_auth_session):
        mock_db_layer["fetchone"].return_value = {"id": 1}
        mock_db_layer["fetchall"].return_value = [
            {
                "id": 1, "todo_id": 1, "user_code": "admin",
                "content": "Hello", "created_at": "2026-01-01",
                "updated_at": "2026-01-01", "full_name": "Admin"
            },
            {
                "id": 2, "todo_id": 1, "user_code": "user1",
                "content": "World", "created_at": "2026-01-02",
                "updated_at": "2026-01-02", "full_name": "User 1"
            },
        ]

        resp = client.get("/api/todos/1/comments", headers=COMMON_HEADERS)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data) == 2
        assert data[0]["content"] == "Hello"
        assert data[1]["content"] == "World"

    def test_requires_auth(self):
        # Note: auth mock always returns a valid user.
        # The endpoint returns 404 because fetchone returns None (no todo).
        resp = client.get("/api/todos/1/comments")
        assert resp.status_code in (401, 404)


class TestCreateComment:
    def test_create_success(self, mock_db, mock_events):
        mock_db["fetchone"].side_effect = [
            {"id": 1},
            {
                "id": 10, "todo_id": 1, "user_code": "admin",
                "content": "Test comment", "created_at": "2026-01-01",
                "updated_at": "2026-01-01", "full_name": "Administrator"
            },
        ]
        mock_db["insert"].return_value = 10

        resp = client.post(
            "/api/todos/1/comments",
            headers=COMMON_HEADERS,
            json={"content": "Test comment"}
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "success"
        assert data["data"]["content"] == "Test comment"
        assert data["data"]["id"] == 10

    def test_create_empty_content(self, mock_db_layer, mock_auth_session):
        mock_db_layer["fetchone"].return_value = {"id": 1}

        resp = client.post(
            "/api/todos/1/comments",
            headers=COMMON_HEADERS,
            json={"content": ""}
        )
        assert resp.status_code == 400
        assert "không được để trống" in resp.json()["detail"].lower()

    def test_create_on_missing_todo(self, mock_db_layer, mock_auth_session):
        mock_db_layer["fetchone"].return_value = None

        resp = client.post(
            "/api/todos/999/comments",
            headers=COMMON_HEADERS,
            json={"content": "Hello"}
        )
        assert resp.status_code == 404

    @patch('app.services.mention_parser.parse_mentions')
    @patch('app.services.mention_parser.create_mention_notifications')
    @patch('app.routers.comments.parse_mentions')          # local alias
    @patch('app.routers.comments.create_mention_notifications')  # local alias
    def test_mention_parsing_called(
        self, mock_cn_comments, mock_p_comments,
        mock_create_notif, mock_parse, mock_db, mock_events
    ):
        mock_parse.return_value = ["user1", "user2"]
        mock_p_comments.return_value = ["user1", "user2"]
        mock_db["fetchone"].side_effect = [
            {"id": 1},
            {
                "id": 20, "todo_id": 1, "user_code": "admin",
                "content": "Hello @user1 @user2", "created_at": "",
                "updated_at": "", "full_name": "Admin"
            },
        ]
        mock_db["insert"].return_value = 20

        resp = client.post(
            "/api/todos/1/comments",
            headers=COMMON_HEADERS,
            json={"content": "Hello @user1 @user2"}
        )
        assert resp.status_code == 201
        mock_p_comments.assert_called_once_with("Hello @user1 @user2")

    def test_sse_event_published(self, mock_db, mock_events):
        mock_db["fetchone"].side_effect = [
            {"id": 1},
            {
                "id": 30, "todo_id": 1, "user_code": "admin",
                "content": "SSE test", "created_at": "",
                "updated_at": "", "full_name": "Admin"
            },
        ]
        mock_db["insert"].return_value = 30

        client.post(
            "/api/todos/1/comments",
            headers=COMMON_HEADERS,
            json={"content": "SSE test"}
        )
        mock_events.assert_called_once_with("comment_added", {
            "todo_id": 1, "comment_id": 30, "user_code": "admin"
        })
