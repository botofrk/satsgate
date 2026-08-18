# AIPP Smart Price Tag — Product Design Specification

**Version:** 1.0  
**Status:** Draft — Core Architecture  
**Author:** Oscar (CEO) + Patron (Board)  
**Date:** 2026-08-01  

---

## 🎯 MANIFESTO

> **"Every product has a price tag. Every digital value should have one too."**

---

## 1. CORE CONCEPT: THE TAG

A **Smart Price Tag** is a portable, renderable, programmable representation of value. It is NOT a payment request — it IS the product's price tag in the digital world.

```
┌─────────────────────────────────────────────────────────────────┐
│                        SMART PRICE TAG                          │
├─────────────────────────────────────────────────────────────────┤
│  id: tg_7F2K9X2L                    ← Universal Tag ID        │
│  title: "AI Research Report"        ← Human readable           │
│  price: 500                         ← Minor units (5 USDC)     │
│  currency: "USDC"                   ← Settlement currency      │
│  network: "base"                    ← Settlement rail          │
│  wallet: "0x742...d8F1"             ← Merchant settlement addr │
│  status: "active"                   ← active | paid | expired  │
│  expires_at: "2026-08-15T23:59:59Z" ← Optional TTL             │
│  metadata: {                        ← Extensible context       │
│    product_type: "pdf",
│    delivery: "download_url",
│    creator: "researcher_42"
│  }                                  │
│  created_at: "2026-08-01T10:30:00Z" │
│  updated_at: "2026-08-01T10:30:00Z" │
└─────────────────────────────────────────────────────────────────┘
```

**Key Principle:** The Tag is the *source of truth*. Payment, delivery, verification — all derive from the Tag.

---

## 2. DATA MODEL (PostgreSQL)

```sql
-- Core tag table
CREATE TABLE tags (
    id              VARCHAR(24) PRIMARY KEY,        -- tg_<base32> e.g. tg_7F2K9X2L
    title           VARCHAR(256) NOT NULL,
    description     TEXT,
    price_minor     BIGINT NOT NULL,                -- 500 = 5.00 USDC (6 decimals)
    currency        VARCHAR(10) NOT NULL DEFAULT 'USDC',
    network         VARCHAR(20) NOT NULL DEFAULT 'base',  -- base | lightning | ethereum | polygon
    wallet_address  VARCHAR(66) NOT NULL,           -- Settlement destination
    status          VARCHAR(20) NOT NULL DEFAULT 'active', -- active | paid | expired | disabled | pending
    expires_at      TIMESTAMPTZ,                    -- Optional TTL
    metadata        JSONB NOT NULL DEFAULT '{}',    -- Extensible context
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Indexes
    CONSTRAINT tags_price_positive CHECK (price_minor > 0)
);

CREATE INDEX idx_tags_status ON tags(status);
CREATE INDEX idx_tags_wallet ON tags(wallet_address);
CREATE INDEX idx_tags_expires ON tags(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_tags_created ON tags(created_at DESC);
CREATE INDEX idx_tags_metadata_gin ON tags USING GIN(metadata);

-- Tag views/impressions (analytics)
CREATE TABLE tag_views (
    id              BIGSERIAL PRIMARY KEY,
    tag_id          VARCHAR(24) NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    viewer_ip       INET,
    user_agent      TEXT,
    referrer        TEXT,
    rendered_format VARCHAR(20),          -- qr | nfc | short | uri | json | embed
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tag_views_tag ON tag_views(tag_id, created_at DESC);

-- Tag payments (settlement records)
CREATE TABLE tag_payments (
    id                  BIGSERIAL PRIMARY KEY,
    tag_id              VARCHAR(24) NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    payment_id          VARCHAR(64) NOT NULL,           -- External payment ref (L402 preimage, tx hash, etc.)
    network             VARCHAR(20) NOT NULL,           -- base | lightning
    amount_minor        BIGINT NOT NULL,                -- Actual settled amount
    currency            VARCHAR(10) NOT NULL,
    status              VARCHAR(20) NOT NULL,           -- pending | confirmed | failed | refunded
    payer_address       VARCHAR(128),                   -- Payer identifier
    settlement_tx_hash  VARCHAR(128),                   -- On-chain proof
    l402_preimage       VARCHAR(128),                   -- For Lightning
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at        TIMESTAMPTZ
);

CREATE INDEX idx_tag_payments_tag ON tag_payments(tag_id);
CREATE INDEX idx_tag_payments_payment_id ON tag_payments(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX idx_tag_payments_status ON tag_payments(status);

-- Tag events (audit trail & webhooks)
CREATE TABLE tag_events (
    id          BIGSERIAL PRIMARY KEY,
    tag_id      VARCHAR(24) NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    event_type  VARCHAR(30) NOT NULL,           -- created | viewed | payment_initiated | paid | expired | disabled | refunded
    payload     JSONB NOT NULL DEFAULT '{}',    -- Event-specific data
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tag_events_tag ON tag_events(tag_id, created_at DESC);
CREATE INDEX idx_tag_events_type ON tag_events(event_type);
```

