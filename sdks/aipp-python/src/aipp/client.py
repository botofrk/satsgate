import httpx
from typing import Optional, Dict, Any, List

from .exceptions import AIPPError, InsufficientBalanceError, RateLimitError, InvalidAPIKeyError

class AIPP:
    """AIPP (AI Payment Protocol) SDK Client."""

    def __init__(self, api_key: str, base_url: str = "https://api.aipp.dev"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.client = httpx.Client(
            base_url=self.base_url,
            headers={"X-Api-Key": self.api_key}
        )

    def _handle_response(self, response: httpx.Response) -> Dict[str, Any]:
        try:
            data = response.json()
        except Exception:
            raise AIPPError(f"Unexpected response format: {response.text}")

        if not data.get("ok"):
            error = data.get("error", "unknown_error")
            if response.status_code == 401:
                raise InvalidAPIKeyError(f"Invalid API Key: {error}")
            elif response.status_code == 429:
                raise RateLimitError(f"Rate limit exceeded: {error}")
            elif response.status_code == 402:
                raise InsufficientBalanceError(f"Payment required or insufficient balance: {error}")
            else:
                raise AIPPError(f"API Error ({response.status_code}): {error}")

        return data

    def balance(self) -> int:
        """Get the current credit balance for this API key."""
        response = self.client.get("/v1/balance")
        data = self._handle_response(response)
        return int(data.get("credits", 0))

    def charge(self, amount: int = 1) -> Dict[str, Any]:
        """Spend credits from the balance."""
        response = self.client.post("/v1/spend", params={"cost": amount})
        return self._handle_response(response)

    def charge_with_idempotency(self, amount: int, idempotency_key: str) -> Dict[str, Any]:
        """Spend credits safely using an idempotency key."""
        headers = {"Idempotency-Key": idempotency_key}
        response = self.client.post("/v1/spend", params={"cost": amount}, headers=headers)
        return self._handle_response(response)

    def history(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Get recent transaction history."""
        response = self.client.get("/v1/ledger", params={"limit": limit})
        data = self._handle_response(response)
        return data.get("entries", [])

    def topup(self, plan_id: str = "starter") -> Dict[str, Any]:
        """Request a topup invoice (L402 challenge).
        
        Returns a dict containing 'invoice' (BOLT11) and 'macaroon'.
        You must pay the invoice to get the preimage.
        """
        response = self.client.get(f"/v1/topup/{plan_id}")
        if response.status_code == 402:
            auth_header = response.headers.get("WWW-Authenticate", "")
            if "L402" in auth_header:
                parts = auth_header.replace("L402 ", "").split(", ")
                data = {}
                for part in parts:
                    k, v = part.split("=", 1)
                    data[k] = v.strip('"')
                return {"invoice": data.get("invoice"), "macaroon": data.get("macaroon")}
        
        # If no 402, something else happened (maybe it was free?)
        return self._handle_response(response)

    def verify_topup(self, plan_id: str, macaroon: str, preimage: str) -> Dict[str, Any]:
        """Verify the payment using the preimage and macaroon to claim your credits."""
        headers = {
            "Authorization": f"L402 {macaroon}:{preimage}"
        }
        response = self.client.get(f"/v1/topup/{plan_id}", headers=headers)
        return self._handle_response(response)
