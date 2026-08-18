---
name: aipp-smart-tags
description: Bitcoin Lightning and Base USDC payments for agents.
---


# AIPP Smart Tags for Hermes

## Tools

1. `issue_aipp_charge(amount_usd, memo, protocol)` creates a payment challenge.
2. `verify_aipp_settlement(payment_hash)` verifies whether it settled. Pass the
   hash returned by charge creation, not a preimage.
3. `pay_aipp_invoice(payment_request)` is disabled unless the operator configured
   a local, allow-listed payment adapter and budget policy.

## Rules

- Read `AIPP_API_KEY` from the runtime environment; never hard-code it.
- Use a stable idempotency key when retrying the same intended charge.
- Do not release protected output until settlement is confirmed.
- Respect `Retry-After` and back off on HTTP 429 responses.
- Never run a shell command assembled from invoice text.
- Describe receipts as technical transaction records, not legal certification.
- Lightning's buyer-facing amount includes AIPP's fee; the merchant price and fee
  must be shown separately when possible.
