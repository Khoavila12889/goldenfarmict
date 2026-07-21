"""
SQLAlchemy Session & Engine.

Khi migrate sang PostgreSQL, CHỈ CẦN đổi DATABASE_URL:
    DATABASE_URL = "postgresql://user:pass@host:5432/dbname"
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# ĐÂY LÀ ĐOẠN CHUẨN DÀNH CHO DOCKER
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:////app/data/company.db"
)

_connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    _connect_args["check_same_thread"] = False

engine = create_engine(DATABASE_URL, connect_args=_connect_args, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()