---

## 3. TAG ID SPECIFICATION

```
Format: tg_<base32_crockford>    (22 chars total, case-insensitive)
Example: tg_7F2K9X2L4Q8R3W5Y7Z9A1B

Properties:
- 128-bit entropy (Crockford base32: 26 chars × 5 bits = 130 bits)
- Human-readable: no 0/O, 1/I, 8/B confusion
- URL-safe, no special chars
- Prefix "tg_" for namespace clarity
- Short code: last 4-6 chars (e.g., "7F2K") for display/QR
```

**Generation:**
```python
import secrets, base64

def generate_tag_id() -> str:
    # 16 bytes = 128 bits
    raw = secrets.token_bytes(16)
    # Crockford base32 encoding
    encoded = base64.b32encode(raw).decode().lower().rstrip('=')
    # Crockford alphabet: 0-9, A-Z minus I, L, O, U
    crockford = encoded.translate(str.maketrans('ilou', '110v'))
    return f"tg_{crockford[:20]}"  # 20 chars = 100 bits visible entropy
```

---

## 4. RENDER FORMATS (The Tag's "Views")

The Tag is ONE object. These are just **render pipelines** — different presentations of the same data.

| Format | Use Case | Output |
|--------|----------|--------|
| **QR Code** | Visual scan (mobile, web) | SVG/PNG/DataURI with `aipp://tag/{id}` |
| **NFC** | Physical tap (stickers, cards) | NDEF record: `aipp://tag/{id}` |
| **Short Code** | Human dictation, print | `AIPP-7F2K` or `#7F2K` |
| **URI** | Deep links, sharing | `aipp://tag/tg_7F2K9X2L` / `https://aipp.dev/t/7F2K` |
| **JSON** | API consumers, SDKs | Full tag object + payment intent |
| **Embed HTML** | Websites, blogs | `<aipp-tag id="tg_7F2K9X2L"></aipp-tag>` (web component) |
| **Image/Sticker** | Physical merch, packaging | PNG with QR + short code + brand |

### Render API
```
GET /tags/{id}/render?format=qr&size=256&margin=4&color=000000&bg=ffffff
GET /tags/{id}/render?format=nfc
GET /tags/{id}/render?format=short
GET /tags/{id}/render?format=json
GET /tags/{id}/render?format=embed&theme=dark
GET /tags/{id}/render?format=image&template=sticker
```

---

## 5. API SURFACE

### REST Endpoints

