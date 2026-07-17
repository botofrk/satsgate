import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDb } from '../config/database';
import { AppError } from '../utils/error';
import { getBtcUsdRate } from '../services/price';
import { BASE_NETWORK_NAME, USDC_ADDRESS } from '../config/env';
import { getGatewayAddress } from '../services/base';

// API Key helper
function getAippKey(req: Request): string | null {
  return (req.headers['x-api-key'] as string) || null;
}

// 1. Create a new Payment Link
export const createPaymentLink = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = getAippKey(req);
    if (!apiKey) {
      throw new AppError('Missing API key in headers', 401, 'UNAUTHORIZED');
    }

    const db = getDb();
    const merchant = await db.get('SELECT api_key FROM merchants WHERE api_key = ?', apiKey);
    if (!merchant) {
      throw new AppError('Invalid API key', 401, 'UNAUTHORIZED');
    }

    const { title, amount_usd, redirect_url } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      throw new AppError('Title is required', 400, 'BAD_REQUEST');
    }
    const numAmount = Number(amount_usd);
    if (isNaN(numAmount) || numAmount < 0.01 || numAmount > 100.0) {
      throw new AppError('Amount must be between 0.01 and 100.00 USD', 400, 'BAD_REQUEST');
    }
    if (!redirect_url || typeof redirect_url !== 'string' || !redirect_url.startsWith('http')) {
      throw new AppError('A valid redirect URL starting with http/https is required', 400, 'BAD_REQUEST');
    }

    const linkId = 'p_' + crypto.randomBytes(6).toString('hex');
    await db.run(
      'INSERT INTO payment_links (id, api_key, title, amount_usd, redirect_url, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      linkId,
      apiKey,
      title.trim(),
      numAmount,
      redirect_url.trim(),
      new Date().toISOString()
    );

    res.json({
      id: linkId,
      url: `${req.protocol}://${req.get('host')}/pay/${linkId}`,
      title: title.trim(),
      amount_usd: numAmount,
      redirect_url: redirect_url.trim()
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
      url: `${host}/pay/${l.id}`
    }));

    res.json(formatted);
  } catch (error) {
    next(error);
  }
};

