import asyncio
import json
from threading import Lock

_subscribers = set()
_lock = Lock()
_loop: asyncio.AbstractEventLoop | None = None


def init(loop: asyncio.AbstractEventLoop):
    global _loop
    _loop = loop


def subscribe():
    q: asyncio.Queue = asyncio.Queue()
    with _lock:
        _subscribers.add(q)
    return q


def unsubscribe(q):
    with _lock:
        _subscribers.discard(q)


async def publish(event: str, data: dict):
    payload = f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
    dead = []
    with _lock:
        for q in _subscribers:
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                dead.append(q)
    with _lock:
        for q in dead:
            _subscribers.discard(q)


def publish_sync(event: str, data: dict):
    if _loop is None or not _loop.is_running():
        return
    asyncio.run_coroutine_threadsafe(publish(event, data), _loop)


async def event_generator():
    q = subscribe()
    try:
        while True:
            msg = await q.get()
            yield msg
    except asyncio.CancelledError:
        pass
    finally:
        unsubscribe(q)
