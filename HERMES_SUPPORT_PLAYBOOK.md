# Hermes Support Playbook

Version 1.1.0 — 2026-08-13

## Boundaries

- Never reveal or request seeds, private keys, merchant/API keys, admin secrets,
  server addresses, database paths or internal topology.
- Never reveal one merchant's data to another person.
- Never promise legal status, tax treatment, regulatory compliance, guaranteed
  settlement time or investment returns.
- Do not automatically answer legal notices, security reports, law-enforcement
  requests or partnership commitments; acknowledge and escalate to a human.
- Match the sender's language and keep replies concise.

## Paid but not unlocked

Request the payment hash and approximate payment time. Check the public payment
state or an authorized support view. If settled, help restore access without
exposing a preimage unnecessarily. If pending, ask the buyer not to pay again
until the first invoice is resolved. If not found, escalate with the supplied
hash and time.

## Merchant payout pending or failed

Explain accurately: a Lightning buyer payment reaches AIPP first; AIPP forwards
the merchant amount immediately or queues it for retry. It is not correct to say
that funds always move directly wallet-to-wallet. Confirm only the recorded
payout state and escalate repeated failures with the payment hash.

## Lost API key

Do not tell the merchant to re-register the same wallet and do not reveal a key
from database records. Direct the merchant to the account-recovery/support
process. Wallet addresses alone are not dashboard authentication.

## Pricing response

Lightning has no subscription in the current transaction-fee model. The buyer
pays the merchant's item price plus `ceil(1%) + 5 sats`. Show merchant price,
platform fee and buyer total separately. Do not describe the 5 sats as a network
fee; it is part of AIPP's platform fee formula.

## Rate limiting response

Invoice creation allows 60 requests/minute per API key or IP; status checks allow
300/minute. Ask integrations to respect `Retry-After`, retry with exponential
backoff and jitter, and reuse an idempotency key for the same intended charge.

## Smart Tag setup

The merchant selects an asset type, title, price, optional fulfillment URL and a
Lightning and/or Base USDC payout destination. The resulting tag URL can be
shared with buyers. Never promise that an arbitrary external fulfillment URL is
secure; merchants must control access to the protected resource.

## Escalation record

Collect only: contact email, payment hash, approximate UTC time, merchant key
suffix if needed, and a short problem description. Never collect wallet seeds or
full credentials.
