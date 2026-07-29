"""
SQLAlchemy Session & Engine - PostgreSQL Only

This project uses PostgreSQL as the primary database.
The DATABASE_URL must be configured before running the application.

Configuration in .env:
    DATABASE_URL=postgresql://user:password@host:5432/database_name
"""
import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base


# Load environment variables
try:
    from dotenv import load_dotenv
    _dotenv = Path(__file__).parent.parent.parent.parent / '.env'
    if _dotenv.exists():
        load_dotenv(str(_dotenv))
except Exception:
    pass

# DATABASE_URL is REQUIRED for PostgreSQL
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL environment variable is required. "
        "Configure it in .env file as: "
        "DATABASE_URL=postgresql://user:password@host:5432/database_name"
    )

if not DATABASE_URL.startswith("postgresql"):
    raise RuntimeError(
        f"Invalid DATABASE_URL: {DATABASE_URL}. "
        "Only PostgreSQL is supported. "
        "Use format: postgresql://user:password@host:port/database"
    )

# PostgreSQL connection settings
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,      # Validate connections before use
    pool_recycle=3600,       # Recycle connections every hour
    pool_size=10,            # Maximum connections in pool
    max_overflow=20,         # Maximum overflow connections
    echo=False
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_session():
    """Get database session (dependency injection)"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
