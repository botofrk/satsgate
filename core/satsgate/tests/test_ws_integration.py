"""WebSocket tests."""
import json
import pytest
import jwt as pyjwt
from unittest.mock import AsyncMock, MagicMock

from app.main import app
from app.config import JWT_SECRET
from app.ws import ConnectionManager, notify_balance_updated, notify_payment_received, notify_topup_completed


def make_token(pubkey: str) -> str:
    return pyjwt.encode({"sub": pubkey, "exp": 9999999999}, JWT_SECRET, algorithm="HS256")


class TestWSManager:
    def test_send_no_connections(self):
        import asyncio
        loop = asyncio.new_event_loop()
        mgr = ConnectionManager()
        loop.run_until_complete(mgr.send_to_client(99999, "test", {"x": 1}))
        loop.close()

    def test_connect_disconnect(self):
        import asyncio
        loop = asyncio.new_event_loop()
        mgr = ConnectionManager()
        mock_ws = AsyncMock()
        loop.run_until_complete(mgr.connect(mock_ws, 42))
        assert 42 in mgr.active_connections
        mgr.disconnect(mock_ws, 42)
        assert 42 not in mgr.active_connections
        loop.close()

    def test_broadcast(self):
        import asyncio
        loop = asyncio.new_event_loop()
        mgr = ConnectionManager()
        mock_ws1 = MagicMock()
        mock_ws1.send_text = AsyncMock()
        mock_ws2 = MagicMock()
        mock_ws2.send_text = AsyncMock()
        mgr.active_connections[1] = {mock_ws1}
        mgr.active_connections[2] = {mock_ws2}
        loop.run_until_complete(mgr.broadcast("test_event", {"data": "hello"}))
        mock_ws1.send_text.assert_called_once()
        mock_ws2.send_text.assert_called_once()
        del mgr.active_connections[1]
        del mgr.active_connections[2]
        loop.close()

    def test_send_removes_dead(self):
        import asyncio
        loop = asyncio.new_event_loop()
        mgr = ConnectionManager()
        mock_ws = MagicMock()
        mock_ws.send_text = AsyncMock(side_effect=Exception("dead"))
        mgr.active_connections[77] = {mock_ws}
        loop.run_until_complete(mgr.send_to_client(77, "test", {}))
        assert 77 not in mgr.active_connections
        loop.close()


class TestWSNotifyHelpers:
    def test_notify_no_crash(self):
        import asyncio
        loop = asyncio.new_event_loop()
        loop.run_until_complete(notify_balance_updated(99999, 100))
        loop.run_until_complete(notify_payment_received(99999, "abc", 10))
        loop.run_until_complete(notify_topup_completed(99999, 50, 150))
        loop.close()
