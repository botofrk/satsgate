# Customer Quickstart (self-hosted or hosted)

Integrate **AIPP** as a *customer* — no credit card required, just a Lightning wallet.

**In 3 commands:**

```bash
# 1. Check available plans (no auth needed)
curl -s https://your-server.com/v1/plans | jq

# 2. Buy credits (trial plan — 1K sats = 200 credits)
#    Returns 402 with Lightning invoice → pay it → get API key
curl -s https://your-server.com/v1/topup/trial

# 3. Use your API key
curl -s -H 'X-Api-Key: sg_YOUR_KEY' https://your-server.com/v1/balance
```

---

## Prerequisites
- A **Lightning wallet** (Alby, Zeus, Wallet of Satoshi, etc.)
- `curl` and `jq` (optional, for pretty JSON)

## 1. Get an API Key

```bash
# Get a Lightning invoice (enter: 1K sats = 200 credits)
curl -s https://your-server.com/v1/topup/trial | jq
```

This returns `HTTP 402` with an invoice. Pay it with your Lightning wallet.

```bash
# After paying, finalize topup with the L402 auth (macaroon:preimage)
# Copy the macaroon and preimage from the previous response
curl -s -H 'Authorization: L402 <macaroon>:<preimage>' \
  https://your-server.com/v1/topup/trial | jq
```

Save the returned `api_key` (starts with `sg_`). It is shown only once.

> 💡 **No NWC needed!** Just scan the invoice with any Lightning wallet.

## 2. Check Your Balance

```bash
curl -s -H 'X-Api-Key: sg_YOUR_KEY' https://your-server.com/v1/balance | jq
```

Expected: `{"ok": true, "credits": 200}`

## 3. Protect Your API with L402

When a user calls your AI endpoint, proxy through AIPP:

```bash
# 3a. Get a paywall challenge for your end-user
curl -s -X POST -H 'X-Api-Key: sg_YOUR_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"resource": "my-ai-endpoint", "amount_sats": 1}' \
  https://your-server.com/v1/paywall/challenge | jq
```

```bash
# 3b. Return HTTP 402 to your end-user with the invoice + macaroon
#     (your end-user pays with their Lightning wallet)

# 3c. After your end-user pays, verify the L402 proof
curl -s -X POST -H 'X-Api-Key: sg_YOUR_KEY' \
  -H 'Authorization: L402 <macaroon>:<preimage>' \
  -H 'Idempotency-Key: unique-request-id' \
  -H 'Content-Type: application/json' \
  -d '{"cost_credits": 1}' \
  https://your-server.com/v1/paywall/verify | jq
# → Charged 1 credit, balance decreases by 1
```

## Plans

| Plan | Price | Credits | Cost/verify |
|------|-------|---------|-------------|
| Trial | 1,000 sats (~$0.30) | 200 | 5 sats |
| Value | 25,000 sats (~$7.50) | 10,000 | 2.5 sats |
| Pro | 250,000 sats (~$75) | 150,000 | 1.67 sats |

> Credits never expire. No subscription. No credit card. No KYC.

## Automate with Auto-Topup

Set a threshold so your account never runs out:

```bash
curl -s -X POST -H 'X-Api-Key: sg_YOUR_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"auto_topup_enabled": true, "auto_topup_threshold": 500, "auto_topup_plan_id": "value"}' \
  https://your-server.com/v1/alerts | jq
```

Now when credits drop below 500, AIPP automatically buys the Value plan.

## Need Help?

- API docs: `https://your-server.com/docs`
- Server health: `curl https://your-server.com/health`
- Your dashboard: `https://your-server.com/dashboard`

