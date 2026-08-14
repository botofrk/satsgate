import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDb } from '../config/database';
import { AppError } from '../utils/error';
import { getBtcUsdRate } from '../services/price';
import { BASE_NETWORK_NAME, USDC_ADDRESS, LNBITS_URL, LNBITS_INVOICE_KEY, IS_PRODUCTION } from '../config/env';
import { getGatewayAddress } from '../services/base';
import { checkLimit } from '../services/limiter';
import { generateInvoiceData, InvoiceDomainError } from '../services/invoiceService';
// API Key helper
function getAippKey(req: Request): string | null {
  const headerKey = (req.headers['x-api-key'] as string) || (req.headers['authorization'] as string);
  if (headerKey) {
    if (headerKey.startsWith('Bearer ')) return headerKey.slice(7).trim();
    return headerKey.trim();
  }
  if (req.query.api_key && typeof req.query.api_key === 'string') {
    return req.query.api_key.trim();
  }
  return null;
}

// 1. Create a new Payment Link
export const createPaymentLink = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = getAippKey(req);
    if (!apiKey) {
      throw new AppError('Missing API key', 401, 'UNAUTHORIZED');
    }

    const db = getDb();
    const merchant = await db.get('SELECT api_key FROM merchants WHERE api_key = ?', apiKey);
    if (!merchant) {
      throw new AppError('Invalid API key', 401, 'UNAUTHORIZED');
    }

    const { title, amount_usd, redirect_url, capability_type, description, input_schema, output_schema } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0 || title.trim().length > 120) {
      throw new AppError('Title is required', 400, 'BAD_REQUEST');
    }
    const numAmount = Number(amount_usd);
    if (isNaN(numAmount) || numAmount < 0.01 || numAmount > 100.0) {
      throw new AppError('Amount must be between 0.01 and 100.00 USD', 400, 'BAD_REQUEST');
    }
    let cleanRedirect = '';
    if (redirect_url && typeof redirect_url === 'string' && redirect_url.trim().length > 0) {
      if (redirect_url.length > 2048) throw new AppError('Redirect URL is too long', 400, 'BAD_REQUEST');
      try {
        const parsed = new URL(redirect_url.trim());
        if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('bad protocol');
        cleanRedirect = parsed.toString();
      } catch {
        throw new AppError('Redirect URL must be a valid http(s) URL', 400, 'BAD_REQUEST');
      }
    }

    const linkId = 'p_' + crypto.randomBytes(6).toString('hex');
    const capabilityType = ['link', 'file', 'ai', 'booking', 'api'].includes(capability_type)
      ? capability_type
      : 'link';
    const cleanDescription = typeof description === 'string' ? description.trim().slice(0, 500) : '';
    const normalizeSchema = (value: unknown) => {
      if (value === undefined || value === null || value === '') return null;
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('schema');
      const encoded = JSON.stringify(parsed);
      if (encoded.length > 8000) throw new Error('schema');
      return encoded;
    };
    let cleanInputSchema: string | null = null;
    let cleanOutputSchema: string | null = null;
    try {
      cleanInputSchema = normalizeSchema(input_schema);
      cleanOutputSchema = normalizeSchema(output_schema);
    } catch {
      throw new AppError('Input and output schemas must be JSON objects under 8 KB', 400, 'INVALID_SCHEMA');
    }
    await db.run(
      'INSERT INTO payment_links (id, api_key, title, amount_usd, redirect_url, capability_type, description, input_schema, output_schema, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      linkId,
      apiKey,
      title.trim(),
      numAmount,
      cleanRedirect,
      capabilityType,
      cleanDescription || null,
      cleanInputSchema,
      cleanOutputSchema,
      new Date().toISOString()
    );

    res.json({
      id: linkId,
      url: `${req.protocol}://${req.get('host')}/t/${linkId}`,
      human_url: `${req.protocol}://${req.get('host')}/t/${linkId}`,
      manifest_url: `${req.protocol}://${req.get('host')}/t/${linkId}/manifest`,
      title: title.trim(),
      amount_usd: numAmount,
      redirect_url: cleanRedirect,
      capability_type: capabilityType
    });
  } catch (error) {
    next(error);
  }
};

