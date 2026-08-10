# AIPP Protocol (SatsGate) — Master Architecture & Hermes Agent Bible
*Version: 2.0.0 — Production Grade*
*Last Updated: 10 August 2026*

---

## 🎯 1. Executive Summary & Mission Statement

**AIPP (aipp.dev)** — also known as **SatsGate** — is a high-performance, **100% non-custodial Smart Price Tag and micro-payment routing protocol**. 

### The Core Vision: *"Everything can have a Smart Price Tag."*
AIPP enables content creators, software developers, and autonomous AI agents to attach a cryptographic, dual-rail price tag to any web content, link, file, API endpoint, or digital asset in **3 seconds**.

### Fundamental Pillars:
1. **100% Non-Custodial (Zero Custodial Risk):** AIPP never holds, pools, or stores customer funds. Payments are settled in real time and automatically forwarded directly to the creator's personal self-hosted wallet (Phoenix, Wallet of Satoshi) or Base EVM wallet (`0x...`).
2. **Dual-Rail Architecture:** Accepts both **Bitcoin Lightning Network (L402 / Satoshis)** and **Base Network (x402 / USDC Stablecoin)**.
3. **Frictionless Mobile-First Experience:** 1-Click direct wallet launching (`lightning:` URI scheme) eliminating QR scanning or screenshot friction on smartphones.
4. **Zero-Friction Identity:** Creators log into their Studio Console simply by typing their wallet address (`Wallet = Identity`) — zero complex 32-character API keys to memorize.
5. **Machine-to-Machine (M2M) & AI Agent Ready:** Native SDKs (TypeScript/Node.js & Python) supporting cryptographic **EU AI Act Article 26** compliant settlement receipts.

---

## 🏗️ 2. Core Architecture & Tech Stack

```
                                    ┌────────────────────────────────────────────────────────┐
                                    │                   CLIENTS & CREATORS                   │
                                    │  • Web Studio (dashboard.html)                         │
                                    │  • Checkout Pages (/pay/:id & /t/:id)                  │
                                    │  • Chrome Extension (Manifest V3)                      │
                                    │  • AI Agents & SDKs (Node.js & Python)                 │
                                    └──────────────────────────┬─────────────────────────────┘
                                                               │ HTTPS / REST / L402
                                                               ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                             AIPP BACKEND ENGINE (aipp-key)                                             │
│                                                                                                                        │
│  ┌───────────────────────┐   ┌───────────────────────────┐   ┌─────────────────────────┐   ┌────────────────────────┐  │
│  │   Security & Rate     │   │   Smart Tag & PayLink     │   │   Frictionless Wallet   │   │   Settlement Engine    │  │
│  │   Limiter (5 req/min) │   │   Controller              │   │   Identity Router       │   │   & Webhook Handler    │  │
│  └───────────────────────┘   └───────────────────────────┘   └─────────────────────────┘   └────────────────────────┘  │
│                                              │                                                          │              │
│                                              ▼                                                          ▼              │
│                              ┌───────────────────────────────┐                          ┌───────────────────────────┐  │
│                              │   SQLite Database (aipp.db)   │                          │   Dead-Letter Queue &     │  │
│                              │   • merchants                 │                          │   Payout Dispatcher       │  │
│                              │   • payment_links             │                          └───────────────────────────┘  │
│                              │   • invoices                  │                                                         │
│                              │   • payout_queue              │                                                         │
│                              │   • failed_payouts            │                                                         │
│                              └───────────────────────────────┘                                                         │
└───────────────────────────────────────────────┬────────────────────────────────────────────────────────┬───────────────┘
                                                │                                                        │
                        ┌───────────────────────┴────────────────────────┐       ┌───────────────────────┴───────────────┐
                        │     RAIL A: BITCOIN LIGHTNING (L402)           │       │       RAIL B: BASE NETWORK (X402)     │
                        │  • aipp-phoenixd Node (Port 9740)              │       │  • Circle USDC on Base (0x833589...)  │
                        │  • ACINQ Lightning Channel (~2M sats capacity) │       │  • Base RPC Event Logs Verification   │
                        │  • Bolt 11 & Bolt 12 (BIP 353) Support         │       │  • Instant 0x Wallet Forwarding       │
                        └────────────────────────────────────────────────┘       └───────────────────────────────────────┘
```

