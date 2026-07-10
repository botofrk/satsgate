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
