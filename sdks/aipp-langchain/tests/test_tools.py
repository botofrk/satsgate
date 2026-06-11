"""Tests for aipp-langchain SDK tools.

Uses respx to mock HTTP requests (no live server needed).
"""
import os
import pytest
import respx
from httpx import Response


@pytest.fixture
def api_key():
    return "sg_test_key"


@pytest.fixture(autouse=True)
def _clean_env():
    """Save and restore env vars to prevent leakage between tests."""
    saved = {
        k: os.environ.get(k)
        for k in ["ALBY_BEARER_TOKEN", "LNBITS_ADMIN_KEY", "LNBITS_URL"]
    }
    yield
    for k, v in saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


class TestAIPPTopupToolInit:
    def test_init_requires_wallet_token(self):
        """AIPPTopupTool requires a wallet token or env var."""
        os.environ.pop("ALBY_BEARER_TOKEN", None)
        os.environ.pop("LNBITS_ADMIN_KEY", None)

        from aipp_langchain.tools import AIPPTopupTool

        with pytest.raises(ValueError, match="Wallet token"):
            AIPPTopupTool(aipp_api_key="sg_test", aipp_base_url="http://test.local")

    def test_init_with_env_var(self):
        """Should pick up ALBY_BEARER_TOKEN from env."""
        os.environ["ALBY_BEARER_TOKEN"] = "test_alby_token"
        from aipp_langchain.tools import AIPPTopupTool

        tool = AIPPTopupTool(aipp_api_key="sg_test", aipp_base_url="http://test.local")
        assert tool.wallet_token == "test_alby_token"

    def test_init_with_explicit_token(self):
        """Should use explicit wallet_token over env var."""
        os.environ["ALBY_BEARER_TOKEN"] = "wrong_token"
        from aipp_langchain.tools import AIPPTopupTool

        tool = AIPPTopupTool(
            aipp_api_key="sg_test",
            aipp_base_url="http://test.local",
            wallet_token="explicit_token",
        )
        assert tool.wallet_token == "explicit_token"

    def test_tool_metadata(self):
        """Tool should have correct name and description."""
        os.environ["ALBY_BEARER_TOKEN"] = "test_token"
        from aipp_langchain.tools import AIPPTopupTool

        tool = AIPPTopupTool(aipp_api_key="sg_test", aipp_base_url="http://test.local")
        assert tool.name == "aipp_topup"
        assert "AIPP" in tool.description
        assert "L402" in tool.description or "invoice" in tool.description


class TestAIPPTopupToolRun:
    @respx.mock
    def test_successful_alby_topup(self, api_key):
        """Full topup flow via Alby wallet."""
        os.environ["ALBY_BEARER_TOKEN"] = "test_alby_token"
        from aipp_langchain.tools import AIPPTopupTool

        tool = AIPPTopupTool(
            aipp_api_key=api_key,
            aipp_base_url="http://test.local",
            wallet_type="alby",
        )

        www_auth = 'L402 macaroon="test_mac", invoice="lnmock:test_invoice"'

        # Use side_effect for sequential responses to same URL:
        # 1st call to topup/start -> 402 (challenge)
        # 2nd call to topup/start -> 200 (verify)
        route = respx.get("http://test.local/v1/topup/start")
        route.side_effect = [
            Response(402, headers={"WWW-Authenticate": www_auth}, json={"ok": False, "error": "payment_required"}),
            Response(200, json={"ok": True, "credits_added": 100, "new_balance": 100}),
        ]

        # Alby payment
        respx.post("https://api.getalby.com/payments/bolt11").return_value = Response(
            200, json={"preimage": "test_preimage"}
        )

        result = tool._run(plan_id="start")
        assert "Success" in result
        assert "100" in result

    @respx.mock
    def test_failed_alby_payment(self, api_key):
        """When Alby payment fails, return error message."""
        os.environ["ALBY_BEARER_TOKEN"] = "test_alby_token"
        from aipp_langchain.tools import AIPPTopupTool

        tool = AIPPTopupTool(
            aipp_api_key=api_key,
            aipp_base_url="http://test.local",
            wallet_type="alby",
        )

        www_auth = 'L402 macaroon="test_mac", invoice="lnmock:fail"'
        respx.get("http://test.local/v1/topup/trial").return_value = Response(
            402,
            headers={"WWW-Authenticate": www_auth},
            json={"ok": False, "error": "payment_required"},
        )

        # Payment fails
        respx.post("https://api.getalby.com/payments/bolt11").return_value = Response(
            500, json={"error": "payment_failed"}
        )

        result = tool._run(plan_id="trial")
        assert "Error" in result or "error" in result

    @respx.mock
    def test_lnbits_topup_flow(self, api_key):
        """Full topup flow via LNbits wallet with polling."""
        os.environ["LNBITS_ADMIN_KEY"] = "test_lnbits_key"
        os.environ["LNBITS_URL"] = "https://lnbits.example.com"
        from aipp_langchain.tools import AIPPTopupTool

        tool = AIPPTopupTool(
            aipp_api_key=api_key,
            aipp_base_url="http://test.local",
            wallet_type="lnbits",
        )

        www_auth = 'L402 macaroon="mac_lnbits", invoice="lnmock:lnbits_inv"'

        # Use side_effect for sequential responses to same URL
        route = respx.get("http://test.local/v1/topup/pro")
        route.side_effect = [
            Response(402, headers={"WWW-Authenticate": www_auth}, json={"ok": False, "error": "payment_required"}),
            Response(200, json={"ok": True, "credits_added": 150, "new_balance": 350}),
        ]

        # LNbits payment
        respx.post("https://lnbits.example.com/api/v1/payments").return_value = Response(
            200, json={"payment_hash": "test_ph"}
        )

        # Polling returns preimage
        respx.get("https://lnbits.example.com/api/v1/payments/test_ph").return_value = Response(
            200, json={"preimage": "test_preimage"}
        )

        result = tool._run(plan_id="pro")
        assert "Success" in result
        assert "150" in result

    @respx.mock
    def test_unsupported_wallet_type(self, api_key):
        """Unsupported wallet type returns error message."""
        os.environ["ALBY_BEARER_TOKEN"] = "test_token"
        from aipp_langchain.tools import AIPPTopupTool

        tool = AIPPTopupTool(
            aipp_api_key=api_key,
            aipp_base_url="http://test.local",
            wallet_type="alby",
        )
        # Override wallet type to unsupported
        tool.wallet_type = "visa"

        www_auth = 'L402 macaroon="m", invoice="lnmock:i"'
        respx.get("http://test.local/v1/topup/trial").return_value = Response(
            402,
            headers={"WWW-Authenticate": www_auth},
            json={"ok": False, "error": "payment_required"},
        )

        result = tool._run(plan_id="trial")
        assert "Unsupported" in result or "unsupported" in result
