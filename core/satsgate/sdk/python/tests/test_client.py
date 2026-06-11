"""Comprehensive tests for the satsgate Python SDK.

Tests cover:
- parse_l402_authorization (valid, missing, malformed, wrong scheme, bad hex)
- decode_macaroon_payload (valid decoding, malformed tokens)
- sha256_hex_of_hexbytes
- SatsgateClient cache behavior (LRU eviction, bounded cache)
- SatsgateClient._ok_or_raise (error handling)
- SatsgateClient paywall_challenge / paywall_verify (with httpx MockTransport)
- AsyncSatsgateClient (with httpx MockTransport)
- Challenge / VerifyResult dataclass immutability
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import OrderedDict
from typing import Any

import httpx
import pytest

# SDK imports
from satsgate_sdk import (
    AsyncSatsgateClient,
    Challenge,
    SatsgateClient,
    SatsgateError,
    VerifyResult,
    decode_macaroon_payload,
    parse_l402_authorization,
)
from satsgate_sdk.client import sha256_hex_of_hexbytes

# Test helpers
from tests._helpers import make_l402_header, make_macaroon, make_payment_hash_and_preimage


# ---------------------------------------------------------------------------
# parse_l402_authorization
# ---------------------------------------------------------------------------


class TestParseL402Authorization:
    def test_valid(self):
        mac = make_macaroon()
        _, preimage = make_payment_hash_and_preimage()
        auth = f"L402 {mac}:{preimage}"
        m, p = parse_l402_authorization(auth)
        assert m == mac
        assert p == preimage

    def test_empty_raises(self):
        with pytest.raises(SatsgateError, match="missing"):
            parse_l402_authorization("")

    def test_no_scheme_raises(self):
        with pytest.raises(SatsgateError, match="malformed"):
            parse_l402_authorization("just-a-token")

    def test_wrong_scheme_raises(self):
        with pytest.raises(SatsgateError, match="not L402"):
            parse_l402_authorization("Basic abc123")

    def test_missing_preimage_raises(self):
        mac = make_macaroon()
        with pytest.raises(SatsgateError, match="malformed L402"):
            parse_l402_authorization(f"L402 {mac}")

    def test_bad_hex_raises(self):
        mac = make_macaroon()
        with pytest.raises(SatsgateError, match="not hex"):
            parse_l402_authorization(f"L402 {mac}:not-valid-hex!")


# ---------------------------------------------------------------------------
# decode_macaroon_payload
# ---------------------------------------------------------------------------


class TestDecodeMacaroonPayload:
    def test_round_trip(self):
        ph, _ = make_payment_hash_and_preimage()
        mac = make_macaroon(payment_hash=ph, resource="my/api", exp=9999999999)
        payload = decode_macaroon_payload(mac)
        assert payload["ph"] == ph
        assert payload["res"] == "my/api"
        assert payload["exp"] == 9999999999

    def test_extra_fields_preserved(self):
        mac = make_macaroon(extra={"custom": 42})
        payload = decode_macaroon_payload(mac)
        assert payload["custom"] == 42

    def test_garbage_raises(self):
        with pytest.raises(Exception):
            decode_macaroon_payload("not-valid-base64!!!")


# ---------------------------------------------------------------------------
# sha256_hex_of_hexbytes
# ---------------------------------------------------------------------------


class TestSha256Hex:
    def test_known_value(self):
        preimage_hex = "ab" * 32
        expected = hashlib.sha256(bytes.fromhex(preimage_hex)).hexdigest()
        assert sha256_hex_of_hexbytes(preimage_hex) == expected

    def test_empty(self):
        # sha256 of empty bytes
        expected = hashlib.sha256(b"").hexdigest()
        assert sha256_hex_of_hexbytes("") == expected


# ---------------------------------------------------------------------------
# Dataclass immutability
# ---------------------------------------------------------------------------


class TestDataclasses:
    def test_challenge_frozen(self):
        ch = Challenge(
            resource="r",
            amount_sats=10,
            payee_lightning_address=None,
            macaroon="m",
            invoice="i",
            payment_hash="ph",
            valid_until=0,
            www_authenticate="w",
        )
        with pytest.raises(AttributeError):
            ch.resource = "other"  # type: ignore[misc]

    def test_verify_result_frozen(self):
        vr = VerifyResult(
            ok=True,
            client_id=1,
            resource="r",
            payment_hash="ph",
            charged_credits=1,
            new_balance=99,
            valid_until=0,
        )
        with pytest.raises(AttributeError):
            vr.ok = False  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Mock HTTP helpers
# ---------------------------------------------------------------------------


def _mock_challenge_response(**overrides: Any) -> dict:
    body: dict = {
        "ok": True,
        "resource": "test/res",
        "amount_sats": 10,
        "payee_lightning_address": None,
        "macaroon": make_macaroon(),
        "invoice": "lnbc10...",
        "payment_hash": "aa" * 32,
        "valid_until": int(time.time()) + 3600,
        "www_authenticate": "L402 macaroon=...",
    }
    body.update(overrides)
    return body


def _mock_verify_response(**overrides: Any) -> dict:
    body: dict = {
        "ok": True,
        "client_id": 42,
        "resource": "test/res",
        "payment_hash": "bb" * 32,
        "charged_credits": 1,
        "new_balance": 99,
        "valid_until": int(time.time()) + 3600,
    }
    body.update(overrides)
    return body


def _balance_response(**overrides: Any) -> dict:
    body: dict = {"ok": True, "balance": 500}
    body.update(overrides)
    return body


# ---------------------------------------------------------------------------
# SatsgateClient (sync) with MockTransport
# ---------------------------------------------------------------------------


def _make_sync_client(handler: httpx.MockTransport) -> SatsgateClient:
    client = SatsgateClient(base_url="http://test", api_key="sg_test_key")
    client._http = httpx.Client(transport=handler)
    return client


class TestSyncClient:
    def test_headers(self):
        sg = SatsgateClient(base_url="http://x", api_key="sg_abc")
        assert sg._headers() == {"X-Api-Key": "sg_abc"}

    def test_ok_or_raise_success(self):
        sg = SatsgateClient(base_url="http://x", api_key="k")
        resp = httpx.Response(200, json={"ok": True, "data": 1})
        result = sg._ok_or_raise(resp)
        assert result["ok"] is True

    def test_ok_or_raise_error_status(self):
        sg = SatsgateClient(base_url="http://x", api_key="k")
        resp = httpx.Response(500, json={"ok": False, "error": "boom"})
        with pytest.raises(SatsgateError) as exc_info:
            sg._ok_or_raise(resp)
        assert exc_info.value.status_code == 500

    def test_ok_or_raise_non_json(self):
        sg = SatsgateClient(base_url="http://x", api_key="k")
        resp = httpx.Response(200, text="not json")
        with pytest.raises(SatsgateError, match="non-json"):
            sg._ok_or_raise(resp)

    def test_ok_or_raise_ok_false(self):
        sg = SatsgateClient(base_url="http://x", api_key="k")
        resp = httpx.Response(200, json={"ok": False, "error": "nope"})
        with pytest.raises(SatsgateError, match="nope"):
            sg._ok_or_raise(resp)

    def test_balance(self):
        captured: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["url"] = str(request.url)
            captured["headers"] = dict(request.headers)
            return httpx.Response(200, json=_balance_response())

        sg = _make_sync_client(httpx.MockTransport(handler))
        result = sg.balance()
        assert result["balance"] == 500
        assert "/v1/balance" in captured["url"]
        assert captured["headers"].get("x-api-key") == "sg_test_key"
        sg.close()

    def test_paywall_challenge(self):
        def handler(request: httpx.Request) -> httpx.Response:
            body = json.loads(request.content)
            assert body["resource"] == "test/res"
            assert body["amount_sats"] == 10
            return httpx.Response(200, json=_mock_challenge_response())

        sg = _make_sync_client(httpx.MockTransport(handler))
        ch = sg.paywall_challenge(resource="test/res", amount_sats=10)
        assert isinstance(ch, Challenge)
        assert ch.resource == "test/res"
        assert ch.amount_sats == 10
        sg.close()

    def test_paywall_challenge_with_optional_params(self):
        captured_body: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal captured_body
            captured_body = json.loads(request.content)
            return httpx.Response(200, json=_mock_challenge_response())

        sg = _make_sync_client(httpx.MockTransport(handler))
        sg.paywall_challenge(resource="r", amount_sats=5, memo="hello", ttl_seconds=60)
        assert captured_body["memo"] == "hello"
        assert captured_body["ttl_seconds"] == 60
        sg.close()

    def test_paywall_verify_success(self):
        ph, preimage = make_payment_hash_and_preimage()
        mac = make_macaroon(payment_hash=ph, resource="test/res")
        auth = f"L402 {mac}:{preimage}"

        def handler(request: httpx.Request) -> httpx.Response:
            assert "idempotency-key" in dict(request.headers)
            return httpx.Response(200, json=_mock_verify_response(payment_hash=ph))

        sg = _make_sync_client(httpx.MockTransport(handler))
        vr = sg.paywall_verify(authorization_header=auth, expected_resource="test/res")
        assert isinstance(vr, VerifyResult)
        assert vr.ok is True
        assert vr.client_id == 42
        assert vr.charged_credits == 1
        sg.close()

    def test_paywall_verify_uses_cache(self):
        ph, preimage = make_payment_hash_and_preimage()
        mac = make_macaroon(payment_hash=ph, resource="test/res")
        auth = f"L402 {mac}:{preimage}"

        call_count = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            return httpx.Response(200, json=_mock_verify_response(payment_hash=ph))

        sg = _make_sync_client(httpx.MockTransport(handler))

        # First call hits the server
        vr1 = sg.paywall_verify(authorization_header=auth)
        assert call_count == 1
        assert vr1.charged_credits == 1

        # Second call should use cache (no server call)
        vr2 = sg.paywall_verify(authorization_header=auth)
        assert call_count == 1  # not incremented
        assert vr2.charged_credits == 0  # cached result
        assert vr2.client_id == -1  # cached result
        sg.close()

    def test_paywall_verify_no_cache(self):
        ph, preimage = make_payment_hash_and_preimage()
        mac = make_macaroon(payment_hash=ph)
        auth = f"L402 {mac}:{preimage}"

        call_count = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            return httpx.Response(200, json=_mock_verify_response(payment_hash=ph))

        sg = _make_sync_client(httpx.MockTransport(handler))
        sg.paywall_verify(authorization_header=auth, use_cache=False)
        sg.paywall_verify(authorization_header=auth, use_cache=False)
        assert call_count == 2  # both calls hit server
        sg.close()

    def test_paywall_verify_idempotency_key_format(self):
        ph, preimage = make_payment_hash_and_preimage()
        mac = make_macaroon(payment_hash=ph)
        auth = f"L402 {mac}:{preimage}"

        captured_key: str = ""

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal captured_key
            captured_key = request.headers.get("idempotency-key", "")
            return httpx.Response(200, json=_mock_verify_response(payment_hash=ph))

        sg = _make_sync_client(httpx.MockTransport(handler))
        sg.paywall_verify(authorization_header=auth)
        assert captured_key == f"sdk:{ph}"
        sg.close()

    def test_paywall_verify_bad_preimage(self):
        ph, _ = make_payment_hash_and_preimage()
        mac = make_macaroon(payment_hash=ph)
        bad_preimage = "cc" * 32
        auth = f"L402 {mac}:{bad_preimage}"

        sg = _make_sync_client(httpx.MockTransport(lambda r: httpx.Response(200, json={"ok": True})))
        with pytest.raises(SatsgateError, match="preimage does not match"):
            sg.paywall_verify(authorization_header=auth)
        sg.close()

    def test_paywall_verify_expired_token(self):
        ph, preimage = make_payment_hash_and_preimage()
        mac = make_macaroon(payment_hash=ph, exp=int(time.time()) - 100)
        auth = f"L402 {mac}:{preimage}"

        sg = _make_sync_client(httpx.MockTransport(lambda r: httpx.Response(200, json={"ok": True})))
        with pytest.raises(SatsgateError, match="expired"):
            sg.paywall_verify(authorization_header=auth)
        sg.close()

    def test_cache_lru_eviction(self):
        sg = SatsgateClient(base_url="http://x", api_key="k")
        sg._VERIFIED_CACHE_MAX = 3

        # Fill cache with 3 entries
        for i in range(3):
            sg._verified[f"hash_{i}"] = 9999

        assert len(sg._verified) == 3

        # Add a 4th → oldest (hash_0) should be evicted
        sg._verified["hash_3"] = 9999
        sg._verified.move_to_end("hash_3")
        while len(sg._verified) > sg._VERIFIED_CACHE_MAX:
            sg._verified.popitem(last=False)

        assert len(sg._verified) == 3
        assert "hash_0" not in sg._verified
        assert "hash_3" in sg._verified
        sg.close()

    def test_context_manager(self):
        with SatsgateClient(base_url="http://x", api_key="k") as sg:
            assert sg.api_key == "k"
        # After context manager, httpx client should be closed
        # (closing again should not raise)

    def test_set_payee(self):
        captured_body: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal captured_body
            captured_body = json.loads(request.content)
            return httpx.Response(200, json={"ok": True})

        sg = _make_sync_client(httpx.MockTransport(handler))
        sg.set_payee("test@walletofsatoshi.com")
        assert captured_body["payee_lightning_address"] == "test@walletofsatoshi.com"
        sg.close()

    def test_list_plans(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"ok": True, "plans": [{"id": 1, "name": "basic"}]})

        sg = _make_sync_client(httpx.MockTransport(handler))
        plans = sg.list_plans()
        assert len(plans) == 1
        assert plans[0]["name"] == "basic"
        sg.close()

    def test_ledger(self):
        captured_params: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured_params.update(dict(request.url.params))
            return httpx.Response(200, json={"ok": True, "entries": []})

        sg = _make_sync_client(httpx.MockTransport(handler))
        sg.ledger(limit=25, before_id=100)
        assert captured_params["limit"] == "25"
        assert captured_params["before_id"] == "100"
        sg.close()


# ---------------------------------------------------------------------------
# AsyncSatsgateClient with MockTransport
# ---------------------------------------------------------------------------


def _make_async_client(handler: httpx.MockTransport) -> AsyncSatsgateClient:
    client = AsyncSatsgateClient(base_url="http://test", api_key="sg_test_key")
    client._http = httpx.AsyncClient(transport=handler)
    return client


class TestAsyncClient:
    @pytest.mark.asyncio
    async def test_balance(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=_balance_response())

        sg = _make_async_client(httpx.MockTransport(handler))
        result = await sg.balance()
        assert result["balance"] == 500
        await sg.close()

    @pytest.mark.asyncio
    async def test_paywall_challenge(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=_mock_challenge_response())

        sg = _make_async_client(httpx.MockTransport(handler))
        ch = await sg.paywall_challenge(resource="test/res", amount_sats=10)
        assert isinstance(ch, Challenge)
        await sg.close()

    @pytest.mark.asyncio
    async def test_paywall_verify(self):
        ph, preimage = make_payment_hash_and_preimage()
        mac = make_macaroon(payment_hash=ph)
        auth = f"L402 {mac}:{preimage}"

        def handler(request: httpx.Request) -> httpx.Response:
            assert "idempotency-key" in dict(request.headers)
            return httpx.Response(200, json=_mock_verify_response(payment_hash=ph))

        sg = _make_async_client(httpx.MockTransport(handler))
        vr = await sg.paywall_verify(authorization_header=auth)
        assert isinstance(vr, VerifyResult)
        assert vr.ok is True
        await sg.close()

    @pytest.mark.asyncio
    async def test_paywall_verify_cache(self):
        ph, preimage = make_payment_hash_and_preimage()
        mac = make_macaroon(payment_hash=ph)
        auth = f"L402 {mac}:{preimage}"

        call_count = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            return httpx.Response(200, json=_mock_verify_response(payment_hash=ph))

        sg = _make_async_client(httpx.MockTransport(handler))
        vr1 = await sg.paywall_verify(authorization_header=auth)
        vr2 = await sg.paywall_verify(authorization_header=auth)
        assert call_count == 1
        assert vr2.charged_credits == 0
        await sg.close()

    @pytest.mark.asyncio
    async def test_async_context_manager(self):
        async with AsyncSatsgateClient(base_url="http://x", api_key="k") as sg:
            assert sg.api_key == "k"

    @pytest.mark.asyncio
    async def test_set_payee(self):
        captured_body: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal captured_body
            captured_body = json.loads(request.content)
            return httpx.Response(200, json={"ok": True})

        sg = _make_async_client(httpx.MockTransport(handler))
        await sg.set_payee("test@wallet.com")
        assert captured_body["payee_lightning_address"] == "test@wallet.com"
        await sg.close()

    @pytest.mark.asyncio
    async def test_usage_summary(self):
        captured_params: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured_params.update(dict(request.url.params))
            return httpx.Response(200, json={"ok": True, "total_spent": 100})

        sg = _make_async_client(httpx.MockTransport(handler))
        result = await sg.usage_summary(since_hours=48)
        assert captured_params["since_hours"] == "48"
        await sg.close()

    @pytest.mark.asyncio
    async def test_usage_daily(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"ok": True, "days": []})

        sg = _make_async_client(httpx.MockTransport(handler))
        result = await sg.usage_daily(days=7)
        assert "days" in result
        await sg.close()

    @pytest.mark.asyncio
    async def test_usage_forecast(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"ok": True, "forecast": {}})

        sg = _make_async_client(httpx.MockTransport(handler))
        result = await sg.usage_forecast(lookback_hours=12, buffer_days=3)
        assert "forecast" in result
        await sg.close()

    @pytest.mark.asyncio
    async def test_get_client(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"ok": True, "client_id": 1})

        sg = _make_async_client(httpx.MockTransport(handler))
        result = await sg.get_client()
        assert result["client_id"] == 1
        await sg.close()
