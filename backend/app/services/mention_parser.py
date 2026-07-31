import re
from typing import List
from app.core.db import fetchone, execute

MENTION_PATTERN = re.compile(r'@(\w[\w.-]*)')


def parse_mentions(content: str) -> List[str]:
    if not content:
        return []
    matches = MENTION_PATTERN.findall(content)
    seen = set()
    result = []
    for m in matches:
        if m not in seen:
            seen.add(m)
            result.append(m)
    return result


def create_mention_notifications(
    todo_id: int,
    mentioned_codes: List[str],
    triggered_by_code: str,
    triggered_by_name: str
):
    for code in mentioned_codes:
        emp = fetchone(
            "SELECT full_name FROM employees WHERE employee_code = :code",
            {"code": code}
        )
        if emp:
            execute(
                """
                INSERT INTO notifications (user_code, todo_id, message, is_read, created_at)
                VALUES (:user_code, :todo_id, :message, 0, CURRENT_TIMESTAMP)
                """,
                {
                    "user_code": code,
                    "todo_id": todo_id,
                    "message": f"{triggered_by_name} đã nhắc đến bạn trong công việc #{todo_id}"
                }
            )
