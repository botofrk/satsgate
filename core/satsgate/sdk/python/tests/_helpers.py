"""Shared test helpers for the satsgate SDK test suite."""

from __future__ import annotations

import base64
import hashlib
import json
import time


def make_payment_hash_and_preimage() -> tuple[str, str]:
    """Return (payment_hash_hex, preimage_hex) where sha256(preimage) == payment_hash."""
    preimage_hex = "ab" * 32  # 32-byte dummy preimage
    payment_hash = hashlib.sha256(bytes.fromhex(preimage_hex)).hexdigest()
    return payment_hash, preimage_hex


def make_macaroon(
    *,
    payment_hash: str | None = None,
    resource: str = "test/resource",
    exp: int | None = None,
    extra: dict | None = None,
) -> str:
    """Build a base64url-encoded mock macaroon (payload.signature).

    The SDK only decodes the payload — it does NOT verify the signature.
    """
    if payment_hash is None:
        payment_hash, _ = make_payment_hash_and_preimage()
    if exp is None:
        exp = int(time.time()) + 3600  # 1 hour from now

    payload: dict = {"ph": payment_hash, "res": resource, "exp": exp}
    if extra:
        payload.update(extra)

    payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    fake_sig = b"fakesig"
    token = payload_bytes + b"." + fake_sig

    # base64url encode, strip padding
    return base64.urlsafe_b64encode(token).rstrip(b"=").decode("ascii")


def make_l402_header(
    *,
    macaroon: str | None = None,
    preimage_hex: str | None = None,
) -> str:
    """Build a valid ``Authorization: L402 ...`` header value."""
    if preimage_hex is None:
        _, preimage_hex = make_payment_hash_and_preimage()
    if macaroon is None:
        payment_hash = hashlib.sha256(bytes.fromhex(preimage_hex)).hexdigest()
        macaroon = make_macaroon(payment_hash=payment_hash)
    return f"L402 {macaroon}:{preimage_hex}"
