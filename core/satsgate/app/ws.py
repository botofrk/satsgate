import json
import asyncio
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import jwt
from sqlalchemy import select

from .config import JWT_SECRET
from .database import async_session_maker
from .models import Client

router = APIRouter(prefix="/ws", tags=["websocket"])


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, client_id: int):
        await websocket.accept()
        if client_id not in self.active_connections:
            self.active_connections[client_id] = set()
        self.active_connections[client_id].add(websocket)

    def disconnect(self, websocket: WebSocket, client_id: int):
        if client_id in self.active_connections:
            self.active_connections[client_id].discard(websocket)
            if not self.active_connections[client_id]:
                del self.active_connections[client_id]

    async def send_to_client(self, client_id: int, event: str, data: dict):
        if client_id not in self.active_connections:
            return
        message = json.dumps({"event": event, "data": data, "ts": int(time.time())})
        dead = set()
        for ws in self.active_connections[client_id]:
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)
        if dead:
            self.active_connections[client_id] -= dead
            if not self.active_connections[client_id]:
                del self.active_connections[client_id]

    async def broadcast(self, event: str, data: dict):
        for client_id in list(self.active_connections.keys()):
            await self.send_to_client(client_id, event, data)


manager = ConnectionManager()


async def _resolve_client_id(pubkey: str) -> int | None:
    """Resolve actual client_id from pubkey via database lookup.

    Creates a short-lived session per connection attempt — acceptable for
    WebSocket upgrade frequency. If this pattern is reused elsewhere,
    consider moving to db.py as a shared helper.
    """
    try:
        async with async_session_maker() as session:
            stmt = select(Client.id).where(Client.pubkey == pubkey)
            result = await session.execute(stmt)
            row = result.scalar_one_or_none()
            return row
    except Exception:
        return None


@router.websocket("/notifications")
async def websocket_notifications(websocket: WebSocket, token: str = None):
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        pubkey = payload.get("sub")
    except jwt.InvalidTokenError:
        await websocket.close(code=4001, reason="Invalid token")
        return

    client_id = await _resolve_client_id(pubkey)
    if client_id is None:
        await websocket.close(code=4001, reason="Client not found")
        return

    await manager.connect(websocket, client_id)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text(json.dumps({"event": "pong", "ts": int(time.time())}))
    except WebSocketDisconnect:
        manager.disconnect(websocket, client_id)
    except Exception:
        manager.disconnect(websocket, client_id)


async def notify_balance_updated(client_id: int, new_balance: int):
    await manager.send_to_client(client_id, "balance.updated", {
        "balance": new_balance,
    })

async def notify_payment_received(client_id: int, payment_hash: str, amount_sats: int):
    await manager.send_to_client(client_id, "payment.received", {
        "payment_hash": payment_hash,
        "amount_sats": amount_sats,
    })

async def notify_topup_completed(client_id: int, credits_added: int, new_balance: int):
    await manager.send_to_client(client_id, "topup.completed", {
        "credits_added": credits_added,
        "new_balance": new_balance,
    })