// 2. List all Payment Links for a Merchant
export const getPaymentLinks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = getAippKey(req);
    if (!apiKey) {
      throw new AppError('Missing API key in headers', 401, 'UNAUTHORIZED');
    }

    const db = getDb();
    const links = await db.all(
      'SELECT id, title, amount_usd, redirect_url, created_at FROM payment_links WHERE api_key = ? ORDER BY created_at DESC',
      apiKey
    );

    const host = `${req.protocol}://${req.get('host')}`;
    const formatted = links.map(l => ({
      ...l,
      url: `${host}/t/${l.id}`,
      manifest_url: `${host}/t/${l.id}/manifest`
    }));

    res.json(formatted);
  } catch (error) {
    next(error);
  }
};

export const renderPaymentPage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.setHeader('Content-Security-Policy', "frame-ancestors *;");
    res.setHeader('Link', `</t/${req.params.linkId}/manifest>; rel="describedby"; type="application/json"`);
    res.removeHeader('X-Frame-Options');
    const { linkId } = req.params;
    const db = getDb();
    let link = await db.get('SELECT * FROM payment_links WHERE id = ?', linkId);
    
    if (!link && IS_PRODUCTION) {
      throw new AppError('Smart Tag not found', 404, 'NOT_FOUND');
    }
    if (!link) {
      link = {
        id: linkId,
        api_key: 'aipp_devtest',
        title: 'Smart Price Tag Specimen',
        amount_usd: 0.01,
        redirect_url: null
      };
    }

    // Fetch merchant wallet config to decide which rails to show
    const merchant = await db.get('SELECT ln_address, usdc_address FROM merchants WHERE api_key = ?', link.api_key);
    const hasLn = !!(merchant?.ln_address);
    const hasUsdc = !!(merchant?.usdc_address);
    // Default mode: prefer LN if available, else USDC
    const defaultMode = hasLn ? 'L402' : 'X402';

    const btcRate = getBtcUsdRate() || 65000;
    const calculatedSats = Math.max(1, Math.ceil((link.amount_usd / btcRate) * 100000000));

    // ── CLI / CURL Terminal Output Handler ──
    const userAgent = (req.headers['user-agent'] || '').toLowerCase();
    const isCli = userAgent.includes('curl') || userAgent.includes('wget') || req.path.startsWith('/cli');
    if (isCli) {
      const preimageOrHash = (req.query.preimage || req.query.payment_hash || '') as string;
      if (preimageOrHash) {
        const verify = await db.get(
          'SELECT status, preimage FROM invoices WHERE tag_id = ? AND (payment_hash = ? OR preimage = ?)',
          link.id,
          preimageOrHash,
          preimageOrHash
        );
        if (verify && verify.status === 'settled') {
          return res.send(`\n\x1b[32m[AIPP PROTOCOL] PAYMENT VERIFIED & UNLOCKED\x1b[0m\nTarget URL / Payload: ${link.redirect_url}\nPreimage: ${verify.preimage}\n\n`);
        }
      }

      let invoiceRes = '';
      try {
        await checkLimit(link.api_key, link.amount_usd);
        const invData = await generateInvoiceData({
          apiKey: link.api_key,
          protocol: defaultMode as any,
          amountUsd: link.amount_usd,
          memo: `AIPP CLI: ${link.title.substring(0, 20)}`,
          idempotencyKey: 'cli_' + link.id
        });
        invoiceRes = invData.payment_request || '';
      } catch (err: any) {
        return res.status(402).send(`\n\x1b[31m[AIPP ERROR] ${err.message}\x1b[0m\n\n`);
      }

      const cliOutput = `
\x1b[33m======================================================================\x1b[0m
\x1b[1m⚡ AIPP PROTOCOL — CLI SMART PRICE TAG\x1b[0m
\x1b[33m======================================================================\x1b[0m
Asset:   ${link.title}
Price:   $${link.amount_usd.toFixed(2)} USD (≈ ${calculatedSats} Sats)
Tag ID:  ${link.id}
Status:  \x1b[31mHTTP 402 PAYMENT REQUIRED\x1b[0m

\x1b[1m[ Lightning Invoice ]\x1b[0m
${invoiceRes || 'Visit https://aipp.dev/pay/' + link.id}

Scan with Phoenix / Wallet of Satoshi, or pay via CLI.
Once paid, run:
  \x1b[36mcurl -s "https://aipp.dev/cli/${link.id}?payment_hash=<PAYMENT_HASH>"\x1b[0m
\x1b[33m======================================================================\x1b[0m
\n`;
      return res.status(402).send(cliOutput);
    }

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${link.title} — $${link.amount_usd.toFixed(2)} USD</title>
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.4.4/build/qrcode.min.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

    :root {
      --bg: #faf8f5;
      --sub-bg: #f3efea;
      --card-bg: #ffffff;
      --fg: #1a1918;
      --fg-muted: #6b6964;
      --fg-subtle: #999690;
      --border: #e6e2dc;
      --border-subtle: #eeeae4;
      --accent: #c2613c;
      --accent-hover: #b05330;
      --green: #15803d;
      --green-bg: #ecfdf5;
      --radius-sm: 8px;
      --radius-md: 14px;
      --shadow-card: 0 4px 20px rgba(26,25,24,0.06), 0 16px 40px rgba(26,25,24,0.06);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background-color: var(--bg);
      color: var(--fg);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
      -webkit-font-smoothing: antialiased;
    }

    .checkout-wrapper {
      width: 100%;
      max-width: 440px;
    }

    .brand-header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 24px;
      font-weight: 700;
      font-size: 15px;
      color: var(--fg);
    }
    .brand-icon {
      width: 20px;
      height: 20px;
      background: var(--fg);
      border-radius: 5px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--bg);
    }

    .specimen-checkout-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 36px 32px;
      box-shadow: var(--shadow-card);
      text-align: center;
      position: relative;
    }

    .security-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--green-bg);
      color: var(--green);
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 20px;
      letter-spacing: 0.02em;
      margin-bottom: 20px;
    }

    h1 {
      font-family: 'Instrument Serif', Georgia, serif;
      font-size: 26px;
      font-weight: 400;
      line-height: 1.25;
      margin-bottom: 12px;
      color: var(--fg);
      word-break: break-word;
    }

    .price-display {
      margin-bottom: 28px;
    }
    .price-primary {
      font-size: 38px;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--fg);
      line-height: 1;
    }
    .price-primary span {
      font-size: 18px;
      font-weight: 500;
      color: var(--fg-muted);
    }
    .price-secondary {
      font-size: 14px;
      font-weight: 600;
      color: var(--accent);
      margin-top: 6px;
    }

    .rail-toggle {
      display: flex;
      background: var(--sub-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 3px;
      margin-bottom: 20px;
    }
    .rail-btn {
      flex: 1;
      padding: 10px;
      background: transparent;
      border: none;
      font-size: 12px;
      font-weight: 600;
      color: var(--fg-muted);
      cursor: pointer;
      border-radius: 8px;
      transition: all 0.15s ease;
    }
    .rail-btn.active {
      background: #ffffff;
      color: var(--fg);
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }

    .btn-checkout {
      width: 100%;
      background: var(--fg);
      color: #ffffff;
      border: 1px solid var(--fg);
      padding: 14px;
      font-size: 14px;
      font-weight: 600;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .btn-checkout:hover {
      background: #33312e;
      transform: translateY(-1px);
    }

    .trust-meta {
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      gap: 8px;
      text-align: left;
      font-size: 12px;
      color: var(--fg-muted);
    }
    .trust-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .trust-item svg { color: var(--green); flex-shrink: 0; }

    /* QR / Dynamic Invoice State */
    .invoice-view {
      display: none;
      margin-top: 20px;
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

    .qr-frame {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
      display: inline-block;
      margin-bottom: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }
    .qr-frame canvas { display: block; }

    .instructions-text {
      font-size: 12px;
      font-weight: 600;
      color: var(--fg-muted);
      margin-bottom: 16px;
      line-height: 1.5;
      word-break: break-all;
    }

    .polling-indicator {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      color: var(--fg);
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

    @media (max-width: 480px) {
      body {
        padding: 16px 12px;
      }
      .checkout-wrapper {
        max-width: 100%;
      }
      .specimen-checkout-card {
        padding: 24px 18px;
        border-radius: 16px;
      }
      h1 {
        font-size: 22px;
      }
      .price-primary {
        font-size: 32px;
      }
      .qr-frame {
        padding: 10px;
      }
      .qr-frame canvas {
        max-width: 200px !important;
        max-height: 200px !important;
        width: 100% !important;
        height: auto !important;
      }
      .btn-checkout {
        padding: 12px;
        font-size: 13.5px;
      }
    }

    footer {
      margin-top: 28px;
      text-align: center;
      font-size: 12px;
      color: var(--fg-subtle);
    }
    footer a { text-decoration: underline; color: var(--fg-muted); }
  </style>
</head>
<body>

<div class="checkout-wrapper">
  <div class="brand-header">
    <div class="brand-icon">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path></svg>
    </div>
    <span>aipp</span>
  </div>

  <div class="specimen-checkout-card">
    <div class="security-badge">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
      Non-Custodial Checkout
    </div>

    <h1>${link.title}</h1>

    <div class="price-display">
      <div class="price-primary">$${link.amount_usd.toFixed(2)} <span>USD</span></div>
      <div class="price-secondary" id="price-sub-display">≈ ${calculatedSats} Sats</div>
    </div>

    <div id="selection-view">
      ${(hasLn && hasUsdc) ? `
      <div class="rail-toggle">
        <button class="rail-btn active" id="btn-ln" onclick="setMode('L402')">⚡ Lightning (Sats)</button>
        <button class="rail-btn" id="btn-usdc" onclick="setMode('X402')">🔵 Base USDC</button>
      </div>` : hasUsdc ? `
      <div style="background:var(--sub-bg); border:1px solid var(--border); border-radius:10px; padding:10px 14px; margin-bottom:16px; font-size:12px; font-weight:600; color:#3b82f6; text-align:center;">🔵 Base Network (USDC)</div>` : `
      <div style="background:var(--sub-bg); border:1px solid var(--border); border-radius:10px; padding:10px 14px; margin-bottom:16px; font-size:12px; font-weight:600; color:var(--fg-muted); text-align:center;">⚡ Bitcoin Lightning (Sats)</div>`}

      <button class="btn-checkout" id="pay-action-btn" onclick="generateInvoice()">
        <span>Pay with Lightning (${calculatedSats} Sats) →</span>
      </button>

      <div class="trust-meta">
        <div class="trust-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          Automatic payout to the merchant's configured wallet
        </div>
        <div class="trust-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          Instant fulfillment upon single-confirmation receipt
        </div>
      </div>
    </div>

    <!-- Active Invoice Box -->
    <div class="invoice-view" id="invoice-view">
      <div class="qr-frame">
        <canvas id="qr-canvas"></canvas>
      </div>
      <div class="instructions-text" id="payment-instructions">Generating payment challenge...</div>
      <div class="polling-indicator">
        <span class="dot-pulse" id="status-dot"></span>
        <span id="status-text">Waiting for network payment...</span>
      </div>
      <div style="margin-top:16px;">
        <button onclick="resetSelectionView()" style="background:transparent; border:none; color:var(--fg-muted); font-size:12px; font-weight:600; text-decoration:underline; cursor:pointer;">
          ← Choose Different Payment Rail
        </button>
      </div>
    </div>
  </div>

  <footer>
    Powered by <a href="https://aipp.dev" target="_blank">aipp</a> · Decentralized Non-Custodial Software
  </footer>
</div>

<script>
  let mode = '${defaultMode}';
  let pollInterval = null;
  let sseSource = null;
  let isSettled = false;
  const CURRENT_LINK_ID = ${JSON.stringify(link.id)};
  const REDIRECT_URL = ${JSON.stringify(link.redirect_url)};
  const HAS_LN = ${JSON.stringify(hasLn)};
  const HAS_USDC = ${JSON.stringify(hasUsdc)};

  function setMode(newMode) {
    mode = newMode;
    const btnLn = document.getElementById('btn-ln');
    const btnUsdc = document.getElementById('btn-usdc');
    const priceSub = document.getElementById('price-sub-display');
    const payBtn = document.getElementById('pay-action-btn');

    if (btnLn) btnLn.classList.toggle('active', mode === 'L402');
    if (btnUsdc) btnUsdc.classList.toggle('active', mode === 'X402');

    if (mode === 'X402') {
      if (priceSub) priceSub.innerHTML = '⚡ Direct Settlement in Base USDC';
      if (payBtn) payBtn.innerHTML = '<span>Pay with Base USDC ($${link.amount_usd.toFixed(2)}) →</span>';
    } else {
      if (priceSub) priceSub.innerHTML = '≈ ${calculatedSats} Sats';
      if (payBtn) payBtn.innerHTML = '<span>Pay with Lightning (${calculatedSats} Sats) →</span>';
    }
  }

  function resetSelectionView() {
    if (pollInterval) clearInterval(pollInterval);
    if (sseSource) { sseSource.close(); sseSource = null; }
    isSettled = false;
    document.getElementById('invoice-view').style.display = 'none';
    document.getElementById('selection-view').style.display = 'block';
    const btn = document.getElementById('pay-action-btn');
    btn.disabled = false;
    setMode(mode);
  }

  async function generateInvoice() {
    const btn = document.getElementById('pay-action-btn');
    btn.disabled = true;
    btn.textContent = 'Generating...';

    try {
      let checkoutId = sessionStorage.getItem('aipp_checkout_' + CURRENT_LINK_ID);
      if (!checkoutId) {
        checkoutId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now() + '_' + Math.random();
        sessionStorage.setItem('aipp_checkout_' + CURRENT_LINK_ID, checkoutId);
      }
      const res = await fetch('/pay/' + CURRENT_LINK_ID + '/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: mode, checkout_id: checkoutId })
      });
      if (!res.ok) throw new Error('Invoice generation failed');
      const data = await res.json();

      document.getElementById('selection-view').style.display = 'none';
      document.getElementById('invoice-view').style.display = 'block';

      const instructionsEl = document.getElementById('payment-instructions');
      
      if (mode === 'L402') {
        const satsAmount = data.amount_sats || ${calculatedSats};
        const merchantSats = data.merchant_amount_sats || Math.max(1, satsAmount - (data.commission_sats || 0));
        const feeSats = data.commission_sats || 0;
        instructionsEl.innerHTML = '<div style="font-size:12px; color:var(--fg-muted); margin-bottom:12px;"><div style="display:flex;justify-content:space-between"><span>Merchant price</span><b>' + merchantSats + ' sats</b></div><div style="display:flex;justify-content:space-between"><span>AIPP fee</span><b>' + feeSats + ' sats</b></div><div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);margin-top:6px;padding-top:6px;font-size:14px;color:var(--fg)"><span>Total</span><b>' + satsAmount + ' sats</b></div></div><div style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px;"><a href="lightning:' + data.payment_request + '" style="display:flex; align-items:center; justify-content:center; gap:8px; width:100%; background:var(--fg); color:#ffffff; padding:12px; border-radius:10px; font-weight:700; font-size:13.5px; text-decoration:none; box-shadow:0 2px 8px rgba(0,0,0,0.08);"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>Open in Lightning Wallet</a><button id="copy-inv-btn" style="display:flex; align-items:center; justify-content:center; gap:8px; width:100%; background:var(--sub-bg); color:var(--fg); border:1px solid var(--border); padding:10px; border-radius:10px; font-weight:600; font-size:12.5px; cursor:pointer;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>Copy Invoice</button></div><div style="font-size:11px; color:var(--fg-muted); margin-bottom:4px;">Or scan with your Lightning wallet:</div>';
        
        const copyBtn = document.getElementById('copy-inv-btn');
        if (copyBtn) {
          copyBtn.onclick = () => {
            navigator.clipboard.writeText(data.payment_request);
            copyBtn.innerHTML = '<span style="color:var(--green); font-weight:700;">✓ Invoice Copied!</span>';
            setTimeout(() => {
              copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy Invoice String';
            }, 2000);
          };
        }
        const cleanInvoice = data.payment_request.toLowerCase();
        const qrUri = cleanInvoice.startsWith('lightning:') ? cleanInvoice : 'lightning:' + cleanInvoice;
        QRCode.toCanvas(document.getElementById('qr-canvas'), qrUri, { 
          width: 240, 
          margin: 3, 
          color: { dark: '#000000', light: '#ffffff' } 
        });
      } else {
        const payToAddr = data.pay_to;
        instructionsEl.innerHTML = '<div style="font-size:13px; font-weight:700; margin-bottom:8px;">Send exactly <b>$' + data.amount_usd.toFixed(2) + ' USDC</b> on <b>Base</b>:</div><div style="background:#f4f4f5; padding:8px 10px; border-radius:8px; font-family:monospace; font-size:11px; word-break:break-all; border:1px solid #e4e4e7; margin-bottom:10px; cursor:pointer;" id="copy-addr-box">' + payToAddr + '<div style="font-size:10px; color:#71717a; margin-top:2px;">(Click to copy address)</div></div><button id="web3-pay-btn" style="width:100%; background:#2563eb; color:#fff; border:none; padding:12px; border-radius:10px; font-weight:700; font-size:13.5px; cursor:pointer; margin-bottom:10px; display:flex; align-items:center; justify-content:center; gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M6 12h12"/></svg>Pay with Web3 Wallet (1-Click)</button>';
        
        const copyBox = document.getElementById('copy-addr-box');
        if (copyBox) {
          copyBox.onclick = () => {
            navigator.clipboard.writeText(payToAddr);
            alert('Base Address Copied to Clipboard!');
          };
        }

        const usdcUri = 'ethereum:' + data.token + '@8453/transfer?address=' + payToAddr + '&uint256=' + Math.round(data.amount_usd * 1000000);
        QRCode.toCanvas(document.getElementById('qr-canvas'), usdcUri, { 
          width: 240, 
          margin: 3, 
          color: { dark: '#000000', light: '#ffffff' } 
        });

        const web3Btn = document.getElementById('web3-pay-btn');
        if (web3Btn) {
          web3Btn.onclick = async () => {
            if (typeof window.ethereum === 'undefined') {
              alert('MetaMask or Web3 wallet not detected. Please copy the address and send USDC manually.');
              return;
            }
            try {
              web3Btn.textContent = 'Connecting...';
              const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
              try {
                await window.ethereum.request({
                  method: 'wallet_switchEthereumChain',
                  params: [{ chainId: '0x2105' }]
                });
              } catch (switchErr) {}

              const toAddressClean = payToAddr.replace('0x', '').toLowerCase().padStart(64, '0');
              const amountHex = (Math.round(data.amount_usd * 1000000)).toString(16).padStart(64, '0');
              const dataHex = '0xa9059cbb' + toAddressClean + amountHex;

              web3Btn.textContent = 'Confirming in Wallet...';
              const txHash = await window.ethereum.request({
                method: 'eth_sendTransaction',
                params: [{
                  from: accounts[0],
                  to: data.token,
                  data: dataHex
                }]
              });
              window.lastTxHash = txHash;
              web3Btn.textContent = 'Payment Sent! Verifying on Base...';
              
              // Trigger immediate verification check
              setTimeout(() => {
                fetch('/invoice/status/' + data.payment_hash + '?tx_hash=' + txHash);
              }, 1000);
            } catch (err) {
              web3Btn.textContent = 'Pay with MetaMask (1-Click)';
              alert('Transaction cancelled or failed: ' + (err.message || err));
            }
          };
        }
      }

      // Start Real-Time SSE Stream + Fallback Watcher
      watchStatus(data.payment_hash);

    } catch (e) {
      alert('Error generating invoice. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Pay & Unlock Instantly';
    }
  }

  function handlePaymentSettled(d, hash) {
    if (isSettled) return;
    isSettled = true;
    if (pollInterval) clearInterval(pollInterval);
    if (sseSource) { sseSource.close(); sseSource = null; }
    sessionStorage.removeItem('aipp_checkout_' + CURRENT_LINK_ID);

    try {
      window.parent.postMessage({ aippSettled: true, tagId: CURRENT_LINK_ID, hash: hash, preimage: d.preimage }, '*');
    } catch(err) {}
    document.getElementById('status-dot').style.background = '#15803d';
    document.getElementById('status-text').textContent = '⚡ Payment Confirmed (0 ms)!';
    if (REDIRECT_URL && REDIRECT_URL.startsWith('http')) {
      document.getElementById('payment-instructions').textContent = 'Redirecting to your content...';
      setTimeout(() => {
        let target = REDIRECT_URL;
        target += (target.includes('?') ? '&' : '?') + 'payment_hash=' + encodeURIComponent(hash);
        window.location.href = target;
      }, 1000);
    } else {
      document.getElementById('payment-instructions').innerHTML = '<div style="color:#15803d; font-weight:700; font-size:14px; margin-top:8px;">✓ Thank you! Payment confirmed; merchant payout is processing automatically.</div>';
    }
  }

  function watchStatus(hash) {
    if (pollInterval) clearInterval(pollInterval);
    if (sseSource) { sseSource.close(); sseSource = null; }
    isSettled = false;

    // 1. Real-time SSE Stream (Instant 0 ms settlement event)
    if (typeof EventSource !== 'undefined') {
      try {
        sseSource = new EventSource('/invoice/stream/' + hash);
        sseSource.onmessage = function(e) {
          try {
            const data = JSON.parse(e.data);
            if (data.paid) {
              handlePaymentSettled(data, hash);
            }
          } catch(err) {}
        };
        sseSource.onerror = function() {
          // SSE reconnects automatically or fallback polling handles it
        };
      } catch(err) {}
    }

    // 2. Resilient Fallback Polling
    pollInterval = setInterval(async () => {
      if (isSettled) {
        clearInterval(pollInterval);
        return;
      }
      try {
        const query = window.lastTxHash ? '?tx_hash=' + window.lastTxHash : '';
        const r = await fetch('/invoice/status/' + hash + query);
        if (!r.ok) return;
        const d = await r.json();
        if (d.paid) {
          handlePaymentSettled(d, hash);
        }
      } catch (e) {}
    }, 2500);
  }
</script>
</body>
</html>
`;
    res.send(html);
  } catch (error) {
    next(error);
  }
};

// 4. Create invoice specifically bound to the Payment Link
export const createLinkInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { linkId } = req.params;
    const { mode, checkout_id } = req.body; // 'L402' or 'X402'
    const protocol = mode === 'X402' ? 'x402' : 'L402';

    const db = getDb();
    let link = await db.get('SELECT * FROM payment_links WHERE id = ?', linkId);
    if (!link && IS_PRODUCTION) {
      throw new AppError('Smart Tag not found', 404, 'NOT_FOUND');
    }
    if (!link) {
      link = {
        id: linkId,
        api_key: 'aipp_devtest',
        title: 'Smart Price Tag Specimen',
        amount_usd: 0.01,
        redirect_url: 'https://aipp.dev/paywall-demo.html'
      };
    }

    let merchant = await db.get('SELECT * FROM merchants WHERE api_key = ?', link.api_key);
    if (!merchant && IS_PRODUCTION) {
      throw new AppError('Merchant not found', 404, 'MERCHANT_NOT_FOUND');
    }
    if (!merchant) {
      merchant = { api_key: 'aipp_devtest', ln_address: 'longingsavior14@walletofsatoshi.com' };
    }

    await checkLimit(link.api_key, link.amount_usd);

    let invoiceData;
    try {
      invoiceData = await generateInvoiceData({
        apiKey: link.api_key,
        protocol: mode === 'X402' ? 'X402' : 'L402',
        amountUsd: link.amount_usd,
        tagId: link.id,
        idempotencyKey: typeof checkout_id === 'string' && /^[a-zA-Z0-9._-]{8,128}$/.test(checkout_id)
          ? `link_${link.id}_${checkout_id}`
          : undefined,
        idempotencyFingerprint: typeof checkout_id === 'string'
          ? crypto.createHash('sha256').update(`${link.id}:${link.amount_usd}:${mode}`).digest('hex')
          : undefined
      });
    } catch (err: any) {
      if (err instanceof InvoiceDomainError) {
        let statusCode = 400;
        if (err.code === 'UNAUTHORIZED') statusCode = 401;
        if (err.code === 'SINGLE_LIMIT_EXCEEDED') statusCode = 429;
        if (err.code === 'LNBITS_ERROR' || err.code === 'DB_ERROR') statusCode = 502;
        throw new AppError(err.message, statusCode, err.code);
      }
      throw err;
    }

    if (invoiceData.challengeBase64) {
      res.setHeader('PAYMENT-REQUIRED', invoiceData.challengeBase64);
      delete invoiceData.challengeBase64;
    }

    res.json(invoiceData);

  } catch (error) {
    next(error);
  }
};

// 5. Delete a Payment Link
export const deletePaymentLink = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = getAippKey(req);
    if (!apiKey) {
      throw new AppError('Missing API key in headers', 401, 'UNAUTHORIZED');
    }

    const { linkId } = req.params;
    const db = getDb();
    
    const link = await db.get('SELECT * FROM payment_links WHERE id = ? AND api_key = ?', linkId, apiKey);
    if (!link) {
      throw new AppError('Payment link not found or unauthorized', 404, 'NOT_FOUND');
    }

    await db.run('DELETE FROM payment_links WHERE id = ?', linkId);
    res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
};
