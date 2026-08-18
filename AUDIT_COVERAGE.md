# AIPP audit coverage

Last updated: 2026-08-13

This file distinguishes files that were inspected from features that were
actually exercised end to end. "Reviewed" does not mean deployed.

| Area | Review state | Runtime verification |
|---|---|---|
| Core fee and Lightning invoice pricing | Reviewed and corrected | Unit tests passed |
| Payout worker and database migration | Reviewed and corrected | Build passed; staging wallet test pending |
| Merchant registration and dashboard | Reviewed and corrected | Build passed; browser staging test pending |
| Chrome extension source | Reviewed and corrected (v1.1.0) | Syntax/manifest passed; unpacked-Chrome test pending |
| Hermes instructions, skill and example | Reviewed and corrected | Python syntax passed; live Hermes test pending |
| Main landing page, docs and legal wording | Reviewed for fee/custody claims | Visual browser regression pending |
| `public/aipp-widget.js` | Reviewed and origin-hardened | Cross-site embed/payment test pending |
| Legacy `public/paywall.js` L402/x402 widget | Static scan only | Full browser/wallet test pending |
| Node SDK middleware | Partial review | Package build/test pending |
| Python SDK middleware/tools | Partial review | SDK tests pending |
| n8n, Make, LangChain, Gradio and FastAPI examples | Credential/receipt scan and selected fixes | Platform imports/live runs pending |
| Base USDC verification and payout | Static review only | Real Base staging transaction pending |
| Full SQLite/concurrency suite | Partial | Clean Linux native `sqlite3` run pending |

## Next audit order

1. Legacy paywall/widget browser flow.
2. Node and Python SDK packages.
3. n8n/LangChain/Make examples.
4. Base USDC real staging payment and payout.
5. Full Linux SQLite/concurrency suite and visual regression.
