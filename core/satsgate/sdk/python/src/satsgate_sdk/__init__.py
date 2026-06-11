"""satsgate-sdk

Python client SDK for the satsgate API.

Concepts:
- *Credits* are bought upfront (plans) and spent on successful verification.
- The real payment happens on Lightning: the payer pays the invoice and receives the preimage.
- The customer backend submits that preimage via `Authorization: L402 ...` and satsgate verifies it.
"""

from .client import (
    AsyncSatsgateClient,
    Challenge,
    SatsgateClient,
    SatsgateError,
    VerifyResult,
    decode_macaroon_payload,
    parse_l402_authorization,
)

__all__ = [
    "AsyncSatsgateClient",
    "Challenge",
    "SatsgateClient",
    "SatsgateError",
    "VerifyResult",
    "decode_macaroon_payload",
    "parse_l402_authorization",
]
