"""
Redis Pub/Sub bridge — đồng bộ tin nhắn giữa nhiều uvicorn worker.

────────────────────────────────────────────────────────────────────────────
VẤN ĐỀ SCALE-OUT
────────────────────────────────────────────────────────────────────────────
Mỗi uvicorn worker là 1 process riêng → ConnectionManager chỉ biết socket
*local*. User A kết nối worker-1, user B kết nối worker-2 → broadcast local
của worker-1 **không** tới B.

────────────────────────────────────────────────────────────────────────────
GIẢI PHÁP
────────────────────────────────────────────────────────────────────────────
                    ┌─────────────┐
   Client A ──────►│  Worker 1   │──publish──┐
                    │  local WS   │           │
                    └─────────────┘           ▼
                                       ┌────────────┐
                                       │   Redis    │
                                       │  Pub/Sub   │
                                       │ chat:bcast │
                                       └────────────┘
                                              │
                    ┌─────────────┐           │
   Client B ──────►│  Worker 2   │◄─subscribe─┘
                    │  local WS   │
                    └─────────────┘

Luồng gửi tin:
  1. Worker nhận message từ client (WS).
  2. Validate + enqueue persist DB (background).
  3. Publish payload + list employee_codes lên channel Redis.
  4. *Mọi* worker (kể cả origin) subscribe → `broadcast_to_codes(..., local_only=True)`
     chỉ fan-out socket local. Không publish lại → tránh vòng lặp.

Env:
  CHAT_REDIS_URL=redis://localhost:6379/0   (bật bridge)
  CHAT_REDIS_CHANNEL=chat:broadcast         (optional)
  CHAT_REDIS_ENABLED=1                      (optional force on)

Nếu không set CHAT_REDIS_URL → no-op, single-worker mode.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import TYPE_CHECKING, List, Optional

logger = logging.getLogger("chat.redis")

if TYPE_CHECKING:
    from app.core.chat_ws import ConnectionManager

REDIS_URL = os.environ.get("CHAT_REDIS_URL") or os.environ.get("REDIS_URL") or ""
REDIS_CHANNEL = os.environ.get("CHAT_REDIS_CHANNEL", "chat:broadcast")
REDIS_ENABLED = os.environ.get("CHAT_REDIS_ENABLED", "").lower() in ("1", "true", "yes")


class ChatRedisBridge:
    """
    Pub/Sub bridge gắn với ConnectionManager.

    - publish(message, codes): serialize JSON → Redis
    - _listener: nhận message → local fan-out
    """

    def __init__(self, manager: "ConnectionManager") -> None:
        self.manager = manager
        self._redis = None
        self._pubsub = None
        self._listener_task: Optional[asyncio.Task] = None
        self._enabled = False
        self.published = 0
        self.received = 0

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def start(self) -> bool:
        """
        Kết nối Redis + subscribe. Trả True nếu bật thành công.
        Fail-soft: lỗi Redis → log warning, app vẫn chạy single-worker.
        """
        url = REDIS_URL.strip()
        if not url and not REDIS_ENABLED:
            logger.info("ChatRedisBridge OFF (set CHAT_REDIS_URL to enable multi-worker)")
            return False
        if not url:
            url = "redis://localhost:6379/0"

        try:
            import redis.asyncio as aioredis  # type: ignore
        except ImportError:
            logger.warning(
                "redis package missing — pip install redis>=5.0.0  "
                "(multi-worker chat disabled)"
            )
            return False

        try:
            self._redis = aioredis.from_url(
                url,
                decode_responses=True,
                socket_connect_timeout=2.0,
                health_check_interval=30,
            )
            # Ping để fail sớm nếu Redis down.
            await asyncio.wait_for(self._redis.ping(), timeout=2.0)
            self._pubsub = self._redis.pubsub()
            await self._pubsub.subscribe(REDIS_CHANNEL)
            self._listener_task = asyncio.create_task(
                self._listen(), name="chat-redis-listener"
            )
            self._enabled = True
            # Gắn hook publish vào manager.
            self.manager.set_cluster_publish(self.publish)
            logger.info(
                "ChatRedisBridge ON channel=%s worker=%s",
                REDIS_CHANNEL,
                self.manager.worker_id,
            )
            return True
        except Exception as exc:
            logger.warning("ChatRedisBridge failed to start: %s — single-worker mode", exc)
            await self._cleanup_partial()
            return False

    async def stop(self) -> None:
        self._enabled = False
        self.manager.set_cluster_publish(None)
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except Exception:
                pass
            self._listener_task = None
        await self._cleanup_partial()

    async def _cleanup_partial(self) -> None:
        try:
            if self._pubsub is not None:
                await self._pubsub.unsubscribe(REDIS_CHANNEL)
                await self._pubsub.close()
        except Exception:
            pass
        self._pubsub = None
        try:
            if self._redis is not None:
                await self._redis.close()
        except Exception:
            pass
        self._redis = None

    async def publish(self, message: dict, employee_codes: List[str]) -> None:
        """
        Publish envelope lên Redis. Được gọi từ ConnectionManager.broadcast_to_codes
        khi local_only=False.
        """
        if not self._enabled or self._redis is None:
            return
        envelope = {
            "origin": self.manager.worker_id,
            "codes": employee_codes,
            "payload": message,
        }
        try:
            await self._redis.publish(REDIS_CHANNEL, json.dumps(envelope, default=str))
            self.published += 1
        except Exception as exc:
            logger.warning("Redis publish error: %s", exc)

    async def _listen(self) -> None:
        """Nhận message từ Redis → fan-out local sockets only."""
        assert self._pubsub is not None
        try:
            async for raw in self._pubsub.listen():
                if not self._enabled:
                    break
                if raw is None or raw.get("type") != "message":
                    continue
                data = raw.get("data")
                if not data or not isinstance(data, str):
                    continue
                try:
                    envelope = json.loads(data)
                except json.JSONDecodeError:
                    continue

                origin = envelope.get("origin")
                # Bỏ qua message do chính worker này publish
                # (đã fan-out local trước khi publish — tránh double-send).
                # Lưu ý: design hiện tại publish *sau* local send trong
                # broadcast_to_codes → origin skip là BẮT BUỘC.
                if origin == self.manager.worker_id:
                    continue

                payload = envelope.get("payload")
                codes = envelope.get("codes") or []
                if not payload or not codes:
                    continue

                self.received += 1
                try:
                    await self.manager.broadcast_to_codes(
                        payload, codes, local_only=True
                    )
                except Exception as exc:
                    logger.warning("local fan-out from redis failed: %s", exc)
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.exception("Redis listener died: %s", exc)

    def stats(self) -> dict:
        return {
            "enabled": self._enabled,
            "channel": REDIS_CHANNEL,
            "published": self.published,
            "received": self.received,
            "worker_id": self.manager.worker_id,
        }


# ── Hướng dẫn vận hành multi-worker ───────────────────────────────────────
"""
SCALE-OUT CHECKLIST
===================

