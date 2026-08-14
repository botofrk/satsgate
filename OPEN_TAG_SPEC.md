# AIPP Open Tag 1.0

An Open Tag is one priced capability with two interfaces:

- a human opens the tag URL and receives a compact checkout;
- an agent requests JSON from the same URL and receives a machine-readable
  description, price, accepted rails, schemas and payment endpoints.

Canonical URL: `GET /t/:tag_id`

| Request | Response |
| --- | --- |
| `Accept: text/html` | Human checkout |
| `Accept: application/json` | Open Tag manifest |
| `GET /t/:tag_id/manifest` | Open Tag manifest |
| `POST /t/:tag_id/invoice` | Tag-bound payment challenge |
| `GET /t/:tag_id/unlock/:payment_hash` | Verify exact-tag proof and fulfill |
| `GET /t/:tag_id/receipt/:payment_hash` | Portable technical receipt |

## Security contract

Every Smart Tag invoice stores `tag_id`. Unlock and receipt endpoints require
both the invoice hash and the matching tag ID. A payment proof for one tag must
never unlock another tag, including another tag from the same merchant.

Checkout creation remains idempotent. Base transaction hashes retain their
one-invoice anti-replay rule. Production should set `AIPP_RECEIPT_SECRET` to a
long random value so portable receipts include an HMAC signature.

## Compatibility

The legacy `/pay/:tag_id`, `/embed/:tag_id`, `/cli/:tag_id` and generic invoice
routes remain available. New integrations should use `/t/:tag_id` as the
canonical public URL.
