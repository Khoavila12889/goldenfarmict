"""Unit tests for Mention Parser Service."""

import pytest
from app.services.mention_parser import parse_mentions, create_mention_notifications
from unittest.mock import patch


class TestParseMentions:
    def test_empty_content(self):
        assert parse_mentions("") == []
        assert parse_mentions(None) == []
        assert parse_mentions("   ") == []

    def test_no_mentions(self):
        assert parse_mentions("Hello world") == []
        assert parse_mentions("This is a comment without any mention") == []

    def test_single_mention(self):
        result = parse_mentions("Xin chào @admin")
        assert result == ["admin"]

    def test_multiple_mentions(self):
        result = parse_mentions("@admin và @user1 cùng @user2")
        assert sorted(result) == sorted(["admin", "user1", "user2"])

    def test_duplicate_mentions_deduped(self):
        result = parse_mentions("@admin @admin @admin")
        assert result == ["admin"]

    def test_mention_with_dots_and_hyphens(self):
        """employee_code can contain dots and hyphens (e.g. nv.001, nv-002)"""
        result = parse_mentions("@nv.001 và @nv-002")
        assert sorted(result) == sorted(["nv.001", "nv-002"])

    def test_mention_not_part_of_word(self):
        """@ should only match at word boundary"""
        result = parse_mentions("email@domain.com không phải mention")
        assert result == ["domain.com"]

    def test_mention_at_start_and_end(self):
        result = parse_mentions("@admin ơi giúp @user1")
        assert result == ["admin", "user1"]


class TestCreateMentionNotifications:
    def test_creates_notification_for_valid_mention(self):
        """Only insert notification if employee exists in DB."""
        with patch('app.services.mention_parser.fetchone') as m_fetchone, \
             patch('app.services.mention_parser.execute') as m_execute:
            m_fetchone.return_value = {"full_name": "Nguyễn Văn A"}

            create_mention_notifications(
                todo_id=42,
                mentioned_codes=["user1"],
                triggered_by_code="admin",
                triggered_by_name="Administrator"
            )

            m_execute.assert_called_once()
            call_kwargs = m_execute.call_args[0][1]
            assert call_kwargs["user_code"] == "user1"
            assert call_kwargs["todo_id"] == 42
            assert "Administrator" in call_kwargs["message"]
            assert "42" in call_kwargs["message"]

    def test_skips_unknown_employee(self):
        """If employee not found in DB, no notification created."""
        with patch('app.services.mention_parser.fetchone') as m_fetchone, \
             patch('app.services.mention_parser.execute') as m_execute:
            m_fetchone.return_value = None  # Employee not found

            create_mention_notifications(
                todo_id=42,
                mentioned_codes=["unknown_user"],
                triggered_by_code="admin",
                triggered_by_name="Administrator"
            )

            m_execute.assert_not_called()

    def test_empty_mention_list_does_nothing(self):
        with patch('app.services.mention_parser.execute') as m_execute:
            create_mention_notifications(
                todo_id=42, mentioned_codes=[], triggered_by_code="admin", triggered_by_name="Admin"
            )
            m_execute.assert_not_called()

    def test_multiple_valid_mentions_create_multiple_notifications(self):
        with patch('app.services.mention_parser.fetchone') as m_fetchone, \
             patch('app.services.mention_parser.execute') as m_execute:
            m_fetchone.return_value = {"full_name": "User"}  # All exist

            create_mention_notifications(
                todo_id=1,
                mentioned_codes=["user1", "user2", "user3"],
                triggered_by_code="admin",
                triggered_by_name="Admin"
            )

            assert m_execute.call_count == 3