1. Cài Redis + package:
       docker run -d --name redis -p 6379:6379 redis:7-alpine
       pip install "redis>=5.0.0"

2. Env:
       CHAT_REDIS_URL=redis://127.0.0.1:6379/0

3. Chạy nhiều worker (KHÔNG dùng --reload):
       uvicorn main:app --host 0.0.0.0 --port 8080 --workers 4
   hoặc gunicorn:
       gunicorn main:app -k uvicorn.workers.UvicornWorker -w 4 -b 0.0.0.0:8080

4. Sticky sessions? KHÔNG bắt buộc với Pub/Sub — mỗi message fan-out qua Redis.
   Tuy nhiên WebSocket vẫn gắn 1 worker suốt đời kết nối (OK).

5. Shared state còn lại:
   - Online presence: mỗi worker chỉ biết local online.
     → Nâng cấp: lưu set online vào Redis SET `chat:online` (SADD/SREM
       khi connect/disconnect), presence broadcast đọc từ Redis.
   - Room member cache: per-process OK (TTL ngắn); hoặc Redis cache.

6. DB:
   - pool_size * workers ≤ max_connections PostgreSQL.
   - MessagePersistQueue per-worker → OK (idempotent UUID primary key).

7. Kiểm tra:
       python scripts/chat_load_test.py --url ws://host/api/chat/ws --users 100
"""