```
POST   /tags                    # Create Tag
GET    /tags                    # List Tags (pagination, filters)
GET    /tags/{id}               # Get Tag
PATCH  /tags/{id}               # Update Tag (title, metadata, expires_at)
DELETE /tags/{id}               # Disable Tag (soft delete → status=disabled)
POST   /tags/{id}/disable       # Explicit disable
POST   /tags/{id}/enable        # Re-enable if not expired

# Rendering
GET    /tags/{id}/render        # Render in format (query param)

# Payments
POST   /tags/{id}/payment/intent    # Create payment intent (returns L402/X402 challenge)
GET    /tags/{id}/payment/status    # Check payment status
POST   /tags/{id}/payment/verify    # Verify payment (webhook target)

# Webhooks
POST   /webhooks/tags           # Register webhook for tag events
GET    /webhooks/tags           # List webhooks
DELETE /webhooks/tags/{id}      # Delete webhook
```

### Create Tag Request
```json
POST /tags
{
  "title": "AI Research Report Q3 2026",
  "description": "Deep dive into agent payment infrastructure",
  "price": 5.00,
  "currency": "USDC",
  "network": "base",
  "wallet": "0x742d35Cc6634C0532925a3b8D8F1...",
  "expires_in_days": 30,
  "metadata": {
    "product_type": "pdf",
    "delivery": "https://cdn.example.com/report.pdf",
    "creator": "researcher_42",
    "tags": ["ai", "research", "payments"]
  },
  "webhook_url": "https://merchant.example.com/aipp/webhook"
}
```

### Create Tag Response (201)
```json
{
  "id": "tg_7F2K9X2L4Q8R3W5Y7Z9A1B",
  "title": "AI Research Report Q3 2026",
  "price": 5.00,
  "currency": "USDC",
  "network": "base",
  "wallet": "0x742d35Cc6634C0532925a3b8D8F1...",
  "status": "active",
  "short_code": "AIPP-7F2K",
  "uri": "aipp://tag/tg_7F2K9X2L4Q8R3W5Y7Z9A1B",
  "web_url": "https://aipp.dev/t/7F2K",
  "expires_at": "2026-08-31T10:30:00Z",
  "created_at": "2026-08-01T10:30:00Z",
  "render": {
    "qr": "https://api.aipp.dev/tags/tg_7F2K9X2L4Q8R3W5Y7Z9A1B/render?format=qr",
    "nfc": "https://api.aipp.dev/tags/tg_7F2K9X2L4Q8R3W5Y7Z9A1B/render?format=nfc",
    "embed": "https://api.aipp.dev/tags/tg_7F2K9X2L4Q8R3W5Y7Z9A1B/render?format=embed",
    "image": "https://api.aipp.dev/tags/tg_7F2K9X2L4Q8R3W5Y7Z9A1B/render?format=image"
  }
}
```

---

## 6. EVENT LIFECYCLE

```
┌─────────────┐
│   CREATED   │  ← POST /tags
└──────┬──────┘
       │
       ▼
┌─────────────┐     View/Scan/Render
│   VIEWED    │  ← GET /tags/{id}/render (any format)
└──────┬──────┘       Records tag_views
       │
       ▼
┌──────────────────┐
│ PAYMENT_INITIATED│  ← POST /tags/{id}/payment/intent
└────────┬─────────┘       Returns L402 challenge / X402 header
       │
       ▼
┌─────────────┐
│    PAID     │  ← Webhook / payment verification
│  (settled)  │       tag_payments + tag.status = 'paid'
└──────┬──────┘
       │
       ├──────────────────┐
       ▼                  ▼
┌─────────────┐    ┌─────────────┐
│  EXPIRED    │    │  DISABLED   │
│ (TTL hit)   │    │ (merchant)  │
└─────────────┘    └─────────────┘
```

### Event Payloads
```json
// Tag Created
{ "event": "tag.created", "tag": {...}, "timestamp": "..." }

// Tag Viewed
{ "event": "tag.viewed", "tag_id": "tg_...", "format": "qr", "viewer_ip": "...", "timestamp": "..." }

// Payment Initiated
{ "event": "payment.initiated", "tag_id": "tg_...", "payment_id": "pay_...", "network": "base", "amount": 500, "timestamp": "..." }

// Paid (Settled)
{ "event": "tag.paid", "tag_id": "tg_...", "payment": {...}, "settlement_tx": "0x...", "timestamp": "..." }

// Expired
{ "event": "tag.expired", "tag_id": "tg_...", "timestamp": "..." }

// Disabled
{ "event": "tag.disabled", "tag_id": "tg_...", "reason": "merchant_request", "timestamp": "..." }
```

