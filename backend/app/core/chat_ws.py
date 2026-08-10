"""
WebSocket Connection Manager — Chat Nội bộ (Performance-optimised).

Thiết kế cho >100 user online + hàng chục group chat hoạt động liên tục:

1. Broadcast song song (asyncio.gather) — không await tuần tự từng socket
   → user thứ 101 không bị block bởi 100 lần send trước đó.
2. Semaphore giới hạn concurrent send — tránh bão I/O làm no-op event loop.
3. Disconnect theo *từng* WebSocket (multi-tab an toàn) — không xoá cả user.
4. Heartbeat + last_pong — dọn dead connection khi user rớt mạng đột ngột.
5. Cấu trúc bộ nhớ gọn: Dict[str, Set[ConnectionMeta]] + reverse map ws→code.
6. Hook Redis Pub/Sub (tuỳ chọn) cho multi-worker scale-out.

Hoạt động ĐỘC LẬP với hệ thống SSE (`core/events.py`).
"""
from __future__ import annotations

import asyncio
import logging
import time
import weakref
from dataclasses import dataclass, field
from typing import (
    Any,
    Awaitable,
    Callable,
    Dict,
    Iterable,
    List,
    Optional,
    Set,
)

from fastapi import WebSocket
from starlette.websockets import WebSocketState

logger = logging.getLogger("chat.ws")

# ── Tunables ──────────────────────────────────────────────────────────────
# Số send song song tối đa mỗi lần broadcast (tránh mở 500 socket write cùng lúc).
BROADCAST_CONCURRENCY = 50
# Chu kỳ heartbeat server → client (giây).
HEARTBEAT_INTERVAL_SEC = 25.0
# Nếu không nhận pong / bất kỳ frame nào trong khoảng này → coi là dead.
HEARTBEAT_TIMEOUT_SEC = 60.0
# Chu kỳ quét dead connection (giây).
SWEEP_INTERVAL_SEC = 15.0


@dataclass(slots=True, eq=False)
class ConnectionMeta:
    """Metadata gắn với 1 WebSocket — tối ưu bộ nhớ (slots)."""

    ws: WebSocket
    employee_code: str
    connected_at: float = field(default_factory=time.monotonic)
    last_seen: float = field(default_factory=time.monotonic)
    # id() của ws — dùng làm key reverse map, tránh giữ strong ref vòng.
    ws_id: int = 0

    def __post_init__(self) -> None:
        self.ws_id = id(self.ws)

    def touch(self) -> None:
        self.last_seen = time.monotonic()


# Callback khi cần publish ra cluster (Redis). Signature: (payload, codes) -> None|Awaitable
BroadcastHook = Callable[[dict, List[str]], Awaitable[None] | None]


