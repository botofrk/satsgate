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
    protocol: Optional[str] = None

class AippErrorResponse(BaseModel):
    error: str
    code: Optional[str] = None

class PayoutResponse(BaseModel):
    message: str
    amount_sats: Optional[int] = None
    amount_usd: Optional[float] = None

class ReceiptRecord(BaseModel):
    type: str
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
    """Machine-readable receipt for a settled invoice."""
    receipt_id: str
    transaction_id: str
    date: str
    status: str
    record: ReceiptRecord
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

class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_at: str

class OpenTagContentResponse(BaseModel):
    success: bool
    tag_id: str
    title: str
    message: str
    content: dict

class UsdcPaymentResult(BaseModel):
    stage: str
    payment_hash: str
    tx_hash: Optional[str] = None
    paid: bool = False
    status: str = "pending"
    preimage: Optional[str] = None
    access_token: Optional[str] = None
    token_type: Optional[str] = None
    expires_at: Optional[str] = None
    content: Optional[dict] = None
    error: Optional[str] = None