---

## 7. SETTLEMENT ENGINE (Dual-Rail)

The Tag delegates settlement to **two independent rails** — the Tag doesn't care *how* value moves, only *that* it moved.

### Rail A: X402 (Base USDC) — Primary for Web/API
```
Client Request → 402 Payment Required + X402 Header
                    ↓
            Client pays via Coinbase Wallet / WalletConnect / Smart Wallet
                    ↓
            USDC transfer on Base (instant, <$0.01)
                    ↓
            Verify on-chain → Tag PAID
```

### Rail B: L402 (Lightning) — Primary for AI Agents/M2M
```
Client Request → 402 Payment Required + L402 Challenge (macaroon + preimage)
                    ↓
            Client pays via Lightning (Alby Hub, Phoenixd, LNbits, CLN)
                    ↓
            Preimage revealed → Tag PAID
```

### Unified Payment Intent Response
```json
POST /tags/{id}/payment/intent
{
  "tag_id": "tg_7F2K9X2L4Q8R3W5Y7Z9A1B",
  "amount": 500,
  "currency": "USDC",
  "networks": {
    "base": {
      "type": "x402",
      "challenge": "x402_v1_base_eyJ...",  // Base64 encoded X402 payload
      "pay_to": "0x742d35Cc6634C0532925a3b8D8F1...",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"  // USDC on Base
    },
    "lightning": {
      "type": "l402",
      "challenge": "l402_v1_lsat_eyJ...",  // LSAT token
      "invoice": "lnbc500n1p...",          // BOLT11 invoice
      "preimage_hash": "sha256:abc123..."
    }
  },
  "expires_at": "2026-08-01T10:35:00Z"
}
```

**Client picks rail → pays → webhook confirms → Tag PAID.**

---

## 8. WEBHOOK SYSTEM

```json
POST /webhooks/tags
{
  "url": "https://merchant.example.com/aipp/webhook",
  "events": ["tag.viewed", "payment.initiated", "tag.paid", "tag.expired", "tag.disabled"],
  "secret": "whsec_abc123...",          // HMAC-SHA256 signing
  "active": true
}
```

**Delivery:** Async, retries with exponential backoff (3×), dead-letter after 24h.

---

## 9. SDK INTERFACE (TypeScript/Python)

```typescript
// TypeScript SDK
import { AIPP } from '@aipp/sdk';

const aipp = new AIPP({ apiKey: 'sk_live_...', network: 'base' });

// Create a tag
const tag = await aipp.tags.create({
  title: 'Premium API Access',
  price: 10.00,
  currency: 'USDC',
  wallet: '0x742d35Cc6634C0532925a3b8D8F1...',
  metadata: { tier: 'pro', rate_limit: 10000 }
});

// Render QR for checkout page
const qrSvg = await aipp.tags.render(tag.id, { format: 'qr', size: 256 });

// Verify payment (polling or webhook)
const payment = await aipp.tags.waitForPayment(tag.id, { timeout: 300 });

if (payment.status === 'confirmed') {
  // Deliver product
  await deliverDigitalProduct(payment.metadata.delivery_url);
}
```

```python
# Python SDK
from aipp import AIPP

aipp = AIPP(api_key="sk_live_...", network="base")

tag = aipp.tags.create(
    title="Research PDF",
    price=5.00,
    currency="USDC",
    wallet="0x742d35Cc6634C0532925a3b8D8F1...",
    metadata={"delivery": "https://cdn.example.com/report.pdf"}
)

# Webhook handler
@app.post("/aipp/webhook")
async def webhook(request: Request, aipp_webhook=Depends(aipp.webhook)):
    if aipp_webhook.event == "tag.paid":
        await deliver(aipp_webhook.tag.metadata["delivery"])
    return {"ok": True}
```

