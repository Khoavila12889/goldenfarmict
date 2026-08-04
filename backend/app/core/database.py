"""
Database Initialization - PostgreSQL Only

This module provides database initialization for PostgreSQL.
"""
import os
import re
from pathlib import Path

_PROJECT_ROOT = Path(__file__).parent.parent.parent.parent

try:
    from dotenv import load_dotenv
    _dotenv = _PROJECT_ROOT / '.env'
    if _dotenv.exists():
        load_dotenv(str(_dotenv))
except Exception:
    pass

# PostgreSQL mode only
_DATABASE_URL = os.environ.get('DATABASE_URL', '')

if not _DATABASE_URL:
    raise RuntimeError("DATABASE_URL must be configured in .env file")

if not _DATABASE_URL.startswith('postgresql'):
    raise RuntimeError(f"PostgreSQL only. Invalid DATABASE_URL: {_DATABASE_URL}")


def is_postgres():
    """Check if PostgreSQL is configured (always True in this version)"""
    return True


def init_db():
    """
    Initialize database schema using SQLAlchemy ORM.
    """
    from sqlalchemy import text
    from .session import SessionLocal, Base, engine
    
    print("Initializing PostgreSQL database...")
    
    # Create all tables via ORM (most reliable method)
    Base.metadata.create_all(bind=engine)
    print("Database schema created successfully!")
    
    # Add any missing columns that might have been added after initial release
    session = SessionLocal()
    try:
        # Add columns that might be missing in existing databases
        _add_missing_columns(session)
        session.commit()
        print("Missing columns added if any")
    except Exception as e:
        session.rollback()
        print(f"Warning: Could not add missing columns: {e}")
    finally:
        session.close()
    
    # Seed default data
    _seed_default_data()


def _add_missing_columns(session):
    """Add missing columns to existing tables"""
    # PostgreSQL uses ALTER TABLE ADD COLUMN IF NOT EXISTS syntax
    columns_to_add = [
        ("employees", "personal_email", "TEXT DEFAULT ''"),
        ("employees", "status", "TEXT DEFAULT 'active'"),
        ("employees", "employee_code", "TEXT DEFAULT ''"),
        ("employees", "handover_date", "TEXT DEFAULT ''"),
        ("tickets", "employee_code", "TEXT DEFAULT ''"),
        ("users", "updated_at", "TEXT DEFAULT ''"),
        ("users", "is_first_login", "BOOLEAN DEFAULT TRUE"),
        ("storage_permissions", "department", "TEXT DEFAULT ''"),
        ("storage_permissions", "target_type", "TEXT DEFAULT 'DEPARTMENT'"),
        ("storage_permissions", "can_read", "BOOLEAN DEFAULT TRUE"),
        ("storage_permissions", "can_write", "BOOLEAN DEFAULT FALSE"),
        ("storage_permissions", "can_edit", "BOOLEAN DEFAULT FALSE"),
        ("storage_permissions", "can_delete", "BOOLEAN DEFAULT FALSE"),
        ("storage_permissions", "allow_download", "BOOLEAN DEFAULT TRUE"),
        ("storage_permissions", "can_reshare", "BOOLEAN DEFAULT FALSE"),
        ("storage_permissions", "can_upload", "BOOLEAN DEFAULT FALSE"),
        ("storage_permissions", "expires_at", "TEXT DEFAULT ''"),
        ("storage_permissions", "updated_at", "TEXT DEFAULT ''"),
        ("bookings", "completed_at", "TEXT DEFAULT ''"),
        ("business_trips", "completed_at", "TEXT DEFAULT ''"),
        ("equipment", "asset_code", "TEXT DEFAULT ''"),
        ("equipment", "lifecycle_status", "TEXT DEFAULT ''"),
        ("equipment", "purchase_date", "TEXT DEFAULT ''"),
        ("equipment", "purchase_cost", "TEXT DEFAULT ''"),
        ("equipment_history", "old_status", "TEXT DEFAULT ''"),
        ("equipment_history", "new_status", "TEXT DEFAULT ''"),
        ("equipment_history", "changed_by", "TEXT DEFAULT ''"),
    ]
    
    for table_name, column_name, column_def in columns_to_add:
        try:
            sql = f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS {column_name} {column_def}"
            session.execute(text(sql))
            session.commit()
        except Exception as e:
            session.rollback()
            print(f"Warning: Could not add column {column_name} to {table_name}: {e}")

    # Ensure unique constraints exist for permission tables (needed for ON CONFLICT upsert)
    unique_constraints = [
        ("user_permissions", "uq_user_perm", "employee_code, module"),
        ("role_permissions", "uq_role_perm", "role, module"),
        ("department_permissions", "uq_dept_perm", "department, module"),
    ]
    for table, cname, cols in unique_constraints:
        try:
            session.execute(text(f"""
                DO $$ BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{cname}') THEN
                        ALTER TABLE {table} ADD CONSTRAINT {cname} UNIQUE ({cols});
                    END IF;
                END $$;
            """))
            session.commit()
        except Exception as e:
            session.rollback()
            print(f"Warning: Could not add constraint {cname} to {table}: {e}")


def _seed_default_data():
    """
    Seed default data into the database.
    This is called after table creation.
    """
    from .session import SessionLocal
    from app.models import User, Resource, Department
    from app.core.auth import hash_password
    from datetime import datetime
    
    session = SessionLocal()
    try:
        # Seed default admin user if not exists
        existing = session.query(User).filter(User.employee_code == 'admin').count()
        if existing == 0:
            session.add(User(
                employee_code='admin',
                password_hash=hash_password('admin'),
                role='admin',
                created_at=datetime.utcnow().isoformat()
            ))
            session.commit()
            print("Created default admin user")
        
        # Seed administrator user if not exists
        existing = session.query(User).filter(User.employee_code == 'administrator').count()
        if existing == 0:
            session.add(User(
                employee_code='administrator',
                password_hash=hash_password('administrator'),
                role='admin',
                created_at=datetime.utcnow().isoformat()
            ))
            session.commit()
            print("Created default administrator user")
        
        # Seed default resources if not exists
        existing = session.query(Resource).count()
        if existing == 0:
            defaults = [
                ('car', 'Toyota Innova 29A-1234 (7 chỗ)', 'Phục vụ công tác'),
                ('car', 'Hyundai SantaFe 29B-5678 (7 chỗ)', 'Gia đình'),
                ('car', 'Ford Transit 29C-9012 (16 chỗ)', 'Đưa đón'),
                ('meeting_room', 'Phòng họp A (Tầng 2)', 'Sức chứa 20 người'),
                ('meeting_room', 'Phòng họp B (Tầng 3)', 'Sức chứa 8 người'),
                ('meeting_room', 'Phòng họp C (Tầng 5)', 'Có máy chiếu'),
            ]
            for rtype, name, desc in defaults:
                session.add(Resource(type=rtype, name=name, description=desc))
            session.commit()
            print("Created default resources")
    finally:
        session.close()
