import unittest
import time
from unittest.mock import MagicMock
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from aipp.middleware import L402Middleware
from aipp.jwt import sign_jwt

class TestL402Middleware(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        
        self.mock_client = MagicMock()
        
        class MockCharge:
            payment_hash = "fake_hash_123"
            payment_request = "lnbc1..."
            
        self.mock_client.create_charge.return_value = MockCharge()
        
        self.app.add_middleware(
            L402Middleware,
            client=self.mock_client,
            jwt_secret="secret123",
            resource_id="/api/chat",
            amount_sats=100
        )
        
        @self.app.get("/api/chat")
        def chat():
            return {"message": "Success"}
            
        self.client = TestClient(self.app)
        
    def test_missing_auth_returns_402(self):
        response = self.client.get("/api/chat")
        self.assertEqual(response.status_code, 402)
        self.assertIn("Www-Authenticate", response.headers)
        self.assertTrue(response.headers["Www-Authenticate"].startswith('L402 macaroon='))
        
    def test_expired_jwt_returns_402(self):
        # Create an expired JWT
        payload = {
            "payment_hash": "fake_hash_123",
            "resource_id": "/api/chat",
            "exp": int(time.time()) - 100 # expired
        }
        token = sign_jwt(payload, "secret123")
        
        response = self.client.get("/api/chat", headers={"Authorization": f"L402 {token}:fake_preimage"})
        self.assertEqual(response.status_code, 402) # Should issue a new challenge
        
    def test_wrong_resource_returns_402(self):
        payload = {
            "payment_hash": "fake_hash_123",
            "resource_id": "/api/other",
            "exp": int(time.time()) + 3600
        }
        token = sign_jwt(payload, "secret123")
        
        response = self.client.get("/api/chat", headers={"Authorization": f"L402 {token}:fake_preimage"})
        self.assertEqual(response.status_code, 402) # Should issue a new challenge
        
    def test_valid_jwt_wrong_preimage_returns_402(self):
        import hashlib
        payload = {
            "payment_hash": "fake_hash_123",
            "resource_id": "/api/chat",
            "exp": int(time.time()) + 3600
        }
        token = sign_jwt(payload, "secret123")
        
        # We need a preimage whose hash is 'fake_hash_123'. We don't have one, so any preimage will fail.
        response = self.client.get("/api/chat", headers={"Authorization": f"L402 {token}:0000000000000000000000000000000000000000000000000000000000000000"})
        self.assertEqual(response.status_code, 402)
        
    def test_valid_jwt_and_preimage_returns_200(self):
        import hashlib
        import secrets
        
        preimage = secrets.token_bytes(32)
        preimage_hex = preimage.hex()
        payment_hash = hashlib.sha256(preimage).hexdigest()
        
        payload = {
            "payment_hash": payment_hash,
            "resource_id": "/api/chat",
            "exp": int(time.time()) + 3600
        }
        token = sign_jwt(payload, "secret123")
        
        response = self.client.get("/api/chat", headers={"Authorization": f"L402 {token}:{preimage_hex}"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"message": "Success"})

    def test_payment_tool_enforces_budget(self):
        from aipp.tools import AippLNBitsWallet, create_l402_payment_tool
        import urllib.request
        from unittest.mock import patch

        wallet = AippLNBitsWallet("http://fake", "fakekey")
        
        # Mock the urllib.request.urlopen to return an invoice with 5000 sats
        class MockResponse:
            def read(self):
                return b'{"amount_msat": 5000000}'
            def __enter__(self):
                return self
            def __exit__(self, exc_type, exc_val, exc_tb):
                pass

        with patch('urllib.request.urlopen', return_value=MockResponse()):
            # 5000 sats is > 2000 max_sats
            tool = create_l402_payment_tool("http://fake", "fakekey", max_sats_per_tx=2000)
            result = tool.invoke({"invoice": "lnbc1fake"})
            self.assertIn("PAYMENT FAILED", result)
            self.assertIn("exceeds max_sats_per_tx", result)

if __name__ == "__main__":
    unittest.main()
