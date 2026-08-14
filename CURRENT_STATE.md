# AIPP — Current Project State

Last updated: 2026-08-13

## Open Tag architecture

A Smart Tag now has one canonical `/t/:id` URL. Browsers receive the compact
checkout while agents requesting JSON receive the Open Tag manifest. Tag
invoices persist `tag_id`; fulfillment and portable receipts reject proofs
that are not bound to that exact tag. Legacy `/pay`, `/embed`, `/cli` and generic
invoice routes remain available for compatibility.

This is the authoritative project-status document. `STATUS.md` and
`YAPILACAKLAR.md` point here so that old sessions do not become competing
sources of truth.

Detailed inspection versus runtime-test coverage is tracked separately in
[`AUDIT_COVERAGE.md`](AUDIT_COVERAGE.md).

## Product model

AIPP creates reusable Smart Price Tags for digital files, AI/prompt output,
bookings, private links and physical items. A buyer pays at the tag checkout;
access is released only after settlement is verified.

Lightning currently uses one customer invoice. The invoice amount is:

`merchant price + ceil(merchant price × 1%) + 5 sats`

The invoice first settles to AIPP's Lightning wallet and the merchant amount is
forwarded immediately or through the retry queue. This is short-lived custody,
not direct wallet-to-wallet settlement, and must be described honestly. Base
USDC uses its own on-chain settlement flow.

## Completed in the 2026-08-13 review

- Centralized the Lightning fee formula in `src/services/fees.ts`.
- Changed Lightning pricing so the merchant receives the listed price and the
  customer pays the platform fee on top.
- Fixed payout calculations and persisted payout references/errors.
- Added database migration fields for payout observability.
- Set agent-friendly limits: 60 invoice creations/minute per API key or IP,
  300 status checks/minute, and a 600 request/minute global safety net.
- Kept checkout idempotency so retries/concurrent requests do not create
  accidental duplicate charges.
- Closed Lightning-address registration takeover: an existing address cannot
  be re-registered to obtain a new key.
- Hardened the dashboard: session-only API key storage, key-only login, escaped
  rendering, corrected API schema handling and clearer payout states.
- Added an explicit price/merchant/platform-fee breakdown to checkout.
- Removed unsupported legal/compliance claims and misleading statements such as
  "100% non-custodial" from reviewed product pages.
- Added production 404 behavior for unknown tags.
- Audited Chrome extension v1.1.0: it now mints a real Smart Tag before element
  selection, stores API keys locally instead of Chrome Sync, never places a key
  in the dashboard URL, validates inputs and copies a working widget embed.
- Documented that the DOM/widget element lock is a visual gate; confidential
  material must use server-side verification or post-payment fulfillment.
- Restricted widget unlock messages to the AIPP iframe origin and window.
- Replaced the long feature-catalogue homepage with a compact 16 KB product
  surface: one promise, one Smart Tag form and three progressive use cases.
- Recorded the product/pain focus in `PRODUCT_FOCUS.md` so protocol expansion
  does not re-clutter the primary user journey.
- TypeScript build passes. Fee/pricing tests pass (9/9).

## Verified but not fully completed

- A full database-backed test run is still required in a Linux environment with
  a compatible native `sqlite3` build. The uploaded `node_modules` contains a
  platform-specific binary and is not a valid deployment artifact.
- Changes have not been deployed to the live server by this review.
- NPM/PyPI packages and the Chrome extension need a coordinated version bump and
  publication after the API/wording changes are accepted.
- Rotate every credential that appeared in historical Markdown, scripts or
  examples. The repository now contains placeholders, but deletion does not
  revoke a previously exposed credential.

## Next release gate

1. Rotate exposed/reused credentials and configure secrets only through the
   deployment secret store.
2. Install dependencies cleanly on Linux with `npm ci`, then run `npm run build`
   and `npm test`.
3. Test 1, 20 and 60 concurrent invoice creations, idempotent retries, payout
   success, payout retry and failed-payout recovery against a staging wallet.
4. Verify checkout, dashboard, docs, SDKs and Hermes skill against staging.
5. Back up the production database, deploy, run smoke tests and monitor payout
   failures before public launch.

Production deployment must use `deploy_open_tag.sh`. It updates only the AIPP
service with `--no-deps` and verifies that the Phoenix container identity,
start time and persistent mounts remain unchanged.

## Deliberate non-goals for this release

- No credits or prepaid customer balance.
- No merchant Lightning channel/LSP product.
- No claim that routing is protocol-enforced or completely non-custodial.
- No automated refund promise; refunds remain a merchant operation.
