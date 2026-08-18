import time
import requests
from typing import Optional, Dict, Any, Callable
from .models import (
    ChargeParams, 
    ChargeResponse, 
    ChargeStatus, 
    ReceiptResponse, 
    MarketplaceManifest,
    AccessTokenResponse,
    OpenTagContentResponse,
    UsdcPaymentResult
)

BASE_USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
BASE_CHAIN_ID = 8453

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
        """Checks the status of an existing charge, optionally submitting proof tx_hash"""
        if not payment_hash:
            raise ValueError("AIPP: payment_hash is required")
            
        query = f"?tx_hash={tx_hash}" if tx_hash else ""
        data = self._request("GET", f"/invoice/status/{payment_hash}{query}")
        return ChargeStatus(**data)

    def issue_access_token(self, tag_id: str, payment_hash: str, access_claim_secret: str) -> AccessTokenResponse:
        """Exchanges an access claim secret for a Bearer access token upon invoice settlement."""
        if not tag_id or not payment_hash or not access_claim_secret:
            raise ValueError("AIPP: tag_id, payment_hash, and access_claim_secret are required")
        payload = {
            "payment_hash": payment_hash,
            "access_claim_secret": access_claim_secret
        }
        data = self._request("POST", f"/t/{tag_id}/access-token", json=payload)
        return AccessTokenResponse(**data)

    def get_content(self, tag_id: str, access_token: str) -> Dict[str, Any]:
        """Retrieves protected content for a Smart Tag using an access token."""
        if not tag_id or not access_token:
            raise ValueError("AIPP: tag_id and access_token are required")
        headers = {"Authorization": f"Bearer {access_token}"}
        return self._request("GET", f"/t/{tag_id}/content", headers=headers)

    def pay_and_settle_usdc(
        self,
        payment_hash: str,
        amount_usd: Optional[float] = None,
        pay_to: Optional[str] = None,
        send_usdc_transaction: Optional[Callable[[Dict[str, Any]], str]] = None,
        existing_tx_hash: Optional[str] = None,
        tag_id: Optional[str] = None,
        access_claim_secret: Optional[str] = None,
        token_contract: str = BASE_USDC_CONTRACT,
        fetch_content: bool = False,
        poll_interval_sec: float = 1.5,
        timeout_sec: float = 60.0
    ) -> UsdcPaymentResult:
        """
        High-level automated helper for Base USDC / x402 payments.
        Executes: PAY -> PROVE -> SETTLE -> AUTHORIZE -> ACCESS in a single resumable operation.
        """
        if not payment_hash:
            raise ValueError("AIPP: payment_hash is required")

        if token_contract.lower() != BASE_USDC_CONTRACT.lower():
            raise ValueError(f'AIPP: Invalid token contract "{token_contract}". Expected native Base USDC ({BASE_USDC_CONTRACT}).')

        tx_hash = existing_tx_hash
        stage = "PAYMENT_SENT_PROOF_PENDING" if existing_tx_hash else "CREATED"

        # 1. Execute on-chain transfer if not already supplied
        if not tx_hash:
            if not pay_to or not isinstance(pay_to, str) or not pay_to.startswith("0x"):
                raise ValueError("AIPP: Valid pay_to gateway address (0x...) is required for USDC payment")
            if amount_usd is None or amount_usd <= 0:
                raise ValueError("AIPP: Valid positive amount_usd is required")

            if not send_usdc_transaction or not callable(send_usdc_transaction):
                raise ValueError("AIPP: Either send_usdc_transaction callable or existing_tx_hash must be provided")

            amount_units = int(round(amount_usd * 1_000_000))
            tx_hash = send_usdc_transaction({
                "to": pay_to,
                "amount_units": amount_units,
                "amount_usd": amount_usd,
                "token_contract": token_contract,
                "chain_id": BASE_CHAIN_ID
            })

            if not tx_hash:
                raise RuntimeError("AIPP: send_usdc_transaction failed to return a transaction hash")
            stage = "PAYMENT_SENT_PROOF_PENDING"

        # 2. Submit Proof & Poll Settlement
        try:
            status_res = self.get_charge(payment_hash, tx_hash=tx_hash)
            stage = "PROOF_SUBMITTED"
        except Exception as e:
            # Payment sent on-chain, but proof request errored (e.g. network glitch)
            # DO NOT re-pay; return with tx_hash intact so caller can resume.
            return UsdcPaymentResult(
                stage="PAYMENT_SENT_PROOF_PENDING",
                payment_hash=payment_hash,
                tx_hash=tx_hash,
                paid=False,
                status="pending",
                error=f"Payment sent on-chain ({tx_hash}), but initial proof submission failed: {str(e)}. Resume using existing_tx_hash."
            )

        start_time = time.time()
        while not status_res.paid and (time.time() - start_time) < timeout_sec:
            time.sleep(poll_interval_sec)
            try:
                status_res = self.get_charge(payment_hash, tx_hash=tx_hash)
            except Exception:
                pass

        if not status_res.paid:
            return UsdcPaymentResult(
                stage="PROOF_SUBMITTED",
                payment_hash=payment_hash,
                tx_hash=tx_hash,
                paid=False,
                status="pending",
                error=f"Settlement polling timed out after {timeout_sec}s. Payment is on-chain ({tx_hash}); resume using existing_tx_hash."
            )

        stage = "SETTLED"
        result = UsdcPaymentResult(
            stage=stage,
            payment_hash=payment_hash,
            tx_hash=tx_hash,
            paid=True,
            status="settled",
            preimage=status_res.preimage or tx_hash
        )

        # 3. Optional Access Token Exchange
        if tag_id and access_claim_secret:
            try:
                token_data = self.issue_access_token(tag_id, payment_hash, access_claim_secret)
                result.access_token = token_data.access_token
                result.token_type = token_data.token_type
                result.expires_at = token_data.expires_at
                result.stage = "AUTHORIZED"

                # 4. Optional Protected Content Retrieval
                if fetch_content:
                    content_data = self.get_content(tag_id, token_data.access_token)
                    result.content = content_data
                    result.stage = "COMPLETED"
            except Exception as auth_err:
                result.error = f"Payment settled, but access authorization failed: {str(auth_err)}"

        return result

    def payout(self):
        """Triggers an on-demand payout sweep to your configured payout wallet"""
        from .models import PayoutResponse
        data = self._request("POST", "/merchant/payout")
        return PayoutResponse(**data)

    def get_receipt(self, payment_hash: str) -> ReceiptResponse:
        """
        Retrieves a machine-readable receipt for a settled invoice.
        Only available for invoices with status = 'settled'.
        """
        if not payment_hash:
            raise ValueError("AIPP: payment_hash is required")
        data = self._request("GET", f"/invoice/receipt/{payment_hash}")
        return ReceiptResponse(**data)

    def get_marketplace_manifest(self) -> MarketplaceManifest:
        """
        Returns the PaidMCP.dev compatible marketplace manifest for this merchant.
        Use this JSON to list your AIPP-protected endpoints on AI agent directories.
        """
        data = self._request("GET", "/paidmcp.json")
        return MarketplaceManifest(**data)

