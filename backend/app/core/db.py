"""
DB Abstraction Layer — SQLAlchemy engine.

Module MỚI dùng file này.
Module CŨ vẫn dùng get_conn() — không ảnh hưởng.

Khi migrate sang PostgreSQL:
  - Chỉ cần đổi DATABASE_URL trong session.py
  - File này không cần sửa
"""

from sqlalchemy import text
from .session import SessionLocal


def fetchall(sql: str, params: tuple | list | None = None):
    with SessionLocal() as sess:
        rows = sess.execute(text(sql), params or {}).mappings().all()
        return [dict(r) for r in rows]


def fetchone(sql: str, params: tuple | list | None = None):
    with SessionLocal() as sess:
        row = sess.execute(text(sql), params or {}).mappings().first()
        if row is None:
            return None
        return dict(row)


def execute(sql: str, params: tuple | list | None = None):
    with SessionLocal() as sess:
        sess.execute(text(sql), params or {})
        sess.commit()


def insert(sql: str, params: tuple | list | None = None):
    with SessionLocal() as sess:
        sess.execute(text(sql), params or {})
        sess.commit()
        # SQLite-specific: PostgreSQL dùng RETURNING id
        row = sess.execute(text("SELECT last_insert_rowid()")).scalar()
        return row


def execute_many(sql: str, seq_params: list[tuple | list]):
    with SessionLocal() as sess:
        for params in seq_params:
            sess.execute(text(sql), params)
        sess.commit()