- **Runtime:** Node.js (v20+), TypeScript, Express.js.
- **Database:** SQLite 3 (`/app/data/aipp.db`) with exclusive transaction locks (`BEGIN IMMEDIATE / EXCLUSIVE`) and parameterized queries for 100% SQL injection immunity.
- **Lightning Engine:** Self-hosted `aipp-phoenixd` container running native Phoenixd node connected to ACINQ LSP channels + LNbits management layer.
- **Base EVM Engine:** Direct JSON-RPC communication with Base Mainnet (Chain ID `8453`), Circle Official USDC contract (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`).
- **Web Proxy & SSL:** Traefik v3 reverse proxy with Let's Encrypt automated TLS v1.3 certificates.

---

## ⚡ 3. Dual-Rail Payment Engine (L402 & x402 Deep Dive)

AIPP operates two independent, high-throughput payment rails:

### ⚡ Rail A: Bitcoin Lightning (L402 Protocol)
- **Standard:** HTTP 402 Payment Required + L402 Macaroon / Bolt 11 / Bolt 12.
- **Pricing:** Dynamic USD-to-Satoshi conversion using live Bitcoin price feeds (`BTC/USD` via CoinGecko + Kraken fallback).
- **Fee Structure:** Flat 1% routing fee with a **5 sats minimum floor** (`Math.max(5, Math.ceil(amount_sats * 0.01))`).
- **Settlement Verification:** 
  1. Customer pays Lightning invoice.
  2. Lightning network resolves the HTLC and returns the **32-byte cryptographic Preimage**.
  3. AIPP verifies `SHA256(preimage) === payment_hash`.
  4. Invoice status transitions to `settled`.
- **Payout Dispatch:**
  - **Phoenix Mobile Wallets:** Settled via Bolt 12 Offer (`lno1...`) using `/phoenix/phoenix-cli payoffer --offer='<lno1...>' --amountSat=<sats>`.
  - **Standard LNURL-pay Wallets (Wallet of Satoshi, Blink, Zeus):** Settled via LNURL-pay callback resolution (`https://domain/.well-known/lnurlp/user`).

### 🔵 Rail B: Base Network USDC (x402 Protocol)
- **Standard:** Web3 EVM Smart Contract Transfer on Base L2.
- **Contract:** Circle USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, 6 decimals).
- **Fee Structure:** Flat 1% (`merchant_amount = amount_usd * 0.99`).
- **Settlement Verification:**
  1. Customer transfers USDC directly to the merchant or gateway address via MetaMask, Coinbase Wallet, or Rabby.
  2. Client submits Transaction Hash (`tx_hash`).
  3. AIPP queries Base RPC for `eth_getTransactionReceipt(tx_hash)`.
  4. AIPP inspects event logs to confirm `Transfer(from, to, value)` on the official USDC contract with status `0x1` (Success).
  5. Replay Attack Protection: Transaction hashes are stored in SQLite; a single hash cannot settle more than one invoice.

---

## 🏷️ 4. Smart Price Tag Protocol & Content Fulfillment

1. **Tag Creation:** Creator defines a title, USD price ($0.01 to $100.00), and an optional `redirect_url` (secret download link, Notion doc, API endpoint, Discord invite).
2. **Checkout URL Generated:** Unique permanent link: `https://aipp.dev/pay/p_<hex12>` (alias `https://aipp.dev/t/<id>`).
3. **Dynamic Invoice Generation:** When buyer visits the link and selects Lightning or USDC:
   - Backend calls `/pay/:id/invoice`.
   - Caches active pending invoice (5-minute reuse filter to prevent invoice bloat).
4. **Instant Unlock:**
   - As soon as preimage or EVM receipt confirms settlement:
   - If `redirect_url` exists: Checkout page automatically redirects buyer in 1.4s.
   - If no `redirect_url`: Checkout page renders on-screen verified receipt and access token.

