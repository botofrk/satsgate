# HERMES MASTER INSTRUCTIONS & ARCHITECTURE SPECIFICATION
*Version 1.3.2 — Production Certified (11 August 2026)*

This document serves as the permanent brain, operating manual, and architectural contract for the **Hermes AI Agent** operating on the AIPP production server (`root@89.167.84.31`, `/home/hermes/aipp/aipp-key`).

---

## ⚡ 1. PROTOCOL ARCHITECTURE & OPERATING PRINCIPLES

1. **Dual-Rail Settlement Standards:**
   - **Bitcoin Lightning (L402 / Bolt 12):** Micro-payments from $0.001 to $100. Uses LNbits backend (`/api/v1/payments`) backed by `aipp-phoenixd`. Returns cryptographic payment preimages upon settlement.
   - **Base EVM (x402 / USDC):** Direct transfer to gateway contract / merchant address on Base mainnet. Circle USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.
2. **Zero-Custody (Wallet = Identity):**
   - No customer or merchant balances are held permanently.
   - Merchants login without passwords using their Lightning address (e.g. `you@walletofsatoshi.com`) or Base EVM address.
   - Payouts route autonomously via `payoutWorker.ts`.
3. **EU AI Act Article 26 Compliance:**
   - Machine-to-machine AI tool transactions generate an immutable cryptographic receipt accessible at `GET /invoice/receipt/:hash`.

---

## 🛠️ 2. ACTIVE ENDPOINTS & ECOSYSTEM INTEGRATIONS

- **Smart Price Tags:**
  - `POST /merchant/links/create` or `POST /api/tag/create`: Mint a Smart Tag.
  - `GET /pay/:linkId`: Render HTML paywall checkout page.
  - `GET /embed/:linkId`: Embeddable iframe paywall (Notion `/embed`, Obsidian, Ghost, WordPress).
  - `GET /cli/:linkId` (or user-agent `curl`): Terminal ANSI colored ASCII QR code paywall.
- **Invoices & Receipts:**
  - `POST /invoice/create`: Issue an L402 / X402 payment challenge.
  - `GET /invoice/status` & `GET /invoice/status/:hash`: Poll settlement status (returns `{ paid: false, status: 'pending' }` gracefully if unpaid or empty).
  - `GET /invoice/receipt/:hash`: Fetch official EU AI Act compliance receipt.
- **Widgets & Templates:**
  - `public/aipp-widget.js`: Universal 1-line JS embed for Ghost, WordPress, Substack, Medium.
  - `examples/n8n_aipp_monetization_workflow.json`: Complete 5-node n8n workflow template.
  - `examples/make_aipp_monetization_blueprint.json`: Make.com / Zapier blueprint.
  - `examples/gradio_aipp_demo.py`: Hugging Face & Gradio AI model inference monetization.
  - `examples/obsidian_aipp_paywall_note.md`: Obsidian vault & note monetization guide.
  - `examples/langchain_aipp_agent.py`: LangChain / CrewAI autonomous AI agent tool.

---

## 🔒 3. SERVER DEPLOYMENT & MAINTENANCE RULES

- **Project Path:** `/home/hermes/aipp/aipp-key`
- **Docker Container:** `aipp-key` (Port 3000)
- **Deployment Protocol:**
  1. Frontend static files (`index.html`, `dashboard.html`, `docs.html`, `aipp-widget.js`) must be placed in both `/home/hermes/aipp/aipp-key/public/` AND inside container via `docker cp /home/hermes/aipp/aipp-key/public/<file> aipp-key:/app/public/<file>`.
  2. Backend TypeScript source files (`src/`) must be placed in `/home/hermes/aipp/aipp-key/src/` AND inside container via `docker cp`, followed by `docker restart aipp-key`.
  3. Git repositories on local and server must remain synchronized on `main` branch.

---

## 📜 4. COMMUNITY & SUBMISSION RECORD

- **n8n Forum:** Topic submitted to `community.n8n.io` (Category: `Built with n8n`, Tags: `payments, ai, webhook`).
- **LangChain Forum:** Topic submitted to `forum.langchain.com` (Category: `LangSmith Product Help -> Fleet`, Tags: `agents, tools`).
- **Next Launch Milestone:** X/Twitter 6-tweet thread & Chrome Web Store submission.
