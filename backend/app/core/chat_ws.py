"""
WebSocket Connection Manager — Chat Nội bộ.

Quản lý các kết nối WebSocket theo `employee_code`.
Hoạt động ĐỘC LẬP với hệ thống SSE (`core/events.py`).

Một user có thể mở nhiều tab → lưu theo `Set[WebSocket]`.
"""
import asyncio
from typing import Dict, List, Optional, Set

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, employee_code: str) -> None:
        """Accept connection và gắn vào danh sách theo employee_code."""
        await websocket.accept()
        async with self._lock:
            self._connections.setdefault(employee_code, set()).add(websocket)

    async def disconnect(self, employee_code: str) -> None:
        """Ngắt toàn bộ kết nối của một employee_code (khi client rời phòng)."""
        async with self._lock:
            self._connections.pop(employee_code, None)

    async def send_personal_message(self, message: dict, employee_code: str) -> None:
        """Gửi tin nhắn tới tất cả WebSocket của một employee_code."""
        sockets = self._connections.get(employee_code)
        if not sockets:
            return
        dead: List[WebSocket] = []
        for ws in list(sockets):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                current = self._connections.get(employee_code)
                if current:
                    for ws in dead:
                        current.discard(ws)
                    if not current:
                        self._connections.pop(employee_code, None)

    async def broadcast_to_room(self, message: dict, list_employee_codes: List[str]) -> None:
        """Gửi tin nhắn tới tất cả thành viên của phòng."""
        for code in list_employee_codes:
            await self.send_personal_message(message, code)

    def active_connections(self) -> List[str]:
        """Trả về danh sách employee_code đang kết nối (debug/monitor)."""
        return list(self._connections.keys())
