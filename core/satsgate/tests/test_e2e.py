"""End-to-end tests — conftest.py handles env vars + table creation."""
import pytest
from fastapi.testclient import TestClient
from conftest import make_token
from app.main import app, _get_wallet
from app import main as _m

# Initialize wallet before TestClient (lifespan doesn't run in sync TestClient)
_m.WALLET = _get_wallet()

client = TestClient(app, raise_server_exceptions=False)


def _provision(pubkey: str) -> str:
    resp = client.post("/v1/auth/provision", headers={"Authorization": f"Bearer {make_token(pubkey)}"})
    return resp.json()["api_key"]


class TestHealthCheck:
    def test_health_ok(self):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_manifest(self):
        resp = client.get("/.well-known/satsgate.json")
        assert resp.status_code == 200
        assert resp.json()["schema"] == "satsgate.manifest.v1"


class TestPlans:
    def test_list_plans(self):
        resp = client.get("/v1/plans")
        assert resp.status_code == 200
        assert len(resp.json()["plans"]) >= 3


class TestTickets:
    def test_returns_402(self):
        resp = client.get("/v1/tickets")
        assert resp.status_code == 402
        assert "macaroon" in resp.json()
        assert "WWW-Authenticate" in resp.headers


class TestProvision:
    def test_requires_auth(self):
        assert client.post("/v1/auth/provision").status_code == 401

    def test_creates_api_key(self):
        api_key = _provision("pk_prov")
        assert api_key.startswith("sg_")


class TestBalanceAndUsage:
    def test_balance(self):
        api_key = _provision("pk_bal")
        resp = client.get("/v1/balance", headers={"X-Api-Key": api_key})
        assert resp.json()["credits"] == 10

    def test_no_key_401(self):
        assert client.get("/v1/balance").status_code == 401

    def test_client_info(self):
        api_key = _provision("pk_ci")
        resp = client.get("/v1/client", headers={"X-Api-Key": api_key})
        assert resp.json()["ok"] is True

    def test_usage_summary(self):
        api_key = _provision("pk_us")
        resp = client.get("/v1/usage/summary", headers={"X-Api-Key": api_key})
        assert resp.json()["ok"] is True

    def test_usage_daily(self):
        api_key = _provision("pk_ud")
        resp = client.get("/v1/usage/daily", headers={"X-Api-Key": api_key})
        assert resp.json()["ok"] is True

    def test_ledger(self):
        api_key = _provision("pk_lg")
        resp = client.get("/v1/ledger", headers={"X-Api-Key": api_key})
        assert resp.json()["ok"] is True


class TestWebhooks:
    def test_crud(self):
        api_key = _provision("pk_wh")
        resp = client.post("/v1/webhooks", json={"url": "https://x.com/h", "events": ["payment.received"]}, headers={"X-Api-Key": api_key})
        assert resp.json()["ok"] is True
        wid = resp.json()["webhook_id"]
        assert len(client.get("/v1/webhooks", headers={"X-Api-Key": api_key}).json()["webhooks"]) >= 1
        assert client.delete(f"/v1/webhooks/{wid}", headers={"X-Api-Key": api_key}).json()["ok"]

    def test_invalid_events(self):
        api_key = _provision("pk_wh2")
        resp = client.post("/v1/webhooks", json={"url": "https://x.com", "events": ["bad"]}, headers={"X-Api-Key": api_key})
        assert resp.status_code == 400


class TestAlerts:
    def test_get_default(self):
        api_key = _provision("pk_al")
        resp = client.get("/v1/alerts", headers={"X-Api-Key": api_key})
        assert resp.json()["config"]["auto_topup_enabled"] is False

    def test_update(self):
        api_key = _provision("pk_al2")
        resp = client.post("/v1/alerts", json={"balance_threshold_low": 100, "auto_topup_enabled": True}, headers={"X-Api-Key": api_key})
        assert resp.json()["config"]["balance_threshold_low"] == 100


class TestPaywall:
    def test_challenge(self):
        api_key = _provision("pk_pw")
        resp = client.post("/v1/paywall/challenge", json={"amount_sats": 10, "resource": "test"}, headers={"X-Api-Key": api_key})
        assert resp.json()["ok"] is True
        assert "macaroon" in resp.json()


class TestFullLifecycle:
    def test_spend_decreases_balance(self):
        api_key = _provision("pk_lc")
        bal1 = client.get("/v1/balance", headers={"X-Api-Key": api_key}).json()
        assert bal1["credits"] == 10
        spend = client.post("/v1/spend?cost=1", headers={"X-Api-Key": api_key, "Idempotency-Key": "lc_1"}).json()
        assert spend["ok"] is True
        assert spend["new_balance"] == 9
        bal2 = client.get("/v1/balance", headers={"X-Api-Key": api_key}).json()
        assert bal2["credits"] == 9
        ledger = client.get("/v1/ledger", headers={"X-Api-Key": api_key}).json()
        assert len(ledger["entries"]) >= 1

    def test_l402_full_flow(self):
        api_key = _provision("pk_l402")
        chal = client.post("/v1/paywall/challenge", json={"amount_sats": 10, "resource": "api/secret"}, headers={"X-Api-Key": api_key}).json()
        assert chal["ok"] is True
        payment_hash = chal["payment_hash"]
        pay_resp = client.get(f"/dev/mock/pay/{payment_hash}").json()
        assert pay_resp["ok"] is True
        preimage = pay_resp["preimage"]
        macaroon = chal["macaroon"]
        auth_header = f"L402 {macaroon}:{preimage}"
        verify = client.post("/v1/paywall/verify", json={"cost_credits": 1}, headers={"X-Api-Key": api_key, "Authorization": auth_header, "Idempotency-Key": "l402_v1"}).json()
        assert verify["ok"] is True
        assert verify["resource"] == "api/secret"
        assert verify["charged_credits"] == 1


class TestRateHeaders:
    def test_version_header(self):
        resp = client.get("/v1/plans")
        assert resp.headers.get("X-API-Version") == "0.2.0"
