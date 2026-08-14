# Changelog

## 2026-08-13 — Open Tag 1.0

- Made `/t/:id` the canonical human-and-agent Smart Tag URL using content negotiation.
- Added machine-readable manifests with price, rails, schemas and fulfillment endpoints.
- Bound Smart Tag invoices and receipts to the exact resource to prevent cross-tag proof reuse.
- Added tag-specific unlock and portable receipt endpoints.
- Updated the homepage, Studio, extension, docs, Hermes and project knowledge around one idea: price once, sell to a human or agent.

All notable changes to the AIPP Open Tag protocol and application are documented in this file.

## [Unreleased] - 2026-08-13
### Changed
- Lightning checkout now charges the buyer the merchant price plus
  `ceil(1%) + 5 sats`; the listed merchant amount is not reduced by the fee.
- Invoice creation is limited to 60/minute per API key or IP, status checks to
  300/minute, with a 600/minute global safety net.
- Dashboard API keys are kept in session storage and all dynamic values are
  escaped before rendering.
- Product, documentation and Hermes wording now describes the actual
  settle-then-forward Lightning model instead of claiming zero custody.

### Fixed
- Prevented re-registration of an existing Lightning address from issuing a new
  merchant API key.
- Corrected payout amount calculation and added payout reference/error fields.
- Added unique checkout IDs/idempotency protection for Smart Tag invoice retries.
- Unknown production tags now return 404.

### Security
- Removed hard-coded credentials, internal SSH payment execution and unsupported
  compliance claims from Hermes and operational documentation.
- Chrome extension API keys now use local extension storage rather than Chrome
  Sync and are no longer placed in dashboard query strings.
- Widget settlement messages validate both the AIPP origin and checkout iframe.

### Chrome extension
- Element Picker now creates a real `/merchant/links/create` Smart Tag before
  copying embed code; the former `data-aipp-src="demo"` placeholder was removed.
- Added price/URL validation, useful API errors and explicit preview/security
  guidance. Removed the misleading fixed-price context-menu flow.

### Product experience
- Rebuilt the homepage around one compact Smart Tag creator instead of a long
  protocol/feature catalogue.
- Reduced the creator to three product choices and made Lightning the default;
  USDC and dual-rail payout fields now appear only when selected.
- Moved the creator below the three-tool product illustration and restyled it as
  a smaller Quick Tag card so the homepage explains the product before asking
  for payout details.
- Refined Quick Tag into a narrow single-column tool with soft field groups,
  an embedded USD marker, a black primary action and a direct-to-wallet trust
  message.
- Added a compact four-stage animated flow beneath Quick Tag: Smart Tag, Pay,
  Verify and Unlock, with a reduced-motion fallback and a 2x2 mobile layout.
- Unified the homepage, dashboard, documentation, legal/admin pages, paywall
  demo and Chrome extension around the existing AIPP circle-arrow mark.
- Standardized the brand palette to ink, AIPP yellow and warm cream; green is
  reserved for success and blue for Base USDC. Removed obsolete orange logos
  and fixed SVG animation text contrast.
- Reduced the public story to three jobs: sell a link/file, tag a website, or
  charge an API/agent.
- Replaced generic feature cards with an original, responsive AIPP Tag
  Multi-Tool illustration whose three modules represent the product jobs.

## [1.3.2] - 2026-08-11
### Added
- **Multi-Ecosystem Monetization Suite:**
  - **Notion Paywalls & Embeds:** Added `/embed/:id` endpoint with `frame-ancestors *` CSP header for seamless embedding in Notion documents.
  - **Ghost, WordPress & Substack Widget:** Created `public/aipp-widget.js` for 1-line client-side article blurring and instant unlock upon micro-payment.
  - **Hugging Face & Gradio AI Monetization:** Created `examples/gradio_aipp_demo.py` for per-inference GPU compute monetization.
  - **Make.com & Zapier Blueprint:** Created `examples/make_aipp_monetization_blueprint.json` importable workflow template.
  - **Obsidian.md Vault & Notes Guide:** Created `examples/obsidian_aipp_paywall_note.md`.
  - **Terminal / Curl Paywall:** Added `/cli/:id` and curl user-agent detection returning interactive ANSI colored ASCII QR codes and instant CLI unlocks.
- **Community Submissions:**
  - Submitted verified n8n workflow template to `community.n8n.io`.
  - Submitted LangChain autonomous micro-payment tool to `forum.langchain.com`.

### Fixed
- **Mobile Responsiveness Overhaul:** Resolved horizontal overflow on small mobile viewports (320px-480px) in `public/index.html`.
- **Graceful Invoice Polling:** Handled empty or unpaid invoice hashes in `GET /invoice/status` by returning `{ paid: false, status: 'pending' }` with HTTP 200 instead of 404.

## [1.3.1] - 2026-08-10
### Added
- **Global Showcase:** English Emerging Markets Crypto Adoption report on `public/index.html`.
- **LangChain Autonomous Agent:** `examples/langchain_aipp_agent.py` with machine-readable technical receipts.
- **n8n Workflow Template:** `examples/n8n_aipp_monetization_workflow.json`.
