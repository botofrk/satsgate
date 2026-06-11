"""Webhook delivery retry mechanism tests."""
import asyncio
import json
import time
import hmac
import hashlib
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.webhooks import _sign_payload


def test_signature_verification():
    payload = {"event": "payment.received", "data": {"amount": 100}}
    secret = "webhook_secret_123"
    signature = _sign_payload(payload, secret)
    body = json.dumps(payload, sort_keys=True, default=str)
    expected = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
    assert signature == expected
    assert len(signature) == 64


def test_signature_differs_with_different_secret():
    payload = {"event": "test"}
    sig1 = _sign_payload(payload, "secret_a")
    sig2 = _sign_payload(payload, "secret_b")
    assert sig1 != sig2


def test_signature_differs_with_different_payload():
    secret = "same_secret"
    sig1 = _sign_payload({"event": "a"}, secret)
    sig2 = _sign_payload({"event": "b"}, secret)
    assert sig1 != sig2
