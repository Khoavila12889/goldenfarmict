"""Bounded batch persistence. Acknowledgements resolve only after DB commit."""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger("chat.persist")

# Batch: flush khi đủ N message HOẶC sau T giây (cái nào đến trước).
BATCH_SIZE = 32
BATCH_FLUSH_SEC = 0.05  # 50ms — cân bằng latency persist vs throughput
QUEUE_MAXSIZE = 10_000  # back-pressure khi DB chậm
MAX_RETRIES = 3
RETRY_BACKOFF_SEC = 0.5


@dataclass(slots=True)
class PendingMessage:
    """Payload sẵn sàng ghi DB — không phụ thuộc SQLAlchemy object."""

    id: str
    room_id: str
    sender_id: str
    content: str
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    attachment_type: Optional[str] = None
    attachment_size: Optional[int] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    enqueued_at: float = field(default_factory=time.monotonic)


def new_message_id() -> str:
    return str(uuid.uuid4())


class MessagePersistQueue:
    """
    Hàng đợi ghi tin nhắn bất đồng bộ.

    Usage:
        queue = MessagePersistQueue()
        await queue.start()
        ...
        await queue.enqueue(PendingMessage(...))
        ...
        await queue.stop()  # flush còn lại
    """

    def __init__(
        self,
        *,
        batch_size: int = BATCH_SIZE,
        flush_interval: float = BATCH_FLUSH_SEC,
        maxsize: int = QUEUE_MAXSIZE,
    ) -> None:
        self._queue: asyncio.Queue[Optional[PendingMessage]] = asyncio.Queue(maxsize=maxsize)
        self._batch_size = batch_size
        self._flush_interval = flush_interval
        self._worker: Optional[asyncio.Task] = None
        self._started = False
        self._receipts: dict[str, asyncio.Future] = {}
        # Metrics
        self.enqueued = 0
        self.persisted = 0
        self.failed = 0
        self.dropped = 0

    async def start(self) -> None:
        if self._started:
            return
        self._started = True
        self._worker = asyncio.create_task(self._run(), name="chat-persist-worker")
        logger.info(
            "MessagePersistQueue started (batch=%d, flush=%.0fms)",
            self._batch_size,
            self._flush_interval * 1000,
        )

    async def stop(self) -> None:
        """Signal worker flush & exit."""
        self._started = False
        if self._worker is None:
            return
        # Drain accepted work. Do not cancel an in-flight database commit.
        await self._queue.put(None)
        await self._worker
        self._worker = None

    async def persist(self, msg: PendingMessage) -> None:
        """Bounded admission; never report success before durable storage."""
        if not self._started:
            raise RuntimeError("Chat storage is unavailable")
        receipt = asyncio.get_running_loop().create_future()
        self._receipts[msg.id] = receipt
        try:
            if not await self.enqueue(msg):
                raise RuntimeError("Chat storage is busy")
            await receipt
        finally:
            self._receipts.pop(msg.id, None)

    async def enqueue(self, msg: PendingMessage) -> bool:
        """
        Non-blocking enqueue. Trả False nếu queue đầy (back-pressure).
        Caller có thể fallback sync write hoặc báo lỗi client.
        """
        try:
            self._queue.put_nowait(msg)
            self.enqueued += 1
            return True
        except asyncio.QueueFull:
            self.dropped += 1
            logger.error("Persist queue FULL — drop message id=%s room=%s", msg.id, msg.room_id)
            return False

    def stats(self) -> dict:
        return {
            "queue_size": self._queue.qsize(),
            "enqueued": self.enqueued,
            "persisted": self.persisted,
            "failed": self.failed,
            "dropped": self.dropped,
        }

    # ── Worker ─────────────────────────────────────────────────────────────

    async def _run(self) -> None:
        batch: List[PendingMessage] = []
        while True:
            try:
                timeout = max(0.001, self._flush_interval - (time.monotonic() - batch[0].enqueued_at)) if batch else None
                try:
                    item = await asyncio.wait_for(self._queue.get(), timeout=timeout)
                except asyncio.TimeoutError:
                    # Đến hạn flush batch dở.
                    if batch:
                        await self._flush(batch)
                        batch = []
                    continue

                if item is None:
                    # Shutdown sentinel.
                    if batch:
                        await self._flush(batch)
                        batch = []
                    # Drain remaining (nếu có).
                    while not self._queue.empty():
                        try:
                            extra = self._queue.get_nowait()
                        except asyncio.QueueEmpty:
                            break
                        if extra is not None:
                            batch.append(extra)
                    if batch:
                        await self._flush(batch)
                    break

                batch.append(item)
                if len(batch) >= self._batch_size:
                    await self._flush(batch)
                    batch = []
            except asyncio.CancelledError:
                if batch:
                    await self._flush(batch)
                break
            except Exception as exc:
                logger.exception("persist worker error: %s", exc)
                await asyncio.sleep(0.2)

    async def _flush(self, batch: List[PendingMessage]) -> None:
        """Ghi batch ra DB trong threadpool — không block event loop."""
        if not batch:
            return
        # copy để caller có thể reuse list
        items = list(batch)
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                # run_in_executor: SQLAlchemy sync I/O không chặn loop.
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, self._bulk_insert_sync, items)
                self.persisted += len(items)
                for item in items:
                    receipt = self._receipts.get(item.id)
                    if receipt is not None and not receipt.done():
                        receipt.set_result(None)
                logger.debug("Persisted batch n=%d (attempt=%d)", len(items), attempt)
                return
            except Exception as exc:
                self.failed += len(items) if attempt == MAX_RETRIES else 0
                logger.warning(
                    "Persist batch failed attempt=%d/%d n=%d: %s",
                    attempt,
                    MAX_RETRIES,
                    len(items),
                    exc,
                )
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(RETRY_BACKOFF_SEC * attempt)
                else:
                    for item in items:
                        receipt = self._receipts.get(item.id)
                        if receipt is not None and not receipt.done():
                            receipt.set_exception(RuntimeError("Không thể lưu tin nhắn"))
                    logger.error(
                        "Persist GAVE UP n=%d ids=%s",
                        len(items),
                        [m.id for m in items[:5]],
                    )

    @staticmethod
    def _bulk_insert_sync(items: List[PendingMessage]) -> None:
        """
        Sync bulk insert — chạy trong thread pool.

        Dùng SQLAlchemy bulk_insert_mappings (1 statement multi-row)
        thay vì add()+commit() từng message.
        """
        from app.core.session import SessionLocal
        from app.models import ChatMessage
        from sqlalchemy.dialects.postgresql import insert
        from sqlalchemy import text

        rows: List[Dict[str, Any]] = [
            {
                "id": m.id,
                "room_id": m.room_id,
                "sender_id": m.sender_id,
                "content": m.content or "",
                "attachment_url": m.attachment_url,
                "attachment_name": m.attachment_name,
                "attachment_type": m.attachment_type,
                "attachment_size": m.attachment_size,
                "is_pinned": 0,
                "pinned_by": None,
                "pinned_at": None,
                "created_at": m.created_at,
            }
            for m in items
        ]
        db = SessionLocal()
        try:
            db.execute(text("SET LOCAL statement_timeout = '5s'"))
            db.execute(text("SET LOCAL lock_timeout = '2s'"))
            db.execute(insert(ChatMessage).values(rows).on_conflict_do_nothing(index_elements=["id"]))
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()


# Singleton dùng chung trong process (1 worker uvicorn = 1 queue).
persist_queue = MessagePersistQueue()


def build_optimistic_payload(
    *,
    msg_id: str,
    room_id: str,
    sender_id: str,
    sender_name: str,
    content: str,
    attachment_url: Optional[str] = None,
    attachment_name: Optional[str] = None,
    attachment_type: Optional[str] = None,
    attachment_size: Optional[int] = None,
    created_at: Optional[datetime] = None,
    client_temp_id: Optional[str] = None,
) -> dict:
    """Serialize payload broadcast — khớp shape `_serialize_message` cũ."""
    ts = created_at or datetime.utcnow()
    payload = {
        "id": msg_id,
        "room_id": room_id,
        "sender_id": sender_id,
        "sender_name": sender_name,
        "content": content,
        "attachment_url": attachment_url,
        "attachment_name": attachment_name,
        "attachment_type": attachment_type,
        "attachment_size": attachment_size,
        "is_pinned": False,
        "pinned_by": None,
        "pinned_at": None,
        "created_at": ts.isoformat(),
    }
    if client_temp_id:
        payload["client_temp_id"] = client_temp_id
    return payload