---

## 10. DEPLOYMENT ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                         AIPP TAG SERVICE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │   API GW    │───▶│  TAG CORE   │───▶│   POSTGRESQL        │ │
│  │ (Traefik)   │    │  (FastAPI)  │    │   (Primary)         │ │
│  └─────────────┘    └──────┬──────┘    └─────────────────────┘ │
│                            │                                     │
│              ┌─────────────┼─────────────┐                      │
│              ▼             ▼             ▼                      │
│       ┌────────────┐ ┌───────────┐ ┌────────────┐              │
│       │ RENDERER   │ │ SETTLEMENT│ │  WEBHOOK   │              │
│       │  SERVICE   │ │  ENGINE   │ │  WORKER    │              │
│       │ (QR/NFC/   │ │           │ │            │              │
│       │  IMAGE)    │ │ X402/L402 │ │ Async      │              │
│       └────────────┘ └───────────┘ └────────────┘              │
│                                                                 │
│  External:  Coinbase SDK, Alby Hub, LNbits, CLN, Base RPC      │
└─────────────────────────────────────────────────────────────────┘
```

**Docker Compose (Production):**
```yaml
services:
  tag-api:
    image: aipp/tag-api:latest
    environment:
      - DATABASE_URL=postgresql://...
      - REDIS_URL=redis://...
      - BASE_RPC_URL=https://mainnet.base.org
      - LIGHTNING_NODE=lnbits|phoenixd|cln
    deploy:
      replicas: 3
  
  tag-renderer:
    image: aipp/tag-renderer:latest
    deploy:
      replicas: 2
  
  tag-settlement:
    image: aipp/tag-settlement:latest
    environment:
      - LNBITS_URL=http://lnbits:5000
      - LNBITS_KEY=...
      - CLN_REST_URL=https://cln:50101
    deploy:
      replicas: 2
  
  tag-webhook:
    image: aipp/tag-webhook:latest
    deploy:
      replicas: 2
```

---

## 11. SECURITY & COMPLIANCE

| Layer | Measure |
|-------|---------|
| **API** | API Keys (sk_live_/sk_test_), rate limiting, CORS |
| **Tags** | Unguessable IDs (128-bit), optional auth for private tags |
| **Payments** | On-chain verification (X402), preimage verification (L402) |
| **Webhooks** | HMAC-SHA256 signatures, replay protection (timestamp) |
| **Data** | Encrypted at rest (PostgreSQL TDE), TLS 1.3 in transit |
| **PII** | No PII stored — only wallet addresses, IPs (hashed for analytics) |
| **Compliance** | No KYC for tags <$1000, optional KYC hook for merchants |

---

## 12. ROADMAP (MVP → v1)

| Phase | Scope | Timeline |
|-------|-------|----------|
| **MVP** | Core Tag CRUD, QR render, X402 (Base USDC) only, webhook | Week 1-2 |
| **v0.2** | L402 (Lightning) rail, NFC render, Short codes, SDK (TS/Python) | Week 3-4 |
| **v0.3** | Tag analytics (views, conversion), Embed web component, Image templates | Week 5 |
| **v1.0** | Multi-currency, Split payments, Tag templates, Merchant dashboard | Week 6-8 |

---

## 13. OPEN QUESTIONS FOR PATRON

1. **Tag ID format:** `tg_7F2K9X2L` vs `#7F2K` vs `AIPP-7F2K` — which as canonical?
2. **Currency default:** USDC only at launch, or multi-currency from day 1?
3. **Free tier:** How many free tags/month? (suggest: 100 free, then $0.01/tag)
4. **Merchant onboarding:** Self-serve API key generation vs manual approval?
5. **Branding:** `aipp.dev/t/{short}` vs custom domains for merchants?

---

*End of Specification — Ready for implementation planning.*

---

**"Every product has a price tag. Every digital value should have one too."** — AIPP Manifesto