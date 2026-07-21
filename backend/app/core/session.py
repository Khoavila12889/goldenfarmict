"""
SQLAlchemy Session & Engine.

Khi migrate sang PostgreSQL, CHỈ CẦN đổi DATABASE_URL:
    DATABASE_URL = "postgresql://user:pass@host:5432/dbname"
"""
import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

try:
    from dotenv import load_dotenv
    _dotenv = Path(__file__).parent.parent.parent.parent / '.env'
    if _dotenv.exists():
        load_dotenv(str(_dotenv))
except Exception:
    pass

# DATABASE_URL env var (ưu tiên) → fallback Docker path
_DEFAULT_DB = os.getenv("DATABASE_URL")
if not _DEFAULT_DB:
    _PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
    _DEFAULT_DB = f"sqlite:///{_PROJECT_ROOT / 'backend' / 'company.db'}"
    # Trong Docker đường dẫn khác
    if os.path.exists('/.dockerenv'):
        _DEFAULT_DB = "sqlite:////app/data/company.db"

DATABASE_URL = os.getenv("DATABASE_URL", _DEFAULT_DB)

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