# Changelog

All notable changes to the AIPP (SatsGate) protocol and application will be documented in this file.

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
- **LangChain Autonomous Agent:** `examples/langchain_aipp_agent.py` with EU AI Act Article 26 receipts.
- **n8n Workflow Template:** `examples/n8n_aipp_monetization_workflow.json`.
