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
| `POST /t/:tag_id/access-token` | Exchange a settled invoice plus its non-public claim secret for a resource-scoped token |
| `GET /t/:tag_id/content` | Fulfill with `Authorization: Bearer <access_token>` |
| `GET /t/:tag_id/receipt/:payment_hash` | Portable technical receipt |

## Security contract

Every Smart Tag invoice stores `tag_id`. The invoice hash is only an invoice
lookup identifier and never authorizes content. Access-token exchange requires
the invoice's non-public claim secret after settlement, and fulfillment requires
the resulting resource-scoped bearer token. A payment for one tag must never
unlock another tag, including another tag from the same merchant.

Checkout creation remains idempotent. Base transaction hashes retain their
one-invoice anti-replay rule. Production should set `AIPP_RECEIPT_SECRET` to a
long random value so portable receipts include an HMAC signature.

## Compatibility

The legacy `/pay/:tag_id`, `/embed/:tag_id`, `/cli/:tag_id` and generic invoice
routes remain available. New integrations should use `/t/:tag_id` as the
canonical public URL.