// 3. Render Custom Paywall HTML Page
export const renderPaymentPage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { linkId } = req.params;
    const db = getDb();
    const link = await db.get('SELECT * FROM payment_links WHERE id = ?', linkId);
    
    if (!link) {
      return res.status(404).send('<h1>404 - Payment Link Not Found</h1>');
    }

    // Build the responsive, aesthetic neo-brutalist HTML page
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pay \${link.amount_usd.toFixed(2)} USD for \${link.title} — aipp</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #ffcc00;
      color: #000000;
      font-family: 'Inter', sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
    }
    .pay-card {
      background: #ffffff;
      border: 3px solid #000000;
      border-radius: 12px;
      padding: 32px;
      width: 100%;
      max-width: 440px;
      box-shadow: 8px 8px 0 #000000;
      text-align: center;
    }
    .badge {
      display: inline-block;
      background: #000;
      color: #fff;
      font-size: 11px;
      font-weight: 800;
      padding: 4px 12px;
      border-radius: 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 20px;
    }
    h2 { font-size: 20px; font-weight: 800; margin-bottom: 8px; word-break: break-word; }
    .price-tag { font-size: 40px; font-weight: 900; margin-bottom: 24px; }
    .price-tag span { font-size: 20px; font-weight: 700; color: #52525b; }
    
    .selector {
      display: flex;
      border: 2px solid #000;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 24px;
      box-shadow: 3px 3px 0 #000;
    }
    .selector-btn {
      flex: 1;
      padding: 12px;
      background: #fff;
      border: none;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
      transition: all 0.15s;
    }
    .selector-btn.active {
      background: #ffcc00;
    }
    .selector-btn:not(:last-child) {
      border-right: 2px solid #000;
    }

    .btn-pay {
      width: 100%;
      background: #000;
      color: #ffcc00;
      border: 2px solid #000;
      padding: 14px;
      font-size: 15px;
      font-weight: 800;
      border-radius: 8px;
      cursor: pointer;
      box-shadow: 4px 4px 0 #000;
      transition: all 0.2s;
    }
    .btn-pay:hover {
      transform: translate(-2px, -2px);
      box-shadow: 6px 6px 0 #000;
    }
    .btn-pay:active {
      transform: translate(0, 0);
      box-shadow: 2px 2px 0 #000;
    }

    .status-area { display: none; margin-top: 16px; }
    .qr-container {
      border: 2px solid #000;
      border-radius: 8px;
      padding: 16px;
      display: inline-block;
      background: #fff;
      margin-bottom: 16px;
      box-shadow: 4px 4px 0 #000;
    }
    .instructions {
      font-size: 12px;
      color: #52525b;
      margin-bottom: 16px;
      font-weight: 600;
      line-break: anywhere;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 700;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; animation: pulse 1.5s infinite; }
    .dot.paid { background: #22c55e; }
    @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
    
    footer {
      margin-top: 24px;
      font-size: 11px;
      color: #71717a;
      font-weight: 600;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.4.4/build/qrcode.min.js"></script>
</head>
<body>

<div class="pay-card">
  <span class="badge" style="background:#22c55e;color:#fff;display:inline-flex;align-items:center;gap:4px;">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
    Secure Checkout
  </span>
  <h2 style="margin-top:12px;">${link.title}</h2>
  <div class="price-tag">$${link.amount_usd.toFixed(2)} <span>USD</span></div>

  <div id="payment-selection">
    <div class="selector">
      <button class="selector-btn active" id="btn-ln" onclick="setMode('L402')">Lightning (Sats)</button>
      <button class="selector-btn" id="btn-usdc" onclick="setMode('X402')">Base USDC</button>
    </div>
    <button class="btn-pay" id="pay-action-btn" onclick="generateInvoice()">Pay Now</button>
    
    <!-- Trust features badges -->
    <div style="margin-top:20px;display:flex;flex-direction:column;gap:8px;text-align:left;background:#f8fafc;padding:12px;border:2px solid #000;border-radius:8px;">
      <div style="font-size:11px;font-weight:700;display:flex;align-items:center;gap:6px;">
        <span style="color:#22c55e;">✔</span> 100% Non-Custodial (Wallet-to-Wallet)
      </div>
      <div style="font-size:11px;font-weight:700;display:flex;align-items:center;gap:6px;">
        <span style="color:#22c55e;">✔</span> Direct instant payout to merchant
      </div>
      <div style="font-size:11px;font-weight:700;display:flex;align-items:center;gap:6px;">
        <span style="color:#22c55e;">✔</span> No account setup required for buyer
      </div>
    </div>
  </div>

  <div class="status-area" id="status-area">
    <div class="qr-container">
      <canvas id="qr-canvas" style="display:block;"></canvas>
    </div>
    <div class="instructions" id="payment-instructions">Generating payment request...</div>
    <div class="status-badge">
      <span class="dot" id="status-dot"></span>
      <span id="status-text">Waiting for payment...</span>
    </div>
  </div>

  <footer style="margin-top:24px;font-size:11px;color:#71717a;font-weight:600;display:flex;align-items:center;justify-content:center;gap:4px;">
    <span>🔒 Powered by</span>
    <a href="https://aipp.dev" target="_blank" style="color:#000;text-decoration:underline;font-weight:700;">aipp.dev</a>
  </footer>
</div>

<!-- Extra trust & benefits section below the main card -->
<div style="width: 100%; max-width: 440px; margin-top: 24px; display: grid; grid-template-columns: 1fr; gap: 16px;">
  <div style="background: #ffffff; border: 2px solid #000000; border-radius: 8px; padding: 16px; box-shadow: 4px 4px 0 #000000; display: flex; gap: 12px; align-items: flex-start; text-align: left;">
    <div style="font-size: 20px; line-height: 1;">⚡</div>
    <div>
      <h4 style="font-size: 13px; font-weight: 800; margin-bottom: 4px;">Lightning Micropayments</h4>
      <p style="font-size: 11px; color: #52525b; font-weight: 500; line-height: 1.4;">Pay instantly down to a fraction of a cent. Zero credit card fees, zero border limits.</p>
    </div>
  </div>
  
  <div style="background: #ffffff; border: 2px solid #000000; border-radius: 8px; padding: 16px; box-shadow: 4px 4px 0 #000000; display: flex; gap: 12px; align-items: flex-start; text-align: left;">
    <div style="font-size: 20px; line-height: 1;">🤖</div>
    <div>
      <h4 style="font-size: 13px; font-weight: 800; margin-bottom: 4px;">Built for Humans &amp; AI</h4>
      <p style="font-size: 11px; color: #52525b; font-weight: 500; line-height: 1.4;">Fully compatible with L402 and x402 machine-to-machine payment standards for autonomous AI agents.</p>
    </div>
  </div>
</div>

<script>
  let mode = 'L402';
  let pollInterval = null;
  const linkId = '${link.id}';

  function setMode(newMode) {
    mode = newMode;
    document.getElementById('btn-ln').classList.toggle('active', mode === 'L402');
    document.getElementById('btn-usdc').classList.toggle('active', mode === 'X402');
  }

  async function generateInvoice() {
    const btn = document.getElementById('pay-action-btn');
    btn.disabled = true;
    btn.textContent = 'Generating...';

    try {
      const res = await fetch(\`/pay/\${linkId}/invoice\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      if (!res.ok) throw new Error('Invoice creation failed');
      const data = await res.json();

      document.getElementById('payment-selection').style.display = 'none';
      document.getElementById('status-area').style.display = 'block';

      const instructionsEl = document.getElementById('payment-instructions');
      
      if (mode === 'L402') {
        instructionsEl.textContent = 'Scan or copy this Lightning Invoice to pay:';
        instructionsEl.style.cursor = 'pointer';
        instructionsEl.title = 'Click to copy invoice';
        instructionsEl.onclick = () => {
          navigator.clipboard.writeText(data.payment_request);
          const oldText = instructionsEl.textContent;
          instructionsEl.textContent = 'Copied to clipboard!';
          setTimeout(() => instructionsEl.textContent = oldText, 1500);
        };
        QRCode.toCanvas(document.getElementById('qr-canvas'), data.payment_request, { width: 220, margin: 1 });
      } else {
        instructionsEl.innerHTML = \`Send exactly <b>\${data.amount_usd.toFixed(2)} USDC</b> on Base network to:<br><code style="background:#f4f4f5;padding:2px 4px;border-radius:4px;font-family:monospace;font-size:10px;margin-top:6px;display:inline-block;">\${data.pay_to}</code>\`;
        // Create USDC scheme URI for Web3 wallets
        const usdcUri = \`ethereum:\${data.token}@8453/transfer?address=\${data.pay_to}&uint256=\${Math.round(data.amount_usd * 1000000)}\`;
        QRCode.toCanvas(document.getElementById('qr-canvas'), usdcUri, { width: 220, margin: 1 });
      }

      // Start Polling
      pollStatus(data.payment_hash);

    } catch (e) {
      alert('Error generating invoice. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Pay Now';
    }
  }

  function pollStatus(hash) {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
      try {
        const r = await fetch(\`/invoice/status/\${hash}\`);
        if (!r.ok) return;
        const d = await r.json();
        if (d.paid) {
          clearInterval(pollInterval);
          document.getElementById('status-dot').className = 'dot paid';
          document.getElementById('status-text').textContent = 'Payment Success!';
          document.getElementById('payment-instructions').textContent = 'Redirecting to your content...';
          setTimeout(() => {
            window.location.href = '\${link.redirect_url}';
          }, 1500);
        }
      } catch (e) {}
    }, 2000);
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
    const { mode } = req.body; // 'L402' or 'X402'
    
    const db = getDb();
    const link = await db.get('SELECT * FROM payment_links WHERE id = ?', linkId);
    if (!link) {
      throw new AppError('Payment link not found', 404, 'NOT_FOUND');
    }

    const merchant = await db.get('SELECT * FROM merchants WHERE api_key = ?', link.api_key);
    if (!merchant) {
      throw new AppError('Merchant account no longer exists', 404, 'NOT_FOUND');
    }

    // Reuse existing createInvoice logic path by mocking the Request object!
    const mockReq = {
      headers: { 'x-api-key': link.api_key },
      body: {
        protocol: mode === 'X402' ? 'X402' : 'L402',
        amount_usd: link.amount_usd
      }
    } as any;

    // Direct proxy to createInvoice controller
    const { createInvoice } = require('./invoice');
    await createInvoice(mockReq, res, next);

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
    
    // Ensure the link belongs to this merchant before deleting
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