class ConnectionManager:
    """
    Quản lý WebSocket theo employee_code, multi-tab an toàn.

    Cấu trúc:
        _by_code:  employee_code → set[ConnectionMeta]
        _by_ws:    id(ws) → ConnectionMeta   (O(1) lookup khi disconnect/send fail)

    Không dùng weakref cho set vì WebSocket lifecycle do FastAPI quản lý;
    cleanup tường minh qua disconnect() + heartbeat sweeper.
    """

    def __init__(
        self,
        *,
        broadcast_concurrency: int = BROADCAST_CONCURRENCY,
        heartbeat_interval: float = HEARTBEAT_INTERVAL_SEC,
        heartbeat_timeout: float = HEARTBEAT_TIMEOUT_SEC,
        sweep_interval: float = SWEEP_INTERVAL_SEC,
    ) -> None:
        self._by_code: Dict[str, Set[ConnectionMeta]] = {}
        self._by_ws: Dict[int, ConnectionMeta] = {}
        self._lock = asyncio.Lock()
        self._sem = asyncio.Semaphore(max(1, broadcast_concurrency))
        self._heartbeat_interval = heartbeat_interval
        self._heartbeat_timeout = heartbeat_timeout
        self._sweep_interval = sweep_interval
        self._bg_tasks: List[asyncio.Task] = []
        self._started = False
        # Hook cluster (Redis): nếu set, local broadcast chỉ gửi local sockets;
        # publish ra Redis do caller/hook xử lý.
        self._cluster_publish: Optional[BroadcastHook] = None
        # Worker id — dùng khi multi-worker để tránh echo (nếu cần).
        self.worker_id: str = f"w-{id(self):x}"

    # ── Lifecycle ──────────────────────────────────────────────────────────

    def set_cluster_publish(self, hook: Optional[BroadcastHook]) -> None:
        """Gắn hook publish Redis (hoặc None để tắt)."""
        self._cluster_publish = hook

    async def start(self) -> None:
        """Khởi động background tasks (heartbeat + dead-conn sweeper)."""
        if self._started:
            return
        self._started = True
        loop = asyncio.get_running_loop()
        self._bg_tasks = [
            loop.create_task(self._heartbeat_loop(), name="chat-ws-heartbeat"),
            loop.create_task(self._sweep_loop(), name="chat-ws-sweep"),
        ]
        logger.info(
            "ConnectionManager started (concurrency=%s, heartbeat=%.0fs, timeout=%.0fs)",
            self._sem._value,  # type: ignore[attr-defined]
            self._heartbeat_interval,
            self._heartbeat_timeout,
        )

    async def stop(self) -> None:
        """Huỷ background tasks khi shutdown."""
        self._started = False
        for t in self._bg_tasks:
            t.cancel()
        if self._bg_tasks:
            await asyncio.gather(*self._bg_tasks, return_exceptions=True)
        self._bg_tasks.clear()

    # ── Connect / Disconnect ───────────────────────────────────────────────

    async def connect(self, websocket: WebSocket, employee_code: str) -> ConnectionMeta:
        """Accept connection và đăng ký theo employee_code (multi-tab OK)."""
        await websocket.accept()
        meta = ConnectionMeta(ws=websocket, employee_code=employee_code)
        async with self._lock:
            self._by_code.setdefault(employee_code, set()).add(meta)
            self._by_ws[meta.ws_id] = meta
        logger.debug("WS connect %s (tabs=%d)", employee_code, len(self._by_code.get(employee_code, ())))
        return meta

    async def disconnect(self, websocket: WebSocket, employee_code: Optional[str] = None) -> bool:
        """
        Ngắt *một* WebSocket cụ thể.

        Trả về True nếu employee_code không còn tab nào online sau khi disconnect
        (dùng để broadcast presence offline).
        """
        ws_id = id(websocket)
        async with self._lock:
            meta = self._by_ws.pop(ws_id, None)
            if meta is None:
                # Fallback: tìm theo employee_code nếu caller chỉ truyền code (legacy).
                if employee_code:
                    bucket = self._by_code.get(employee_code)
                    if bucket:
                        # Không biết ws cụ thể → không xoá cả user (an toàn multi-tab).
                        pass
                return not bool(self._by_code.get(employee_code or "", None))

            code = meta.employee_code
            bucket = self._by_code.get(code)
            if bucket is not None:
                bucket.discard(meta)
                if not bucket:
                    self._by_code.pop(code, None)
                    return True  # user fully offline
            return False

    async def disconnect_employee(self, employee_code: str) -> None:
        """Force-close mọi tab của một employee (admin / kick)."""
        async with self._lock:
            bucket = self._by_code.pop(employee_code, None)
            if not bucket:
                return
            metas = list(bucket)
            for m in metas:
                self._by_ws.pop(m.ws_id, None)
        for m in metas:
            try:
                if m.ws.client_state == WebSocketState.CONNECTED:
                    await m.ws.close(code=1000)
            except Exception:
                pass

    def touch(self, websocket: WebSocket) -> None:
        """Cập nhật last_seen khi nhận frame từ client (pong / message)."""
        meta = self._by_ws.get(id(websocket))
        if meta:
            meta.touch()

    # ── Send primitives ────────────────────────────────────────────────────

    async def _safe_send(self, meta: ConnectionMeta, message: dict) -> Optional[ConnectionMeta]:
        """
        Gửi 1 message tới 1 socket. Trả về meta nếu dead (cần cleanup), else None.

        Dùng semaphore để giới hạn concurrent writes.
        """
        async with self._sem:
            try:
                if meta.ws.client_state != WebSocketState.CONNECTED:
                    return meta
                await meta.ws.send_json(message)
                # Send thành công → connection còn sống (không cần client pong).
                meta.touch()
                return None
            except Exception as exc:
                logger.debug("WS send fail %s: %s", meta.employee_code, exc)
                return meta

    async def _drop_dead(self, dead: Iterable[ConnectionMeta]) -> List[str]:
        """
        Gỡ dead connections. Trả về list employee_code vừa offline hoàn toàn
        (hữu ích cho presence).
        """
        fully_offline: List[str] = []
        dead_list = list(dead)
        if not dead_list:
            return fully_offline
        async with self._lock:
            for meta in dead_list:
                self._by_ws.pop(meta.ws_id, None)
                bucket = self._by_code.get(meta.employee_code)
                if bucket is not None:
                    bucket.discard(meta)
                    if not bucket:
                        self._by_code.pop(meta.employee_code, None)
                        fully_offline.append(meta.employee_code)
        for meta in dead_list:
            try:
                await meta.ws.close(code=1011)
            except Exception:
                pass
        return fully_offline

    async def send_personal_message(self, message: dict, employee_code: str) -> None:
        """Gửi song song tới mọi tab của một employee_code."""
        # Snapshot ngoài lock — tránh giữ lock khi I/O.
        sockets = list(self._by_code.get(employee_code) or ())
        if not sockets:
            return
        results = await asyncio.gather(
            *(self._safe_send(m, message) for m in sockets),
            return_exceptions=True,
        )
        dead: List[ConnectionMeta] = []
        for r in results:
            if isinstance(r, ConnectionMeta):
                dead.append(r)
            elif isinstance(r, Exception):
                logger.debug("send_personal unexpected: %s", r)
        if dead:
            await self._drop_dead(dead)

    async def broadcast_to_codes(
        self,
        message: dict,
        employee_codes: Iterable[str],
        *,
        local_only: bool = False,
    ) -> None:
        """
        Fan-out song song tới mọi socket local của các employee_codes.

        Không await tuần tự → latency fan-out ~ O(1 batch) thay vì O(N).

        local_only=True: chỉ gửi local (dùng khi message đã đến từ Redis
        để tránh publish lại vòng lặp).
        """
        codes = list(employee_codes)
        if not codes:
            return

        # Thu thập toàn bộ meta cần gửi (snapshot).
        targets: List[ConnectionMeta] = []
        for code in codes:
            bucket = self._by_code.get(code)
            if bucket:
                targets.extend(bucket)

        if targets:
            # Chunk theo concurrency để không tạo 10k task cùng lúc.
            # asyncio.gather + semaphore đã giới hạn, nhưng chunk giảm peak memory.
            results = await asyncio.gather(
                *(self._safe_send(m, message) for m in targets),
                return_exceptions=True,
            )
            dead: List[ConnectionMeta] = []
            for r in results:
                if isinstance(r, ConnectionMeta):
                    dead.append(r)
            if dead:
                await self._drop_dead(dead)

        # Publish cluster (nếu có hook và không phải local-only echo).
        if not local_only and self._cluster_publish is not None:
            try:
                maybe = self._cluster_publish(message, codes)
                if asyncio.iscoroutine(maybe) or asyncio.isfuture(maybe):
                    await maybe  # type: ignore[misc]
            except Exception as exc:
                logger.warning("cluster publish failed: %s", exc)

    async def broadcast_to_room(
        self,
        message: dict,
        list_employee_codes: List[str],
        *,
        local_only: bool = False,
    ) -> None:
        """Alias tương thích API cũ — fan-out song song."""
        await self.broadcast_to_codes(
            message, list_employee_codes, local_only=local_only
        )

    async def broadcast_all_online(self, message: dict, *, local_only: bool = False) -> None:
        """Gửi tới mọi user đang online trên worker này (+ cluster nếu có)."""
        codes = self.active_connections()
        await self.broadcast_to_codes(message, codes, local_only=local_only)

    # ── Introspection ──────────────────────────────────────────────────────

    def active_connections(self) -> List[str]:
        """Danh sách employee_code đang có ≥1 WebSocket (debug/monitor/presence)."""
        return list(self._by_code.keys())

    def is_online(self, employee_code: str) -> bool:
        return bool(self._by_code.get(employee_code))

    def connection_count(self) -> int:
        """Tổng số WebSocket (mỗi tab = 1)."""
        return len(self._by_ws)

    def stats(self) -> dict:
        return {
            "workers": self.worker_id,
            "online_users": len(self._by_code),
            "total_sockets": len(self._by_ws),
            "cluster_enabled": self._cluster_publish is not None,
        }

    # ── Heartbeat & dead-connection sweeper ────────────────────────────────

    async def _heartbeat_loop(self) -> None:
        """Gửi ping application-level định kỳ; client nên trả pong hoặc bất kỳ frame."""
        ping_msg = {"event": "ping", "ts": 0}
        while True:
            try:
                await asyncio.sleep(self._heartbeat_interval)
                ping_msg = {"event": "ping", "ts": int(time.time())}
                # Snapshot toàn bộ meta
                metas = list(self._by_ws.values())
                if not metas:
                    continue
                results = await asyncio.gather(
                    *(self._safe_send(m, ping_msg) for m in metas),
                    return_exceptions=True,
                )
                dead = [r for r in results if isinstance(r, ConnectionMeta)]
                if dead:
                    offline = await self._drop_dead(dead)
                    if offline:
                        logger.info("Heartbeat dropped dead sockets; offline=%s", offline)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning("heartbeat loop error: %s", exc)

    async def _sweep_loop(self) -> None:
        """Quét last_seen — user rớt mạng không gửi close frame vẫn bị dọn."""
        while True:
            try:
                await asyncio.sleep(self._sweep_interval)
                now = time.monotonic()
                stale: List[ConnectionMeta] = []
                for meta in list(self._by_ws.values()):
                    if (now - meta.last_seen) > self._heartbeat_timeout:
                        stale.append(meta)
                    elif meta.ws.client_state != WebSocketState.CONNECTED:
                        stale.append(meta)
                if stale:
                    offline = await self._drop_dead(stale)
                    logger.info(
                        "Sweep removed %d dead conn; fully offline=%s",
                        len(stale),
                        offline,
                    )
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning("sweep loop error: %s", exc)
