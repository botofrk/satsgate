# AIPP-Key - Changelog & Implementation History

## [v1.0.2] - 2026-07-03

### 🚀 Features & SDK Updates
- **USD Pricing / Synthetic Stablecoin Support (`amount_usd`):** Implemented the ability to create Lightning invoices priced in USD. Merchants and AI agents can now pass `amount_usd` instead of `amount_sats` to the `createInvoice` endpoint. The backend automatically converts the USD amount to satoshis using real-time BTC exchange rates.
- **Node.js SDK (`aipp-node`):**
  - Updated `ChargeParams` to accept an optional `amountUsd` property.
  - Published `aipp-node@1.0.2` to NPM.
- **Python SDK (`aipp-sdk`):**
  - Updated `create_charge` to accept an optional `amount_usd` argument.
  - Published `aipp-sdk@1.0.2` to PyPI.
- **Documentation:**
  - Added USD pricing examples to `docs.html` and educated users on utilizing "Stablesats" (like Blink or Strike) as settlement wallets to eliminate volatility risk.
## [v1.0.1] - 2026-06-30

### 🚀 Features & SDK Updates
- **Payout Feature (`payout()`):** Implemented the automatic payout (withdrawal) logic for AIPP. Merchants and AI agents can now trigger `payout()` to forward their accumulated Lightning balances to their configured `ln_address`.
- **Node.js SDK (`aipp-node`):**
  - Added `payout()` method and `PayoutResponse` types.
  - Published `aipp-node@1.0.1` to NPM.
- **Python SDK (`aipp-sdk`):**
  - Added `payout()` class method and `PayoutResponse` Pydantic models.
  - Published `aipp-sdk@1.0.1` to PyPI.
- **End-to-End (E2E) Testing:** Developed `test.js` covering the full lifecycle: `Merchant Registration` -> `Invoice Creation` -> `Payout Execution`. Verified that the minimum threshold (100 sats) constraints correctly reject premature payouts.

### 🐛 Bug Fixes & Infrastructure
- **LNBits / Phoenixd Integration Fix (520 / 401 Unauthorized Errors):** 
  - Identified and resolved a critical Docker DNS conflict where a stale `phoenixd` container (`172.23.0.9`) conflicted with the primary Dokploy-deployed `aipp-phoenixd` container (`172.23.0.5`). 
  - The internal DNS round-robining caused intermittent `401 Unauthorized` responses during `createInvoice` calls. Removed the rogue container, preventing downstream 520 errors in the AIPP backend.

### 🎨 UI & UX Improvements (`index.html`)
- **Modernized Demo Checkout:** Replaced the generic "Robot T-Shirt" placeholder product with a highly aesthetic, dark-mode "Premium LLM Inference" token visual, aligning the demo exactly with AIPP's "AI-to-AI Payment Protocol" vision.
- **Bento Grid CSS Fix:** Restored a missing closing brace (`}`) in the CSS that broke the media queries and grid structures. The "Use Cases" section now beautifully renders as a 3-column Bento box layout on desktop and gracefully stacks on mobile.
- **Footer Updates:** Added a direct contact mailto link (`aippdev@proton.me`) perfectly centered within the footer flexbox, ensuring responsive alignment across desktop and mobile screens.

---
*Note: This file tracks the history of autonomous development sessions. Future sessions can reference this file to understand the current capabilities of the platform and SDKs.*
