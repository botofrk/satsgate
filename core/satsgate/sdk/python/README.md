# satsgate-sdk (Python)

Minimal Python SDK to integrate **satsgate** (L402 paywall + prepaid payment verifications (credits)) into your backend.

## Install (editable, from this repo)

```bash
# from the satsgate repo root
python3 -m venv .venv
source .venv/bin/activate

pip install -e sdk/python
```

## Sync Client

```python
from satsgate_sdk import SatsgateClient

sg = SatsgateClient(base_url="http://127.0.0.1:8000", api_key="sg_...")

# 1) Register payee (once)
sg.set_payee("burlybakery53@walletofsatoshi.com")

# 2) Create a challenge for your resource
ch = sg.paywall_challenge(resource="demo/test", amount_sats=10, memo="my service")

# Your backend should respond to your end user with HTTP 402 + header:
#   WWW-Authenticate: ch.www_authenticate
# and optionally JSON containing ch.invoice and ch.macaroon.

# 3) When your end user retries with Authorization: L402 ...
# you verify it like this:
res = sg.paywall_verify(
    authorization_header="L402 <macaroon>:<preimage>",
    expected_resource="demo/test",
)
print(res)

# 4) Reporting
print(sg.usage_forecast(lookback_hours=24, buffer_days=7, trigger_hours=24))
print(sg.usage_daily(days=30))
print(sg.ledger(limit=50))

# 5) Clean up
sg.close()

# Or use as a context manager:
with SatsgateClient(base_url="...", api_key="...") as sg:
    ...
```

## Async Client

For async frameworks (FastAPI, Starlette, etc.), use `AsyncSatsgateClient`:

```python
from satsgate_sdk import AsyncSatsgateClient

async with AsyncSatsgateClient(base_url="http://127.0.0.1:8000", api_key="sg_...") as sg:
    ch = await sg.paywall_challenge(resource="demo/test", amount_sats=10)
    vr = await sg.paywall_verify(
        authorization_header="L402 <macaroon>:<preimage>",
        expected_resource="demo/test",
    )
    print(vr)
```

All methods have the same signatures as the sync client, just with `async/await`.

## Cache

`paywall_verify(..., use_cache=True)` caches `payment_hash` until `valid_until`.
This avoids calling satsgate repeatedly for the same payment/session.

The cache is bounded to 1000 entries (LRU eviction) to prevent unbounded memory growth.

## Idempotency

`paywall_verify` automatically sends an `Idempotency-Key` header (derived from the
`payment_hash`). This means retries of the same payment are deduplicated server-side —
the customer is charged only once per `payment_hash`, even if the request is retried
due to network failures.

## Exports

```python
from satsgate_sdk import (
    SatsgateClient,          # sync HTTP client
    AsyncSatsgateClient,     # async HTTP client (httpx.AsyncClient)
    SatsgateError,           # exception raised on non-OK responses
    Challenge,               # frozen dataclass returned by paywall_challenge
    VerifyResult,            # frozen dataclass returned by paywall_verify
    decode_macaroon_payload, # decode the JSON inside a macaroon (no signature check)
    parse_l402_authorization,# parse "L402 <mac>:<preimage>" -> (mac, preimage)
)
```

## Running tests

```bash
cd sdk/python
pip install -e ".[dev]"
python -m pytest tests/ -v
```
