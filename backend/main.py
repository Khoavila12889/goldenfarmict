"""
GOLDENFARM ICT Management - Backend API (FastAPI)
Run: uvicorn main:app --host 127.0.0.1 --port 8080 --reload
"""
import asyncio
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.core.database import init_db
from app.core.auth import seed_users, get_conn
from app.core import events
from app.routers import auth, employees, equipment, tickets, bookings, dashboard, licenses, software, approvals, business_trips, departments, salary_slips, salary_user, documents

app = FastAPI(title="GOLDENFARM ICT API", version="1.0.0")

_CORS_ORIGINS = os.environ.get('CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',')
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


@app.on_event("startup")
def on_startup():
    events.init(asyncio.get_event_loop())
    init_db()
    conn = get_conn()
    seed_users(conn)
    conn.close()
    # Đồng bộ SQLAlchemy ORM models với DB schema hiện tại
    from app.models import Base
    from app.core.session import engine
    Base.metadata.create_all(bind=engine)


@app.on_event("shutdown")
def on_shutdown():
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
