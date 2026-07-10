import requests
from typing import Optional, Dict, Any
from .models import ChargeParams, ChargeResponse, ChargeStatus

class AippAPIError(Exception):
    pass

class Aipp:
    def __init__(self, api_key: str, base_url: str = "https://aipp.dev"):
        if not api_key:
            raise ValueError("AIPP: api_key is required")
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Api-Key": self.api_key
        })

    def _request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        url = f"{self.base_url}{endpoint}"
        response = self.session.request(method, url, **kwargs)
        
        if not response.ok:
            try:
                error_data = response.json()
                error_msg = error_data.get("error", response.reason)
            except Exception:
                error_msg = response.reason
            raise AippAPIError(f"AIPP API Error: {error_msg}")
            
        return response.json()

    def create_charge(self, amount_sats: Optional[int] = None, amount_usd: Optional[float] = None, memo: Optional[str] = None, protocol: Optional[str] = None) -> ChargeResponse:
        """Creates a new Invoice (either L402 or x402)"""
        if not amount_sats and not amount_usd:
            raise ValueError("AIPP: Either amount_sats or amount_usd is required")
            
        payload = {"memo": memo}
        if amount_sats:
            payload["amount_sats"] = amount_sats
        if amount_usd:
            payload["amount_usd"] = amount_usd
        if protocol:
            payload["protocol"] = protocol
            
        data = self._request("POST", "/invoice/create", json=payload)
        return ChargeResponse(**data)

    def get_charge(self, payment_hash: str, tx_hash: Optional[str] = None) -> ChargeStatus:
        """Checks the status of an existing charge"""
        if not payment_hash:
            raise ValueError("AIPP: payment_hash is required")
            
        query = f"?tx_hash={tx_hash}" if tx_hash else ""
        data = self._request("GET", f"/invoice/status/{payment_hash}{query}")
        return ChargeStatus(**data)

    def payout(self):
        """Triggers a manual withdrawal of your merchant balance"""
        from .models import PayoutResponse
        data = self._request("POST", "/merchant/payout")
        return PayoutResponse(**data)
