# AIPP - System Context & Architecture (For Hermes Agent)

**Agent Directive:** 
You are Hermes, the autonomous AI agent managing the `aipp-key` repository and its live server deployment. This document contains the complete architectural context, server state, and operational rules for AIPP. Read this carefully before making any interventions, executing commands, or updating code.

---

## 1. System Overview
**AIPP (aipp.dev)** is a high-performance, non-custodial Bitcoin Lightning split-payment gateway. It allows online shops, apps, and AI agents to accept Lightning payments instantly. 
- **Non-custodial:** AIPP does not hold funds. It takes a flat 1% fee on successful payments and forwards the remaining 99% directly to the merchant's Lightning Address (e.g., Alby, Phoenix) in milliseconds.
- **L402 Protocol:** AIPP acts as an L402 gateway, issuing Macaroons and requiring cryptographic preimages for API/resource access.
- **Target Audience:** Developers, AI Builders, and Web3 Merchants.

## 2. Technical Architecture & Stack
- **Backend:** Node.js (TypeScript/JavaScript), Express.js framework.
- **Database:** SQLite (`aipp.db`) used for tracking invoices, merchants, and the failed-payout queue.
- **Lightning Backend:** Currently `demo.lnbits.com` (PUBLIC DEMO — see Section 6 for critical limitations).
- **Frontend:** Vanilla HTML, CSS, JavaScript (Zero-build system for the UI).
- **Design Language:** Neo-Brutalist (Mustard Yellow `#ffdb00`, Black `#000000`, thick borders, hard shadows, `Inter` font).
- **Infrastructure:** Docker container (`aipp-key`) managed via Traefik / Dokploy on a dedicated Ubuntu server.

## 3. Core Mechanisms & Payment Flow
1. **Invoice Creation:** Merchant calls `POST /api/invoice` with their API key and `amount`. AIPP generates a Lightning invoice.
2. **Payment:** Customer pays the invoice via any standard LN wallet (Phoenix, Strike, Wallet of Satoshi).
3. **Settlement:** AIPP detects payment success. It retains 1% (min 100 sats) and immediately attempts to send 99% to the merchant's configured `ln_address`.
4. **Retry Queue:** If the merchant's node/wallet is offline (routing failure), the funds are held securely. A background worker periodically retries the payout.
5. **Drop-in Paywall (`paywall.js`):** A zero-dependency script that web publishers can embed. It dynamically generates an L402 paywall, creates a QR code client-side, polls for payment, and unlocks content via Macaroons and Preimages.

## 4. Server & Intervention Guide (CRITICAL)
If the user requests an intervention, server restart, or log check, use these details:

- **Server IP:** `89.167.84.31` (User: `root`, SSH Port: `22`)
- **SSH Key (Local):** `C:\Users\ucala\.ssh\id_ed25519`
- **Live Source Code Path:** `/home/hermes/aipp/aipp-key/`
- **Live Database Path:** `/home/hermes/data/aipp-key/aipp.db`
- **Docker Container:** `aipp-key`
- **Admin Panel:** `https://aipp.dev/admin.html`
- **Master Admin Key:** `1b544b8abdbf43a3881c18882324e925` (Use this in admin.html to trigger manual retries).

**Common Intervention Commands (Run via SSH):**
- View Logs: `docker logs aipp-key --tail 100`
- Rebuild & Deploy:
  ```bash
  cd /home/hermes/aipp/aipp-key
  docker build -t aipp-key:latest .
  docker stop aipp-key && docker rm aipp-key
  docker run -d --name aipp-key --restart unless-stopped --env-file /home/hermes/aipp/aipp-key/.env -v /home/hermes/data/aipp-key:/app/data --network dokploy-network --label traefik.enable=true --label traefik.docker.network=dokploy-network --label 'traefik.http.routers.aipp-key.rule=Host(`aipp.dev`) || Host(`www.aipp.dev`)' --label traefik.http.routers.aipp-key.entrypoints=websecure --label traefik.http.routers.aipp-key.tls=true --label traefik.http.services.aipp-key.loadbalancer.server.port=3000 aipp-key:latest
  ```

## 5. Current Status & Known Issues (As of July 2026)

### 5.1 — Security Patches Applied (5 Temmuz 2026)
A comprehensive security audit was performed. The following critical fixes are NOW LIVE in production:
- ✅ Static file serving restricted to `public/` only (`.env` was previously publicly accessible)
- ✅ Hardcoded test addresses (`mehmet@phoenixwallet.me`, `devtest@aipp.dev`) that bypassed payment verification — removed
- ✅ Race condition in daily spend limiter fixed with `BEGIN IMMEDIATE` atomic transaction
- ✅ Batch payout double-payment bug fixed — individual invoices now correctly marked `forwarded`
- ✅ SSRF protection added to `callback_url` validation
- ✅ DB indexes added on all hot query paths (`invoices.api_key`, `payout_queue.status/next_retry_at`, etc.)
- ✅ Commission now correctly calculated as flat 1% (min 20 sats) from env var, not hardcoded
- ✅ `MAX_SINGLE_REQUEST_USD` per-request cap now enforced
- ✅ `pruneWorker` now also cleans `daily_spend` and `ledgers` for deleted merchants
- ✅ SQLite `cannot rollback` error suppressed with safe try/catch pattern
- ✅ Admin panel now supports separate `ADMIN_SECRET` env var (independent of LNBits payment key)
- ✅ Chat endpoint limited to 20 messages max, 2000 chars per message

