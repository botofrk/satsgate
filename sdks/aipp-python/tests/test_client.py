"""Tests for aipp-python SDK client.

Uses respx to mock HTTP requests (no live server needed).
"""
import pytest
import respx
from httpx import Response

from aipp import AIPP, AIPPError, InvalidAPIKeyError, InsufficientBalanceError, RateLimitError


@pytest.fixture
def api():
    return AIPP(api_key="sg_test_key", base_url="http://test.local")


class TestBalance:
    @respx.mock
    def test_balance_returns_credits(self, api):
        route = respx.get("http://test.local/v1/balance")
        route.return_value = Response(200, json={"ok": True, "credits": 200})

        bal = api.balance()
        assert bal == 200

    @respx.mock
    def test_balance_401_raises(self, api):
        respx.get("http://test.local/v1/balance").return_value = Response(
            401, json={"ok": False, "error": "invalid_api_key"}
        )
        with pytest.raises(InvalidAPIKeyError):
            api.balance()

    @respx.mock
    def test_balance_429_raises(self, api):
        respx.get("http://test.local/v1/balance").return_value = Response(
            429, json={"ok": False, "error": "rate_limited"}
        )
        with pytest.raises(RateLimitError):
            api.balance()


class TestCharge:
    @respx.mock
    def test_charge_deducts_credits(self, api):
        respx.post("http://test.local/v1/spend?cost=1").return_value = Response(
            200, json={"ok": True, "spent": 1, "new_balance": 199}
        )
        result = api.charge(1)
        assert result["new_balance"] == 199

    @respx.mock
    def test_charge_insufficient_balance(self, api):
        respx.post("http://test.local/v1/spend?cost=1000").return_value = Response(
            402, json={"ok": False, "error": "insufficient_balance"}
        )
        with pytest.raises(InsufficientBalanceError):
            api.charge(1000)

    @respx.mock
    def test_charge_with_idempotency(self, api):
        respx.post("http://test.local/v1/spend?cost=1").return_value = Response(
            200, json={"ok": True, "spent": 1, "new_balance": 199}
        )
        result = api.charge_with_idempotency(1, "idem-001")
        assert result["new_balance"] == 199


class TestTopup:
    @respx.mock
    def test_topup_returns_402_with_invoice(self, api):
        www_auth = 'L402 macaroon="test_mac", invoice="lnmock:test_invoice"'
        respx.get("http://test.local/v1/topup/trial").return_value = Response(
            402,
            headers={"WWW-Authenticate": www_auth},
            json={"ok": False, "error": "payment_required"},
        )
        result = api.topup("trial")
        assert result["macaroon"] == "test_mac"
        assert "lnmock" in result["invoice"]

    @respx.mock
    def test_verify_topup(self, api):
        respx.get("http://test.local/v1/topup/trial").return_value = Response(
            200,
            json={"ok": True, "credits_added": 200, "new_balance": 200},
        )
        result = api.verify_topup("trial", "mac", "preimage")
        assert result["credits_added"] == 200

    @respx.mock
    def test_verify_topup_invalid_preimage(self, api):
        respx.get("http://test.local/v1/topup/trial").return_value = Response(
            401,
            json={"ok": False, "error": "invalid_preimage"},
        )
        with pytest.raises(InvalidAPIKeyError):
            api.verify_topup("trial", "bad_mac", "bad_preimage")


class TestHistory:
    @respx.mock
    def test_history_returns_entries(self, api):
        respx.get("http://test.local/v1/ledger?limit=5").return_value = Response(
            200,
            json={
                "ok": True,
                "entries": [
                    {"id": 1, "delta_credits": -1, "reason": "verify", "created_at": 1000},
                    {"id": 2, "delta_credits": 200, "reason": "topup", "created_at": 2000},
                ],
            },
        )
        entries = api.history(limit=5)
        assert len(entries) == 2
        assert entries[0]["delta_credits"] == -1

    @respx.mock
    def test_history_empty(self, api):
        respx.get("http://test.local/v1/ledger?limit=20").return_value = Response(
            200, json={"ok": True, "entries": []}
        )
        entries = api.history()
        assert entries == []


class TestErrors:
    @respx.mock
    def test_non_json_response(self, api):
        respx.get("http://test.local/v1/balance").return_value = Response(
            500, text="Internal Server Error"
        )
        with pytest.raises(AIPPError, match="Unexpected response format"):
            api.balance()

    @respx.mock
    def test_unknown_error(self, api):
        respx.get("http://test.local/v1/balance").return_value = Response(
            418, json={"ok": False, "error": "teapot"}
        )
        with pytest.raises(AIPPError, match="API Error \\(418\\)"):
            api.balance()
