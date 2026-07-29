"""
DB Abstraction Layer — PostgreSQL Optimized.

This module provides a simple abstraction layer over SQLAlchemy
for executing raw SQL queries with PostgreSQL compatibility.
"""
from sqlalchemy import text
from .session import SessionLocal, DATABASE_URL


_IS_POSTGRES = DATABASE_URL.startswith("postgresql")


def fetchall(sql: str, params: dict | list | None = None):
    """Execute SELECT query and return all rows as list of dicts"""
    with SessionLocal() as sess:
        rows = sess.execute(text(sql), params or {}).mappings().all()
        return [dict(r) for r in rows]


def fetchone(sql: str, params: dict | list | None = None):
    """Execute SELECT query and return single row as dict or None"""
    with SessionLocal() as sess:
        row = sess.execute(text(sql), params or {}).mappings().first()
        if row is None:
            return None
        return dict(row)


def execute(sql: str, params: dict | list | None = None):
    """Execute INSERT/UPDATE/DELETE and commit"""
    with SessionLocal() as sess:
        sess.execute(text(sql), params or {})
        sess.commit()


def insert(sql: str, params: dict | list | None = None):
    """
    Execute INSERT and return the new row's ID.
    
    For PostgreSQL with RETURNING clause, we use execute().scalar() 
    to get the returned value directly.
    """
    with SessionLocal() as sess:
        result = sess.execute(text(sql), params or {})
        sess.commit()
        
        # For PostgreSQL with RETURNING, use scalar() to get the returned value
        # This works because RETURNING returns a single scalar value for the id
        try:
            # Try to get the first column of the first row
            rows = result.fetchall()
            if rows:
                # Get the first column value (should be the id)
                first_row = rows[0]
                if hasattr(first_row, '_mapping'):
                    # RowMapping object
                    items = dict(first_row._mapping)
                else:
                    # Regular tuple/dict
                    items = dict(first_row)
                
                if 'id' in items:
                    return items['id']
        except Exception:
            pass
        
        # Fallback: return None
        return None


def execute_many(sql: str, seq_params: list[dict | list]):
    """Execute the same SQL statement with multiple parameter sets"""
    with SessionLocal() as sess:
        for params in seq_params:
            sess.execute(text(sql), params)
        sess.commit()