---

## 📱 5. Mobile & UX Architecture

- **1-Click Deep Linking:** The checkout page features an interactive **"⚡ Open in Lightning Wallet (1-Click)"** button (`href="lightning:lnbc..."`).
  - Tapping this on iOS/Android opens Phoenix, Wallet of Satoshi, Zeus, Blink, or Strike with the invoice pre-filled.
- **Universal BIP-21 Lowercase QR Compatibility:**
  - QR codes encode `lightning:lnbc...` in lowercase with `margin: 3` and high-contrast `#000000 / #ffffff`.
  - Solves Android/iOS camera and gallery OCR parsing issues for strict wallets like Phoenix.
- **Studio Mobile Bottom Bar:**
  - `public/dashboard.html` renders a fixed bottom navigation tab bar on screens `< 800px` (`Overview`, `Tags`, `Ledger`, `Wallets`).

---

## 🔐 6. Frictionless Identity Model (`Wallet = Identity`)

### The Architecture:
- Traditional API key memorization was replaced with **Wallet Address Login**:
  - When a user inputs their Lightning Address (`you@walletofsatoshi.com`, `you@phoenixwallet.me`) or Base Address (`0x...`):
  - Backend `registerMerchant` checks `WHERE ln_address = ? OR LOWER(usdc_address) = LOWER(?)`.
  - **If Existing:** Returns their session and API key seamlessly (HTTP 200 OK — zero 409 errors).
  - **If New:** Generates a new merchant record with 128-bit entropy key (`aipp_merch_<hex16>`).
  - **If Account Wiped/Deleted:** The same wallet can be re-registered immediately with zero blocking.
- **Non-Custodial Security Proof:**
  - Because AIPP holds zero custodial funds, viewing metrics or generating tags requires no passwords. Mutating existing payout wallets requires session token authentication.

---

## 🛡️ 7. Payout Engine & Dead-Letter Safety Queues

- **Automatic Threshold:** Settled balances accumulate in `invoices`. When net balance reaches threshold (default: 50 sats), the background worker automatically queues a payout.
- **Dead-Letter Queue (`failed_payouts`):**
  - If a merchant wallet is temporarily unreachable (e.g. invalid LNURL or routing error), the payout worker attempts **5 retries** with exponential backoff (`1m`, `5m`, `15m`, `30m`, `60m`).
  - If all 5 retries fail, the transaction is safely moved to `failed_payouts` table.
  - Funds are never lost. Admin console (`/admin.html`) provides 1-click retry dispatch.

---

## 📦 8. Client Ecosystem & SDKs

### 1. Node.js / TypeScript SDK (`@aipp/sdk`)
```typescript
import { Aipp } from '@aipp/sdk';
const aipp = new Aipp({ apiKey: 'aipp_merch_...' });

// Create a Smart Price Tag Link
const tag = await aipp.createTag({ title: 'AI Workflow Pack', price: 0.25 });

// Create on-demand Dual-Rail invoice
const charge = await aipp.createCharge({ amountUsd: 0.10, protocol: 'DUAL' });

// Check real-time status
const status = await aipp.getCharge(charge.payment_hash);
```

### 2. Python SDK (`aipp-sdk`)
```python
from aipp import Aipp
client = Aipp(api_key="aipp_merch_...")

# Create L402 charge
charge = client.create_charge(amount_usd=0.05, protocol="L402", memo="AI Agent Access")

# Fetch EU AI Act Art. 26 Cryptographic Receipt
receipt = client.get_receipt(charge.payment_hash)
```

### 3. Chrome Extension (Manifest V3)
- Packaged as `public/aipp-extension.zip`.
- Uses on-demand script injection via `chrome.scripting` and `activeTab` permissions (100% Chrome Web Store User Data Policy compliant).
- Allows creators to right-click or select any element on the web and create an AIPP Smart Tag in 3 seconds.

