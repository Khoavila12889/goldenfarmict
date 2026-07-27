"""
DB Abstraction Layer — SQLAlchemy engine.
"""

from sqlalchemy import text
from .session import SessionLocal, DATABASE_URL


_IS_POSTGRES = DATABASE_URL.startswith("postgresql")


def fetchall(sql: str, params: dict | list | None = None):
    with SessionLocal() as sess:
        rows = sess.execute(text(sql), params or {}).mappings().all()
        return [dict(r) for r in rows]


def fetchone(sql: str, params: dict | list | None = None):
    with SessionLocal() as sess:
        row = sess.execute(text(sql), params or {}).mappings().first()
        if row is None:
            return None
        return dict(row)


def execute(sql: str, params: dict | list | None = None):
    with SessionLocal() as sess:
        sess.execute(text(sql), params or {})
        sess.commit()


def insert(sql: str, params: dict | list | None = None):
    with SessionLocal() as sess:
        result = sess.execute(text(sql), params or {})
        sess.commit()
        if _IS_POSTGRES:
            return result.inserted_primary_key[0] if result.inserted_primary_key else None
        else:
            return sess.execute(text("SELECT last_insert_rowid()")).scalar()


def execute_many(sql: str, seq_params: list[dict | list]):
    with SessionLocal() as sess:
        for params in seq_params:
            sess.execute(text(sql), params)
        sess.commit()
