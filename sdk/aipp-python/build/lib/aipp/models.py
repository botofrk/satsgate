from pydantic import BaseModel
from typing import Optional

class ChargeParams(BaseModel):
    amount_sats: int
    memo: Optional[str] = None

class ChargeResponse(BaseModel):
    payment_request: str
    payment_hash: str
    amount_sats: int

class ChargeStatus(BaseModel):
    status: str
    payment_hash: str
    amount_sats: int

class AippErrorResponse(BaseModel):
    error: str
    code: Optional[str] = None

class PayoutResponse(BaseModel):
    message: str
    amount_sats: Optional[int] = None
