# AIPP Python SDK

Agent-native Lightning Network payment infrastructure. Pay and get paid via L402 — no credit card, no KYC.

## Installation

```bash
pip install aipp
```

Or from source:

```bash
cd sdks/aipp-python
pip install -e .
```

## Quickstart

```python
from aipp import AIPP

# Create client with your API key
client = AIPP(
    api_key="sg_YOUR_API_KEY",
    base_url="https://api.aipp.dev"  # or your own server
)

# Check your credit balance
balance = client.balance()
print(f"Balance: {balance} credits")

# Spend 1 credit
result = client.charge(amount=1)
print(f"New balance: {result['new_balance']}")

# View recent transactions
for entry in client.history(limit=5):
    print(f"{entry['reason']}: {entry['delta_credits']:+d}")
```

## API Reference

### `AIPP(api_key, base_url="https://api.aipp.dev")`

Create a new AIPP client. You get your API key via the topup flow.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `api_key` | `str` | — | Your AIPP API key (starts with `sg_`) |
| `base_url` | `str` | `https://api.aipp.dev` | Your AIPP server URL |

---

### `balance() -> int`

Get your current credit balance.

```python
credits = client.balance()
if credits < 100:
    print("Running low on credits!")
```

---

### `charge(amount=1) -> dict`

Spend credits. Requires the API key to have sufficient balance.

```python
result = client.charge(amount=5)
# Returns: {"ok": True, "new_balance": 195, "spent": 5}
```

---

### `charge_with_idempotency(amount, idempotency_key) -> dict`

Spend credits safely with an idempotency key. Use this to prevent double charges
if your request retries due to network issues.

```python
result = client.charge_with_idempotency(
    amount=1,
    idempotency_key="order-123-request-456"
)
```

---

### `history(limit=20) -> list`

Get your recent transaction history (ledger entries).

```python
for entry in client.history(limit=10):
    delta = entry['delta_credits']
    reason = entry['reason']
    print(f"{reason}: {delta:+d} credits")
```

---

### `topup(plan_id="starter") -> dict`

Get a Lightning invoice to buy credits. Returns a **402** response with an L402 challenge.
Pay the invoice with your wallet, then call `verify_topup()` to claim credits.

```python
challenge = client.topup(plan_id="value")
# Returns: {"invoice": "lnbc...", "macaroon": "eyJ..."}
# Pay the invoice with your Lightning wallet, get the preimage
```

---

### `verify_topup(plan_id, macaroon, preimage) -> dict`

Claim credits after paying the invoice.

```python
result = client.verify_topup(
    plan_id="value",
    macaroon="eyJ...",       # from topup()
    preimage="abc123..."     # from your wallet after paying
)
print(f"Added {result['credits_added']} credits!")
print(f"New balance: {result['new_balance']}")
```

## Error Handling

```python
from aipp import (
    AIPPError,
    InvalidAPIKeyError,
    InsufficientBalanceError,
    RateLimitError,
)

try:
    balance = client.balance()
except InvalidAPIKeyError:
    print("Your API key is invalid. Generate a new one.")
except RateLimitError:
    print("Too many requests. Slow down.")
except InsufficientBalanceError:
    print("Out of credits! Top up via the dashboard.")
except AIPPError as e:
    print(f"API error: {e}")
```

## Testing

Tests use `respx` to mock HTTP requests (no live server needed):

```bash
cd sdks/aipp-python
pip install pytest httpx respx
python -m pytest tests/ -v
```

## Plans

| Plan | Price | Credits | Cost/verify |
|------|-------|---------|-------------|
| Trial | 1,000 sats | 200 | 5.0 sats |
| Value | 25,000 sats | 10,000 | 2.5 sats |
| Pro | 250,000 sats | 150,000 | 1.67 sats |

Credits never expire. No subscription. No credit card.
