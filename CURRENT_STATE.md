# AIPP — Current Project State

Last updated: 2026-08-14

## Open Tag Architecture & Live Status

A Smart Tag has one canonical `/t/:id` URL. Browsers receive the compact checkout while agents requesting JSON receive the Open Tag manifest at `/t/:id/manifest`. Tag invoices persist `tag_id`; fulfillment and portable receipts reject proofs that are not bound to that exact tag.

Live Production URL: `https://aipp.dev` (`89.167.84.31` — Docker container `aipp-key`)

## Key Accomplishments (Completed 2026-08-14)

### 1. Passkey & Biometric Authentication & Session Security
- Integrated WebAuthn / Passkey biometric login (fingerprint, FaceID, device PIN) with cryptographic key rotation.
- Persisted `session_token` and `merchant_key` in `localStorage` to eliminate third-party cookie blocking on Mobile Safari/iOS.
- Hardened `logout()` function to wipe `localStorage`, `sessionStorage`, call backend `/auth/logout`, and reset UI state (`display: none`, `window.scrollTo(0,0)`).
- Added an accessible topbar `← Sign Out` button for iPad, tablet, and mobile displays.

### 2. Ecosystem Brand Identity & SVG Precision (Option 05)
- Standardized Option 05 logo lockup (broken ring + slanted price tag) across `index.html`, `dashboard.html`, `docs.html`, `legal.html`, `extension/popup/popup.html`, and `aipp-tag-multitool.svg`.
- Engineered robust SVG arc rendering using `stroke-dasharray` circles to guarantee pixel-perfect rendering across Chromium, Safari, Firefox, iOS, and Android.
- Unified ecosystem typography with Google Fonts `Plus Jakarta Sans:800` & `Inter`.
- Removed leftover italic serif CSS overrides in `docs.html`.

### 3. Interactive Multitool Section & RYG Motion Flow
- Transformed the "One tag. Three useful tools." section into 3 interactive, responsive cards with Stripe/Linear-grade minimalist vector SVG icons.
- Added spring hover animations (`translateY(-6px)`), amber stripe glow, and Red-Yellow-Green (🔴🟡🟢) cable light pulses connecting to the central AIPP core hub.
- Compacted section scale by 15% for a tight, elegant layout.
- Added color-matched top accent borders to problem/solution cards (`The small-sale problem` - Red, `The Open Tag idea` - Green).

### 4. AI-Native Discovery & LLM Standards (`llms.txt`)
- Created `public/llms.txt` and `public/llms-full.txt` featuring AI Assistant System Prompts, copy-paste cURL QuickStarts, and a comprehensive Troubleshooting section for AI agents.
- Configured `public/robots.txt` (`User-agent: * Allow: /`) linking `llms.txt` and `sitemap.xml`.
- Added `<link rel="alternate" type="text/plain" href="/llms.txt">` header tag in `index.html`.

### 5. Chrome Extension (v1.2.0)
- Updated extension popup branding, Google Fonts `Plus Jakarta Sans`, and rebuilt Option 05 PNG icons (`icon16.png` to `icon128.png`).
- Re-packaged and deployed `public/aipp-extension.zip` with explicit `download="aipp-extension.zip"` attributes on homepage links.

### 6. Hermes Agent Integration
- Synced `HERMES_INSTRUCTIONS.md`, `HERMES_SUPPORT_PLAYBOOK.md`, `hermes_agent_skill/SKILL.md`, and `examples/hermes_aipp_agent_tool.py` with Open Tag `/t/:id/manifest` routes and L402 challenge specs.

---

## Plan for Tomorrow (Next Action Items)

1. **NPM & PyPI Package Bumps:**
   - Run `npm publish` for `sdk/aipp-node` (v1.2.0).
   - Run `twine upload` for `sdk/aipp-python` (v1.2.0).
2. **Chrome Web Store Submission:**
   - Submit `aipp-extension.zip` to the official Chrome Web Store developer dashboard.
3. **OpenAPI / Swagger Spec Document:**
   - Generate `public/openapi.json` for Swagger UI and API explorer.
4. **Community Announcement & Product Hunt Launch:**
   - Prepare Product Hunt and Twitter/X launch assets.

---

## Hermes Agent System Knowledge Summary

Hermes Agent (Nous Research) interacts with AIPP via:
- Skill File: `hermes_agent_skill/SKILL.md`
- Python Tool: `examples/hermes_aipp_agent_tool.py`
- Open Tag Manifest: `GET https://aipp.dev/t/<TAG_ID>/manifest`
- HTTP 402 Challenge: `WWW-Authenticate: L402 invoice="..."`
