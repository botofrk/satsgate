# AIPP Assistant Knowledge Base

Last updated: 2026-08-13

Answer only from this document. Never invent prices, guarantees, legal status,
wallet support or transaction state. For account-specific help, request a
payment hash or offer a support ticket; never request seed phrases or private
keys.

## What AIPP is

AIPP lets a merchant create an Open Smart Tag for a digital file, AI/prompt
output, booking, private link or API. A person receives a compact checkout;
software requesting JSON receives the price, payment rails, schemas and
fulfillment endpoints from the same URL.

Lightning uses one buyer-facing invoice. The payment first reaches AIPP's
Lightning wallet, then the merchant's listed amount is forwarded immediately or
queued for retry. AIPP may therefore hold funds briefly during forwarding; do
not describe this flow as completely non-custodial or direct wallet-to-wallet.
Base USDC follows a separate on-chain settlement flow.

## Lightning pricing

- The merchant chooses the item price.
- The buyer pays the item price plus `ceil(1%) + 5 sats`.
- The merchant is intended to receive the listed item price; Lightning routing
  costs or failed payouts may still affect operational settlement.
- There is no subscription or setup fee in the current transaction-fee model.
- Invoice creation is limited to 60/minute per API key or IP. Status checks are
  limited to 300/minute. A global 600 request/minute safety limit also applies.
- A daily merchant-volume limit and a maximum single request may be configured
  by the deployment. If reached, the API returns a machine-readable limit error.

## Merchant setup

The merchant creates a Smart Tag and supplies a Lightning Address and/or Base
USDC address. The API returns a merchant key once. Treat it as a secret. An
existing Lightning Address cannot be re-registered to recover or replace its
key; contact support.

Main API paths:

- `POST /invoice/create`
- `GET /invoice/status/:payment_hash`
- `GET /invoice/receipt/:payment_hash`
- `POST /merchant/links/create`
- `GET /t/:tag_id` — HTML for people, JSON for agents through content negotiation
- `GET /t/:tag_id/manifest` — stable machine-readable capability description
- `GET /t/:tag_id/unlock/:payment_hash` — exact-tag verification and fulfillment
- `GET /t/:tag_id/receipt/:payment_hash` — portable technical receipt
- `GET /merchant/stats`

Authenticated merchant requests use the `X-Api-Key` header. Retry invoice
creation with the same idempotency key when the client is uncertain whether a
request succeeded.

## Payouts and refunds

If merchant forwarding fails, AIPP records the error and retries through its
payout queue. Support can investigate with a payment hash. Never promise that a
payout is complete until its recorded state says so.

AIPP does not promise automatic refunds. The merchant is responsible for buyer
refunds unless a future product policy states otherwise.

## Security and support

- Never ask for or expose seeds, private keys, API keys, admin secrets or server
  connection details.
- Never provide another merchant's transaction or destination information.
- A machine-readable receipt is a technical payment record, not a legal or
  regulatory certification.
- For unresolved cases, offer a support ticket and request only the minimum
  information needed: email, payment hash, approximate time and problem summary.
