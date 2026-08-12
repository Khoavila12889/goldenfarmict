"""
GOLDENFARM ICT Management - Backend API (FastAPI)
Run: uvicorn main:app --host 127.0.0.1 --port 8080 --reload
"""
import asyncio
import os
from datetime import datetime
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from sqlalchemy import text
from app.core.auth import hash_password
from app.core import events
from app.routers import auth, employees, equipment, tickets, bookings, dashboard, licenses, software, approvals, business_trips, departments, salary_slips, salary_user, documents, todos, comments, attachments, monitor, shares, chat, forum

app = FastAPI(title="GOLDENFARM ICT API", version="1.0.0")

_CORS_ORIGINS = os.environ.get(
    'CORS_ORIGINS',
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost,http://127.0.0.1,capacitor://localhost,https://localhost'
).split(',')
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(employees.router)
app.include_router(equipment.router)
app.include_router(tickets.router)
app.include_router(bookings.router)
app.include_router(dashboard.router)
app.include_router(licenses.router)
app.include_router(software.router)
app.include_router(approvals.router)
app.include_router(business_trips.router)
app.include_router(departments.router)
app.include_router(salary_slips.router)
app.include_router(salary_user.router)
app.include_router(documents.router)
app.include_router(shares.router)
app.include_router(todos.router)
app.include_router(comments.router)
app.include_router(attachments.router)
app.include_router(monitor.router)
app.include_router(chat.router)
app.include_router(forum.router)


@app.on_event("startup")
async def on_startup():
    events.init(asyncio.get_event_loop())

    # Chat realtime runtime: heartbeat, persist queue, Redis bridge (optional)
    from app.routers.chat import start_chat_runtime
    await start_chat_runtime()

    from app.models import Base
    from app.core.session import engine, SessionLocal

    # Create all tables via ORM (PostgreSQL)
    Base.metadata.create_all(bind=engine, checkfirst=True)

    # Ensure unique constraints exist for permission tables (needed for ON CONFLICT upsert)
    _ensure_permission_constraints(engine)

    # Add missing columns for existing tables (before ORM queries)
    with SessionLocal() as sess:
        try:
            sess.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_first_login BOOLEAN DEFAULT TRUE"))
            sess.commit()
        except Exception as e:
            sess.rollback()
            print(f"  → users.is_first_login migration: {e}")

    # employees.start_date — ngày vào làm (tách khỏi handover_date ngày bàn giao thiết bị)
    with SessionLocal() as sess:
        try:
            sess.execute(text("ALTER TABLE employees ADD COLUMN IF NOT EXISTS start_date TEXT DEFAULT ''"))
            sess.commit()
        except Exception as e:
            sess.rollback()
            print(f"  → employees.start_date migration: {e}")

    # users.username — tên đăng nhập dễ nhớ (login bằng username hoặc mã NV)
    with SessionLocal() as sess:
        try:
            sess.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT DEFAULT ''"))
            sess.commit()
        except Exception as e:
            sess.rollback()
            print(f"  → users.username migration: {e}")
        try:
            sess.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON users (username) WHERE username <> ''"))
            sess.commit()
        except Exception as e:
            sess.rollback()
            print(f"  → users.username unique index: {e}")

    # document_shares.item_type — distinguishes file vs folder shares
    with SessionLocal() as sess:
        try:
            sess.execute(text(
                "ALTER TABLE document_shares "
                "ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) NOT NULL DEFAULT 'file'"
            ))
            sess.commit()
        except Exception as e:
            sess.rollback()
            print(f"  → document_shares.item_type migration: {e}")

    # document_shares.permissions — comma list: view,download,edit
    # (edit only ever granted for internal ALL/DEPT shares).
    with SessionLocal() as sess:
        try:
            sess.execute(text(
                "ALTER TABLE document_shares "
                "ADD COLUMN IF NOT EXISTS permissions VARCHAR(100) NOT NULL DEFAULT 'view,download'"
            ))
            sess.commit()
        except Exception as e:
            sess.rollback()
            print(f"  → document_shares.permissions migration: {e}")

    # chat_messages.attachment_* — metadata file đính kèm (ảnh / pdf / xlsx)
    with SessionLocal() as sess:
        try:
            sess.execute(text(
                "ALTER TABLE chat_messages "
                "ADD COLUMN IF NOT EXISTS attachment_name TEXT DEFAULT ''"
            ))
            sess.commit()
        except Exception as e:
            sess.rollback()
            print(f"  → chat_messages.attachment_name migration: {e}")
        try:
            sess.execute(text(
                "ALTER TABLE chat_messages "
                "ADD COLUMN IF NOT EXISTS attachment_type VARCHAR(20) DEFAULT ''"
            ))
            sess.commit()
        except Exception as e:
            sess.rollback()
            print(f"  → chat_messages.attachment_type migration: {e}")
        try:
            sess.execute(text(
                "ALTER TABLE chat_messages "
                "ADD COLUMN IF NOT EXISTS attachment_size BIGINT DEFAULT NULL"
            ))
            sess.commit()
        except Exception as e:
            sess.rollback()
            print(f"  → chat_messages.attachment_size migration: {e}")
        try:
            sess.execute(text(
                "ALTER TABLE chat_messages "
                "ADD COLUMN IF NOT EXISTS is_pinned INTEGER DEFAULT 0"
            ))
            sess.commit()
        except Exception as e:
            sess.rollback()
            print(f"  → chat_messages.is_pinned migration: {e}")
        try:
            sess.execute(text(
                "ALTER TABLE chat_messages "
                "ADD COLUMN IF NOT EXISTS pinned_by VARCHAR(50) DEFAULT NULL"
            ))
            sess.commit()
        except Exception as e:
            sess.rollback()
            print(f"  → chat_messages.pinned_by migration: {e}")
        try:
            sess.execute(text(
                "ALTER TABLE chat_messages "
                "ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP DEFAULT NULL"
            ))
            sess.commit()
        except Exception as e:
            sess.rollback()
            print(f"  → chat_messages.pinned_at migration: {e}")

    # forum_posts.attachment_* — file đính kèm trong thông báo (ảnh / pdf / url)
    with SessionLocal() as sess:
        try:
            sess.execute(text(
                "ALTER TABLE forum_posts "
                "ADD COLUMN IF NOT EXISTS attachment_url TEXT DEFAULT ''"
            ))
            sess.commit()
        except Exception as e:
            sess.rollback()
            print(f"  → forum_posts.attachment_url migration: {e}")
        try:
            sess.execute(text(
                "ALTER TABLE forum_posts "
                "ADD COLUMN IF NOT EXISTS attachment_name TEXT DEFAULT ''"
            ))
            sess.commit()
        except Exception as e:
            sess.rollback()
            print(f"  → forum_posts.attachment_name migration: {e}")
        try:
            sess.execute(text(
                "ALTER TABLE forum_posts "
                "ADD COLUMN IF NOT EXISTS attachment_type VARCHAR(20) DEFAULT ''"
            ))
            sess.commit()
        except Exception as e:
            sess.rollback()
            print(f"  → forum_posts.attachment_type migration: {e}")
        try:
            sess.execute(text(
                "ALTER TABLE forum_posts "
                "ADD COLUMN IF NOT EXISTS attachment_size BIGINT DEFAULT 0"
            ))
            sess.commit()
        except Exception as e:
            sess.rollback()
            print(f"  → forum_posts.attachment_size migration: {e}")

    # chat_rooms.department — phòng chat phòng ban (type='department')
    with SessionLocal() as sess:
        try:
            sess.execute(text(
                "ALTER TABLE chat_rooms "
                "ADD COLUMN IF NOT EXISTS department VARCHAR(255) DEFAULT NULL"
            ))
            sess.commit()
        except Exception as e:
            sess.rollback()
            print(f"  → chat_rooms.department migration: {e}")
        try:
            sess.execute(text(
                "ALTER TABLE chat_rooms "
                "ADD COLUMN IF NOT EXISTS owner_code VARCHAR(50) DEFAULT NULL"
            ))
            sess.commit()
        except Exception as e:
            sess.rollback()
            print(f"  → chat_rooms.owner_code migration: {e}")

    # Seed default admin user if not exists
    session = SessionLocal()
    try:
        from app.models import User
        existing = session.query(User).filter(User.employee_code == 'admin').count()
        if existing == 0:
            session.add(User(
                employee_code='admin',
                password_hash=hash_password('admin'),
                role='admin',
                is_first_login=False,
                created_at=datetime.utcnow().isoformat()
            ))
            session.commit()
            
        # Also seed administrator user
        existing = session.query(User).filter(User.employee_code == 'administrator').count()
        if existing == 0:
            session.add(User(
                employee_code='administrator',
                password_hash=hash_password('administrator'),
                role='admin',
                is_first_login=False,
                created_at=datetime.utcnow().isoformat()
            ))
            session.commit()
    finally:
        session.close()

    # Fix existing storage_config rows where is_active is NULL
    try:
        with SessionLocal() as s:
            s.execute(text(
                "UPDATE storage_config SET is_active = TRUE WHERE is_active IS NULL"
            ))
            s.commit()
    except Exception as e:
        print(f"  → storage_config is_active migration: {e}")


