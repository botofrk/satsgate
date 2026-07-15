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

class DualMiddleware(BaseHTTPMiddleware):
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
        tx_hash = request.query_params.get("tx_hash") or request.headers.get("payment-signature") or request.headers.get("x-payment-signature")
        payment_hash = request.query_params.get("payment_hash") or request.headers.get("x-payment-hash")
        valid = False
        
        # 1. Try L402 Verification
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
                    pass
        
        # 2. Try x402 Verification if not valid
        if not valid:
            if not tx_hash and auth_header:
                if auth_header.startswith("Bearer "):
                    tx_hash = auth_header[7:].strip()
                elif auth_header.startswith("x402 "):
                    tx_hash = auth_header[5:].strip()
            
            if tx_hash:
                if not payment_hash and auth_header and auth_header.startswith("L402 "):
                    parts = auth_header[5:].split(":")
                    try:
                        payload = verify_jwt(parts[0], self.jwt_secret)
                        payment_hash = payload.get("payment_hash")
                    except Exception:
                        pass
                
                if payment_hash and tx_hash:
                    try:
                        charge_status = self.client.get_charge(payment_hash, tx_hash)
                        if charge_status.status == "settled":
                            valid = True
                    except Exception:
                        pass

        if valid:
            return await call_next(request)
            
        # 3. Generate DUAL Challenge
        try:
            charge = self.client.create_charge(
                amount_sats=self.amount_sats,
                amount_usd=self.amount_usd,
                protocol="dual",
                memo=f"Dual-Rail Payment for {self.resource_id}"
            )
            
            payload = {
                "payment_hash": charge.payment_hash,
                "resource_id": self.resource_id,
                "exp": int(time.time()) + self.expires_in_seconds
            }
            jwt_token = sign_jwt(payload, self.jwt_secret)
            
            # Generate x402 challenge object
            price_val = charge.amount_usd or self.amount_usd or 0.01
            challenge_obj = {
                "scheme": "exact",
                "network": charge.network or "base",
                "payTo": charge.pay_to or "",
                "price": f"{price_val:.2f}",
                "token": charge.token or "",
                "payment_hash": charge.payment_hash
            }
            challenge_base64 = hashlib.base64 = hmac.base64 = json.dumps(challenge_obj).encode("utf-8")
            import base64
            challenge_b64str = base64.b64encode(challenge_base64).decode("utf-8")
            
            headers = {
                "Www-Authenticate": f'L402 macaroon="{jwt_token}" invoice="{charge.payment_request or ""}"',
                "PAYMENT-REQUIRED": challenge_b64str
            }
            content = {
                "error": "Payment Required",
                "code": "402",
                "payment_hash": charge.payment_hash,
                "pricing": {
                    "usd": charge.amount_usd or self.amount_usd or None,
                    "sats": charge.amount_sats or self.amount_sats or None
                },
                "payment_methods": {
                    "lightning": {
                        "protocol": "L402",
                        "payment_request": charge.payment_request or None,
                        "macaroon": jwt_token
                    },
                    "usdc_base": {
                        "protocol": "x402",
                        "pay_to": challenge_obj["payTo"],
                        "token": challenge_obj["token"],
                        "network": challenge_obj["network"],
                        "amount_usd": float(challenge_obj["price"])
                    }
                },
                "instructions": "Pay the Lightning invoice and supply the preimage in 'Authorization: L402 macaroon:preimage' OR transfer the USDC amount to 'pay_to' and supply the transaction hash in 'Authorization: Bearer tx_hash' or 'payment-signature' header."
            }
            return Response(
                content=json.dumps(content), 
                status_code=402, 
                headers=headers, 
                media_type="application/json"
            )
        except Exception as e:
            return Response(
                content=json.dumps({"error": "Failed to generate Dual-Rail challenge", "details": str(e)}), 
                status_code=500, 
                media_type="application/json"
            )