### 4. LangChain AI Agent Tool (`examples/langchain_aipp_agent.py`)
- Python tool implementation for autonomous LLM agents (LangChain, CrewAI, LlamaIndex).
- Agent receives HTTP 402 challenge, settles via Lightning, verifies preimage, and fetches EU AI Act Article 26 cryptographic receipts.

### 5. n8n No-Code Workflow Monetization (`examples/n8n_aipp_monetization_workflow.json`)
- 1-Click importable JSON workflow for n8n.
- Integrates `Webhook Trigger` ➔ `HTTP Request (GET /invoice/status/:hash)` ➔ `IF status == 'settled'` ➔ `Deliver Output`.

### 6. Live Global Research Showcase (`aipp.dev/#showcase`)
- Live specimen tag `TAG-254EB7FB` (`p_254eb7fb9e10`) monetizing the *Emerging Markets Crypto Wallet Adoption & Non-Custodial Infrastructure Analysis (2026)* for $0.01 (16 sats) pointing to Notability.

---

## 🖥️ 9. Hermes Operational Server & Deployment Guide

### Server & Connection Parameters:
- **Server IP:** `89.167.84.31` (User: `root`, Port: `22`)
- **Local SSH Key:** `C:\Users\ucala\.ssh\id_ed25519`
- **Server Project Path:** `/home/hermes/aipp/aipp-key`
- **Docker Container Names:**
  - Main Backend: `aipp-key`
  - Phoenixd Lightning Node: `aipp-phoenixd`
- **Live Database File:** `/app/data/aipp.db` (Host: `/home/hermes/aipp/aipp-key/data/aipp.db`)
- **Admin Dashboard:** `https://aipp.dev/admin.html`
- **Official Contact Emails:** `info@aipp.dev` | `support@aipp.dev`

### Essential Hermes CLI Commands:

#### 1. Check Container Health & Logs:
```bash
docker ps | grep aipp
docker logs --tail 50 aipp-key
```

#### 2. Deploy Frontend / Code Updates into Running Container:
```bash
# Copy files into Docker container without rebuilding
docker cp /home/hermes/aipp/aipp-key/public/index.html aipp-key:/app/public/index.html
docker cp /home/hermes/aipp/aipp-key/public/dashboard.html aipp-key:/app/public/dashboard.html
docker cp /home/hermes/aipp/aipp-key/src/controllers/payLink.ts aipp-key:/app/src/controllers/payLink.ts

# Restart container to apply backend TypeScript/JS changes
docker restart aipp-key
```

#### 3. Query Database Safely via Docker:
```bash
docker exec aipp-key node -e '
const sqlite3 = require("sqlite3");
const db = new sqlite3.Database("/app/data/aipp.db");
db.all("SELECT api_key, ln_address, usdc_address FROM merchants;", (e, rows) => console.log(rows));
'
```

#### 4. Pay Lightning Invoices Directly via Server Phoenix Node:
```bash
docker exec aipp-phoenixd /phoenix/phoenix-cli payinvoice --invoice=<lnbc...>
```

#### 5. Pay Phoenix Bolt 12 Offers Directly:
```bash
docker exec aipp-phoenixd /phoenix/phoenix-cli payoffer --offer='<lno1...>' --amountSat=<sats>
```

---

## 🔒 10. Security, Rate Limiting & Compliance Matrix

| Security Layer | Implementation Detail |
|---|---|
| **DDoS / Anti-Abuse** | `5 requests/min` per IP on `/pay/*` and `/t/*` endpoints (Tested & verified: 6th request triggers HTTP 429). |
| **SQL Injection** | 100% Parameterized queries with SQLite prepared statements. Zero raw string interpolation. |
| **SSRF Protection** | `isSafeCallbackUrl` filters out internal IPv4/IPv6, localhost (`127.0.0.1`), and AWS metadata (`169.254.169.254`). |
| **Data Privacy** | Zero KYC, zero passwords, zero tracking cookies, zero third-party analytics scripts. |
| **Non-Custodial Legal Status** | Operating strictly as open routing software. No custody, banking, or money transmission license required. |

---

*Hermes Agent Directive: Refer to this document as the authoritative specification for all code deployments, database queries, and architectural decisions.*
