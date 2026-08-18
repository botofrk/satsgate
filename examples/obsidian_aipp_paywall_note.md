# 📓 Monetizing Obsidian Notes & Vaults with AIPP Protocol

This guide enables **Obsidian (Obsidian.md / Publish)** creators, researchers, and PKM builders to sell notes, templates, and digital vaults with pay-per-item Bitcoin Lightning and Base USDC payment verification.

---

## ⚡ Method 1: Selling an Obsidian Vault (.zip)
1. Export your Obsidian Vault as a `.zip` archive and upload to Google Drive, Dropbox, or your private server.
2. Go to **[https://aipp.dev](https://aipp.dev)**.
3. Enter your price (e.g. `$2.50` / 3,800 sats), your payout wallet (`you@walletofsatoshi.com` or Base `0x...`), and paste your `.zip` download link as the redirect target.
4. Share your **Open Tag** (`https://aipp.dev/t/p_...`) anywhere. People see checkout; compatible agents can request its JSON manifest.

---

## 🏷️ Method 2: In-Note Embedded Paywall Card (Obsidian Publish)
Paste the following HTML snippet into any Obsidian Markdown file:

```html
<div style="border: 1px solid #e6e2dc; border-radius: 12px; padding: 20px; text-align: center; background: #faf8f5;">
  <h3>🔒 Premium Research Vault Note</h3>
  <p>Unlock the full interactive canvas & markdown notes for <strong>$0.50 (750 Sats)</strong>.</p>
  <iframe src="https://aipp.dev/embed/p_YOUR_TAG_ID" style="width: 100%; max-width: 360px; height: 380px; border: none; border-radius: 10px;"></iframe>
</div>
```

---

## 💎 Why AIPP for Obsidian?
- **Automated Settlement:** Funds settle to your configured wallet with no manual withdrawal step.
- **Disclosed Protocol Fee:** AIPP charges a 1% + 5 sats fee for Lightning and 1% for Base USDC.
- **Global Micro-Payments:** Sell $0.25 flash notes to thousands of readers worldwide.
