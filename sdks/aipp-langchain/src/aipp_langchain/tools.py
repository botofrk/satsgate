import os
import httpx
from typing import Optional, Type, Dict, Any
from pydantic import BaseModel, Field
from langchain_core.tools import BaseTool
from aipp.client import AIPP

class AIPPTopupInput(BaseModel):
    plan_id: str = Field(default="starter", description="The plan ID to top up (e.g. 'starter', 'pro', 'whale')")

class AIPPTopupTool(BaseTool):
    name: str = "aipp_topup"
    description: str = "Use this tool to automatically top up your AIPP credits when you are out of balance. It generates an invoice, pays it using your configured Lightning wallet, and verifies the L402 preimage."
    args_schema: Type[BaseModel] = AIPPTopupInput

    aipp_client: AIPP
    wallet_type: str = "alby" # 'alby' or 'lnbits'
    wallet_token: Optional[str] = None
    wallet_url: Optional[str] = None # used for lnbits

    def __init__(self, aipp_api_key: str, aipp_base_url: str = "https://api.aipp.dev", 
                 wallet_type: str = "alby", wallet_token: Optional[str] = None, wallet_url: Optional[str] = None, **kwargs):
        # Create client early and pass to Pydantic model to avoid validation error
        kwargs['aipp_client'] = AIPP(api_key=aipp_api_key, base_url=aipp_base_url)
        super().__init__(**kwargs)
        self.wallet_type = wallet_type
        self.wallet_token = wallet_token or os.environ.get("ALBY_BEARER_TOKEN") if wallet_type == "alby" else os.environ.get("LNBITS_ADMIN_KEY")
        self.wallet_url = wallet_url or os.environ.get("LNBITS_URL")

        if not self.wallet_token:
            raise ValueError(f"Wallet token must be provided for {wallet_type}")

    def _pay_with_alby(self, bolt11: str) -> str:
        headers = {"Authorization": f"Bearer {self.wallet_token}"}
        response = httpx.post("https://api.getalby.com/payments/bolt11", headers=headers, json={"invoice": bolt11})
        response.raise_for_status()
        return response.json().get("preimage")

    def _pay_with_lnbits(self, bolt11: str) -> str:
        headers = {"X-Api-Key": self.wallet_token}
        url = self.wallet_url.rstrip("/") + "/api/v1/payments"
        response = httpx.post(url, headers=headers, json={"out": True, "bolt11": bolt11})
        response.raise_for_status()
        payment_hash = response.json().get("payment_hash")
        
        # Poll for preimage (simplification)
        import time
        for _ in range(10):
            time.sleep(2)
            check = httpx.get(f"{url}/{payment_hash}", headers=headers)
            if check.status_code == 200 and check.json().get("preimage"):
                return check.json().get("preimage")
        raise RuntimeError("Payment timeout or preimage not found")

    def _run(self, plan_id: str = "starter") -> str:
        try:
            # 1. Get Challenge (402)
            topup_res = self.aipp_client.topup(plan_id=plan_id)
            if "invoice" not in topup_res or "macaroon" not in topup_res:
                return f"Unexpected response from AIPP Topup: {topup_res}"
            
            invoice = topup_res["invoice"]
            macaroon = topup_res["macaroon"]

            # 2. Pay Invoice
            if self.wallet_type == "alby":
                preimage = self._pay_with_alby(invoice)
            elif self.wallet_type == "lnbits":
                preimage = self._pay_with_lnbits(invoice)
            else:
                return f"Unsupported wallet type: {self.wallet_type}"

            if not preimage:
                return "Failed to retrieve preimage after payment."

            # 3. Verify L402
            verify_res = self.aipp_client.verify_topup(plan_id, macaroon, preimage)
            
            return f"Success! Added {verify_res.get('credits_added')} credits. New balance: {verify_res.get('new_balance')}."
        except Exception as e:
            return f"Error during topup process: {str(e)}"
