from pydantic import BaseModel
from typing import Optional

class ChargeParams(BaseModel):
    amount_sats: Optional[int] = None
    amount_usd: Optional[float] = None
    memo: Optional[str] = None
    protocol: Optional[str] = None

class ChargeResponse(BaseModel):
    payment_hash: str
    protocol: str = "L402"
    payment_request: Optional[str] = None
    amount_sats: Optional[int] = None
    amount_usd: Optional[float] = None
    pay_to: Optional[str] = None
    network: Optional[str] = None
    token: Optional[str] = None

class ChargeStatus(BaseModel):
    paid: bool = False
    status: str
    preimage: Optional[str] = None

class AippErrorResponse(BaseModel):
    error: str
    code: Optional[str] = None

class PayoutResponse(BaseModel):
    message: str
    amount_sats: Optional[int] = None
    amount_usd: Optional[float] = None

class ReceiptCompliance(BaseModel):
    regulation: str
    note: str

class ReceiptFinancials(BaseModel):
    currency: str
    total_amount: float
    merchant_amount: float
    platform_fee: float

class ReceiptPaymentDetails(BaseModel):
    protocol: str
    proof: Optional[str] = None
    merchant_destination: Optional[str] = None

class ReceiptResponse(BaseModel):
    """EU AI Act Article 26 compliant receipt for a settled invoice."""
    receipt_id: str
    transaction_id: str
    date: str
    status: str
    compliance: ReceiptCompliance
    payment_details: ReceiptPaymentDetails
    financials: ReceiptFinancials

class MarketplaceTool(BaseModel):
    name: str
    description: str
    priceUsdt: float

class MarketplaceManifest(BaseModel):
    """PaidMCP.dev compatible manifest for listing on AI agent marketplaces."""
    id: str
    name: str
    tagline: str
    description: str
    endpoint: str
    chains: list
    tools: list
    tags: list
