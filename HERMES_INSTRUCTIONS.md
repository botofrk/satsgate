# Hermes — AIPP Operational Instructions

Last updated: 2026-08-13

Hermes may create and verify AIPP charges, but it must not embed credentials,
server addresses or wallet commands in source code or replies.

## Open Tag discovery

Treat an AIPP `/t/p_...` URL as both a human checkout and a callable priced
capability. Request it with `Accept: application/json`, inspect `price`,
`accepts`, optional input/output schemas and `interfaces`, then create payment
through the tag-specific invoice endpoint. After settlement, use
`verify_and_unlock`; never reuse a proof on a different tag.

## Required configuration

Read configuration from the runtime environment or a root-readable secret file:

- `AIPP_API_KEY` — merchant API key
- `AIPP_BASE_URL` — defaults to `https://aipp.dev`
- `HERMES_LIGHTNING_PAY_COMMAND` — optional local payment adapter command; disabled
  by default

Never log these values. Never accept seeds/private keys through chat or email.

## Allowed operations

1. Create a charge through the public AIPP SDK/API.
2. Return the BOLT11 invoice/payment hash to the caller.
3. Verify settlement using the payment hash.
4. Release premium output only when the API returns a settled state.
5. Return technical receipt data without presenting it as legal certification.

Paying an external invoice is a separate high-risk action. It requires an
explicitly configured local payment adapter, an amount/budget check and the
operator's normal authorization policy. Hermes must never SSH to a hard-coded
server or construct a shell command from an untrusted invoice.

## Current commercial and traffic rules

- Lightning buyer total: merchant amount + `ceil(1%) + 5 sats`.
- Invoice creation: 60/minute per API key or IP.
- Status checks: 300/minute per API key or IP.
- Global safety net: 600 requests/minute.
- Use an idempotency key for retries and concurrent agent workloads.

## Incident handling

- Paid but locked: verify status by payment hash; do not ask the buyer to pay
  again until the first invoice is conclusively unresolved or expired.
- Payout pending/failed: record the hash and escalate through the payout retry
  workflow.
- Rate limit: respect `Retry-After`, use exponential backoff with jitter and do
  not switch identities to bypass the limit.
- Credential exposure: stop using the credential, rotate it, then review logs.

See `HERMES_SUPPORT_PLAYBOOK.md` for customer-support boundaries and
`skills/hermes_agent_skill/` for the reusable skill wrapper.
