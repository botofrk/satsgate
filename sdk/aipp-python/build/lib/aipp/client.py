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

    def create_charge(self, amount_sats: int, memo: Optional[str] = None) -> ChargeResponse:
        """Creates a new Lightning Invoice"""
        if amount_sats <= 0:
            raise ValueError("AIPP: amount_sats must be greater than 0")
            
        data = self._request("POST", "/invoice/create", json={
            "amount_sats": amount_sats,
            "memo": memo
        })
        return ChargeResponse(**data)

    def get_charge(self, payment_hash: str) -> ChargeStatus:
        """Checks the status of an existing charge"""
        if not payment_hash:
            raise ValueError("AIPP: payment_hash is required")
            
        data = self._request("GET", f"/invoice/status/{payment_hash}")
        return ChargeStatus(**data)

    def payout(self):
        """Triggers a manual withdrawal of your merchant balance"""
        from .models import PayoutResponse
        data = self._request("POST", "/merchant/payout")
        return PayoutResponse(**data)