def _ensure_permission_constraints(engine):
    from sqlalchemy import text
    from app.core.session import SessionLocal
    constraints = [
        ("user_permissions", "uq_user_perm", "employee_code, module"),
        ("role_permissions", "uq_role_perm", "role, module"),
        ("department_permissions", "uq_dept_perm", "department, module"),
    ]
    sess = SessionLocal()
    try:
        for table, cname, cols in constraints:
            try:
                sess.execute(text(f"""
                    DO $$ BEGIN
                        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{cname}') THEN
                            ALTER TABLE {table} ADD CONSTRAINT {cname} UNIQUE ({cols});
                        END IF;
                    END $$;
                """))
                sess.commit()
            except Exception as e:
                sess.rollback()
                print(f"  → Constraint {cname} on {table}: {e}")
    finally:
        sess.close()


@app.on_event("shutdown")
async def on_shutdown():
    from app.routers.chat import stop_chat_runtime
    try:
        await stop_chat_runtime()
    except Exception as e:
        print(f"  → chat runtime shutdown: {e}")
    from app.core.session import engine
    engine.dispose()


@app.get("/api/events")
async def global_sse(request: Request):
    async def stream():
        try:
            # Send initial connection message
            yield "event: connected\ndata: {\"status\":\"connected\"}\n\n"
            
            async for msg in events.event_generator():
                if await request.is_disconnected():
                    break
                yield msg
                
                # Send heartbeat every few messages to keep connection alive
                await asyncio.sleep(0.01)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"SSE error: {e}")
            pass

    return StreamingResponse(
        stream(), 
        media_type="text/event-stream", 
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        }
    )


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "GOLDENFARM ICT API", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
