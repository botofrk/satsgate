"""Test webhook dispatch and retry mechanism."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.mark.asyncio
async def test_sign_payload():
    from app.webhooks import _sign_payload
    payload = {"event": "test", "data": {"key": "value"}}
    secret = "test_secret_key"
    sig = _sign_payload(payload, secret)
    assert isinstance(sig, str)
    assert len(sig) == 64
    sig2 = _sign_payload(payload, secret)
    assert sig == sig2
    sig3 = _sign_payload(payload, "other_secret")
    assert sig != sig3


@pytest.mark.asyncio
async def test_webhook_events_list():
    from app.webhooks import WEBHOOK_EVENTS
    assert "payment.received" in WEBHOOK_EVENTS
    assert "balance.low" in WEBHOOK_EVENTS
    assert "topup.completed" in WEBHOOK_EVENTS
    assert len(WEBHOOK_EVENTS) >= 6


@pytest.mark.asyncio
async def test_dispatch_skips_non_subscribed():
    from app.webhooks import dispatch_webhook_event
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_session.execute.return_value = mock_result
    with patch("app.rate_limit.redis_client") as mock_redis:
        await dispatch_webhook_event(mock_session, client_id=1, event="payment.received", payload={"test": True})
        mock_redis.lpush.assert_not_called()


@pytest.mark.asyncio
async def test_ws_events_no_crash():
    from app.ws import notify_balance_updated, notify_payment_received, notify_topup_completed
    await notify_balance_updated(999, 100)
    await notify_payment_received(999, "abc123", 10)
    await notify_topup_completed(999, 50, 150)
