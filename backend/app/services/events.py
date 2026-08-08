"""In-process pub/sub so WebSocket clients hear about drops the moment they open.

Single-process only. Move to Redis pub/sub if you ever run more than one worker.
"""

import asyncio
from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._rooms: dict[int, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, group_id: int, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._rooms[group_id].add(ws)

    async def disconnect(self, group_id: int, ws: WebSocket) -> None:
        async with self._lock:
            self._rooms[group_id].discard(ws)

    async def broadcast(self, group_id: int, message: dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._rooms.get(group_id, ()))
        dead: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self._rooms[group_id].discard(ws)


manager = ConnectionManager()