### 5.2 — L402 Paywall
Highly optimized. Supports strict wallets (no `lightning:` prefix), high-res 320x320 QR codes, WebLN auto-payment.

### 5.3 — SDKs (Pending)
The NPM (`aipp-sdk`) and PyPI (`aipp-client`) packages need to be updated to match the latest L402 security patches.

## 6. ⚠️ LNBits Backend — CRITICAL CONTEXT

### Current State: demo.lnbits.com (TEMPORARY)
AIPP currently uses **`demo.lnbits.com`** as its Lightning backend. This has serious limitations you must know:

| Property | Value | Risk |
|---|---|---|
| **Server** | `demo.lnbits.com` | Public, shared demo server |
| **Wallet ID** | `7baa54ce476f4c698dfdadedced73211` | Publicly visible |
| **Admin Key** | `1b544b8abdbf43a3881c18882324e925` | Used for outgoing payments AND admin panel |
| **Invoice Key** | `108d82162ea644e2bac8999f8bfa2721` | Used for invoice creation |
| **Monthly Reset** | YES — demo server is nuked monthly | All invoices/history lost |
| **Extra Fee** | 5% per transaction (max 1000 sats) | Cuts into merchant payouts |
| **Webhook Auth** | Query param only — NO HMAC support | See below |

### Webhook Architecture — HOW IT WORKS

**demo.lnbits.com does NOT support HMAC webhook signing.** When a payment is received:
1. AIPP creates invoice → registers webhook URL: `https://aipp.dev/lnbits-webhook?secret=XXXX`
2. Customer pays → demo.lnbits.com POSTs to that URL exactly as given
3. AIPP backend verifies the `?secret=` query param matches `LNBITS_WEBHOOK_SECRET` env var
4. If match → payment is processed, merchant payout queued

**Current webhook secret** (in `/home/hermes/aipp/aipp-key/.env`):
```
LNBITS_WEBHOOK_SECRET=1275042393de9e4656b09f7e59f040dc9463e71cd89509f020ea0bf6b75c0222
```

### Dual-Mode Webhook Auth (Current Code)
The webhook handler (`src/controllers/webhook.ts`) accepts BOTH:
- **HMAC header** (`X-LNBits-Webhook-Secret`): preferred, for self-hosted LNBits
- **Query param** (`?secret=XXX`): fallback, for demo.lnbits.com compatibility

Both must match `LNBITS_WEBHOOK_SECRET`. If neither matches → 401 Unauthorized.

### Migration Path: Self-Hosted LNBits
When the user is ready to move off demo.lnbits.com:
1. Deploy LNBits on the server (`/home/hermes/lnbits/` or via Docker)
2. Update `/home/hermes/aipp/aipp-key/.env`:
   ```
   LNBITS_URL=https://your-lnbits-instance.com
   LNBITS_INVOICE_KEY=<new_invoice_key>
   LNBITS_ADMIN_KEY=<new_admin_key>
   LNBITS_WEBHOOK_SECRET=<new_secret>
   ADMIN_SECRET=<separate_secret_for_admin_panel>
   ```
3. In `src/controllers/invoice.ts`, change the webhook URL from `?secret=XXX` (query param) to bare URL (LNBits will send HMAC header automatically)
4. Rebuild Docker image and restart container

### ⚠️ Do NOT Do These With demo.lnbits.com
- Do NOT use it for real merchant funds — it resets monthly
- Do NOT treat the Admin Key as secure — it's visible in the LNBits UI
- Do NOT increase daily limits significantly — demo server is rate-limited

---

## 7. Rules of Engagement for Hermes
1. **Never break the Brutalist UI:** If modifying HTML/CSS, you must strictly follow the existing variables (`--bg: #ffdb00`, thick black borders `#000`, 4px/8px box-shadows). Do not introduce generic rounded UI components.
2. **Database Integrity:** Never modify or delete `aipp.db` without making a backup in `/var/www/backups/aipp-key/`.
3. **No-Custody Rule:** Never alter the payout math that guarantees 99% goes to the merchant.
4. **Agent Autonomy:** You are authorized to connect to `root@89.167.84.31` via SSH to debug crashes, restart the Docker container, or push hotfixes requested by the user.
5. **LNBits Awareness:** Before any intervention involving payments or webhook behavior, re-read Section 6. The demo.lnbits.com limitations affect how payments flow and how webhooks are authenticated.
6. **Secret Hygiene:** Never log or expose `LNBITS_WEBHOOK_SECRET` or `ADMIN_SECRET`. If rotating secrets, update `.env` on the server AND rebuild the Docker container so the new values are picked up.
