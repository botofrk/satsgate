import hashlib
import time
import json
import hmac
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from .client import Aipp
from .jwt import sign_jwt, verify_jwt

class L402Middleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app,
        client: Aipp,
        jwt_secret: str,
        resource_id: str,
        amount_sats: int = None,
        amount_usd: float = None,
        expires_in_seconds: int = 3600
    ):
        super().__init__(app)
        self.client = client
        self.jwt_secret = jwt_secret
        self.resource_id = resource_id
        self.amount_sats = amount_sats
        self.amount_usd = amount_usd
        self.expires_in_seconds = expires_in_seconds
        
        if self.amount_sats is None and self.amount_usd is None:
            raise ValueError("Either amount_sats or amount_usd must be provided")

    async def dispatch(self, request: Request, call_next):
        auth_header = request.headers.get("Authorization")
        valid = False
        
        if auth_header and auth_header.startswith("L402 "):
            parts = auth_header[5:].split(":")
            if len(parts) == 2:
                macaroon_str, preimage = parts
                try:
                    payload = verify_jwt(macaroon_str, self.jwt_secret)
                    if payload.get("resource_id") == self.resource_id:
                        preimage_hash = hashlib.sha256(bytes.fromhex(preimage)).hexdigest()
                        expected_hash = payload.get("payment_hash")
                        if expected_hash and hmac.compare_digest(preimage_hash, expected_hash):
                            valid = True
                except Exception:
                    # Invalid, expired, or tampered JWT. Fall through to 402 to issue a new invoice.
                    pass
        
        if valid:
            return await call_next(request)
            
        try:
            charge = self.client.create_charge(
                amount_sats=self.amount_sats,
                amount_usd=self.amount_usd,
                memo=f"L402 Payment for {self.resource_id}"
            )
            
            payload = {
                "payment_hash": charge.payment_hash,
                "resource_id": self.resource_id,
                "exp": int(time.time()) + self.expires_in_seconds
            }
            jwt_token = sign_jwt(payload, self.jwt_secret)
            
            headers = {
                "Www-Authenticate": f'L402 macaroon="{jwt_token}" invoice="{charge.payment_request}"'
            }
            content = {
                "error": "Payment Required",
                "code": "L402",
                "payment_request": charge.payment_request,
                "macaroon": jwt_token
            }
            return Response(
                content=json.dumps(content), 
                status_code=402, 
                headers=headers, 
                media_type="application/json"
            )
        except Exception as e:
            return Response(
                content=json.dumps({"error": "Failed to generate L402 challenge", "details": str(e)}), 
                status_code=500, 
                media_type="application/json"
            )
