import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { open, Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';

// Initialize configuration
dotenv.config();

const LNBITS_URL = process.env.LNBITS_URL || 'https://demo.lnbits.com';
const LNBITS_INVOICE_KEY = process.env.LNBITS_INVOICE_KEY || '';
const LNBITS_ADMIN_KEY = process.env.LNBITS_ADMIN_KEY || '';
const LNBITS_WEBHOOK_SECRET = process.env.LNBITS_WEBHOOK_SECRET || '';
const FEE_PER_REQUEST_SATS = parseInt(process.env.FEE_PER_REQUEST_SATS || '5');
const DAILY_LIMIT_USD = parseFloat(process.env.DAILY_LIMIT_USD || '100');
const MIN_TOPUP_SATS = parseInt(process.env.MIN_TOPUP_SATS || '100');
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Live BTC/USD rate cache (refreshed every 5 minutes)
let BTC_USD_RATE = 100000;
async function refreshBtcRate() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    if (res.ok) {
      const data = (await res.json()) as any;
      const newRate = data?.bitcoin?.usd;
      if (newRate && typeof newRate === 'number') {
        BTC_USD_RATE = newRate;
        console.log(`[BTC Rate] Updated: $${BTC_USD_RATE.toLocaleString()} USD/BTC`);
      }
    }
  } catch (e) {
    console.warn('[BTC Rate] Refresh failed, keeping last known rate:', BTC_USD_RATE);
  }
}

// Database instance
let db: Database<sqlite3.Database, sqlite3.Statement>;

const app = express();

// Trust Nginx reverse proxy — required for correct IP extraction behind proxy
app.set('trust proxy', 1);

// Middlewares
app.use(cors({
  origin: IS_PRODUCTION
    ? ['https://aipp.dev', 'https://www.aipp.dev']
    : true, // Allow all in development
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-AIPP-Key', 'X-Api-Key'],
}));
// Parse raw body for proxy forwarding to maintain exact payloads
app.use(express.raw({ type: '*/*', limit: '10mb' }));
// Serve static HTML frontend files from root workspace directory
app.use(express.static(path.join(__dirname, './')));

// Console logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Per-IP Rate Limiting (max 10 requests per minute)
const ipRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { error: 'Rate limit exceeded. Max 10 requests per minute.', code: 'RATE_LIMIT_EXCEEDED' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const ip = req.ip || '';
    return ip.includes('127.0.0.1') || ip === '::1' || ip === '::ffff:127.0.0.1';
  }
});
app.use(ipRateLimiter);

// Extract AIPP API Key helper
function getAippKey(req: Request): string | null {
  const headerKey = req.headers['x-aipp-key'];
  if (typeof headerKey === 'string' && headerKey) {
    return headerKey;
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (token.startsWith('aipp_')) {
      return token;
    }
  }

  return null;
}

// Get Client IP Address helper (resolving proxy headers)
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

// Limit Checker Function
async function checkLimit(apiKey: string, costUsd: number): Promise<void> {
  const todayUtc = new Date().toISOString().split('T')[0];
  let record = await db.get('SELECT * FROM daily_spend WHERE api_key = ? AND date = ?', apiKey, todayUtc);

  if (!record) {
    record = { api_key: apiKey, date: todayUtc, usd_amount: 0, requests_count: 0 };
    await db.run(
      'INSERT INTO daily_spend (api_key, date, usd_amount, requests_count) VALUES (?, ?, ?, ?)',
      apiKey, todayUtc, 0, 0
    );
  }

  if (record.usd_amount + costUsd > DAILY_LIMIT_USD) {
    throw {
      status: 429,
      error: `Daily limit reached ($${DAILY_LIMIT_USD}). Resets at midnight UTC.`,
      code: 'DAILY_LIMIT_EXCEEDED',
    };
  }
}

// Helper: Verify LNBits webhook HMAC signature
function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!LNBITS_WEBHOOK_SECRET) return true; // Skip verification if no secret configured
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', LNBITS_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// Helper: Verify if a Lightning Address exists (LNURL-pay resolution check)
async function verifyLightningAddress(lnAddress: string): Promise<boolean> {
  const cleanAddr = lnAddress.trim();
  if (cleanAddr === 'mehmet@phoenixwallet.me' || cleanAddr === 'devtest@aipp.dev' || cleanAddr.endsWith('@aipp.dev')) {
    return true; // Skip verification for local mock test addresses
  }
  try {
    const parts = cleanAddr.split('@');
    if (parts.length !== 2) return false;
    const username = parts[0];
    const domain = parts[1];
    const lnurlpUrl = `https://${domain}/.well-known/lnurlp/${username}`;
    const res = await fetch(lnurlpUrl);
    if (!res.ok) return false;
    const data = (await res.json()) as any;
    return !!data.callback;
  } catch (e) {
    return false;
  }
}

// Helper: Resolve and Pay Lightning Address (LNURL-pay forwarding)
async function payLightningAddress(lnAddress: string, amountSats: number, isDemo: boolean = false): Promise<string> {
  if (isDemo || lnAddress.endsWith('@aipp.dev')) {
    // Demo fallback for local offline testing
    console.log(`[Mock Payout] Successfully forwarded ${amountSats} sats to ${lnAddress}`);
    return 'mock_payout_hash_' + crypto.randomBytes(8).toString('hex');
  }

  const parts = lnAddress.split('@');
  if (parts.length !== 2) {
    throw new Error('Invalid Lightning Address format');
  }

  const username = parts[0];
  const domain = parts[1];
  const lnurlpUrl = `https://${domain}/.well-known/lnurlp/${username}`;

  // Step 1: Resolve LNURLp endpoint
  const lnurlpRes = await fetch(lnurlpUrl);
  if (!lnurlpRes.ok) {
    throw new Error(`Failed to resolve LNURLp for ${lnAddress}`);
  }
  const lnurlpData = (await lnurlpRes.json()) as any;
  const callbackUrl = lnurlpData.callback;
  if (!callbackUrl) {
    throw new Error('LNURLp callback URL not found in response');
  }

  // Step 2: Fetch BOLT11 payment request from callback
  const amountMsats = amountSats * 1000;
  const separator = callbackUrl.includes('?') ? '&' : '?';
  const callbackRes = await fetch(`${callbackUrl}${separator}amount=${amountMsats}`);
  if (!callbackRes.ok) {
    throw new Error(`LNURLp callback request failed: ${callbackRes.statusText}`);
  }
  const callbackData = (await callbackRes.json()) as any;
  const pr = callbackData.pr;
  if (!pr) {
    throw new Error('No BOLT11 payment request returned from callback');
  }

  // Step 3: Pay the invoice via LNBits
  if (LNBITS_ADMIN_KEY) {
    const payRes = await fetch(`${LNBITS_URL}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'X-Api-Key': LNBITS_ADMIN_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        out: true,
        bolt11: pr,
      }),
    });

    if (!payRes.ok) {
      const errText = await payRes.text();
      throw new Error(`LNBits payout failed: ${errText}`);
    }

    const payData = (await payRes.json()) as any;
    return payData.payment_hash || 'success';
  } else {
    // Demo fallback for local offline testing
    console.log(`[Mock Payout] Successfully forwarded ${amountSats} sats to ${lnAddress}`);
    return 'mock_payout_hash_' + crypto.randomBytes(8).toString('hex');
  }
}

// ── ENDPOINTS ─────────────────────────────────────────────────────────────

// Health Check — also verifies DB connectivity
app.get('/health', async (req: Request, res: Response) => {
  try {
    await db.get('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString(), db: 'ok', btc_usd_rate: BTC_USD_RATE });
  } catch (e) {
    res.status(503).json({ status: 'error', timestamp: new Date().toISOString(), db: 'down' });
  }
});

// 1. POST /merchant/register (Zero-friction merchant registration with LNURL resolution check)
app.post('/merchant/register', async (req: Request, res: Response) => {
  let body: any = {};
  try {
    if (req.body && req.body.length > 0) {
      body = JSON.parse(req.body.toString('utf8'));
    }
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' });
  }

  const ln_address = body.ln_address;
  if (typeof ln_address !== 'string' || !ln_address || !ln_address.includes('@')) {
    return res.status(400).json({ error: 'Valid Lightning Address is required', code: 'INVALID_LN_ADDRESS' });
  }

  // Verify Lightning Address active status on LNURL
  const isValid = await verifyLightningAddress(ln_address);
  if (!isValid) {
    return res.status(400).json({
      error: 'Lightning Address could not be resolved or is inactive. Check spelling.',
      code: 'LN_ADDRESS_RESOLUTION_FAILED'
    });
  }

  const payout_mode = body.payout_mode || 'instant';
  const payout_threshold_sats = body.payout_threshold_sats || 0;

  if (payout_mode !== 'instant' && payout_mode !== 'threshold') {
    return res.status(400).json({ error: 'payout_mode must be either "instant" or "threshold"', code: 'BAD_REQUEST' });
  }

  const apiKey = 'aipp_merch_' + crypto.randomBytes(8).toString('hex');
  
  try {
    await db.run(
      'INSERT INTO merchants (api_key, ln_address, payout_mode, payout_threshold_sats, created_at) VALUES (?, ?, ?, ?, ?)',
      apiKey,
      ln_address.trim(),
      payout_mode,
      payout_threshold_sats,
      new Date().toISOString()
    );
    res.json({
      api_key: apiKey,
      ln_address: ln_address.trim(),
      payout_mode,
      payout_threshold_sats
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to register merchant', code: 'SERVER_ERROR' });
  }
});

// 2. POST /invoice/create (Generate client invoice with min 100 / max 100k limits)
app.post('/invoice/create', async (req: Request, res: Response) => {
  const apiKey = getAippKey(req);
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing or invalid AIPP API key in headers', code: 'UNAUTHORIZED' });
  }

  const merchant = await db.get('SELECT * FROM merchants WHERE api_key = ?', apiKey);
  if (!merchant) {
    return res.status(401).json({ error: 'Invalid AIPP API key', code: 'UNAUTHORIZED' });
  }

  let body: any = {};
  try {
    if (req.body && req.body.length > 0) {
      body = JSON.parse(req.body.toString('utf8'));
    }
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' });
  }

  const amount_sats = body.amount_sats;
  if (typeof amount_sats !== 'number' || isNaN(amount_sats) || amount_sats < 100 || amount_sats > 100000) {
    return res.status(400).json({
      error: 'Transaction amount must be between 100 and 100,000 satoshis',
      code: 'INVALID_AMOUNT'
    });
  }

  // Enforce daily spend limit per merchant key
  try {
    const costUsd = (amount_sats / 100_000_000) * BTC_USD_RATE;
    await checkLimit(apiKey, costUsd);
  } catch (limitErr: any) {
    return res.status(limitErr.status || 429).json({ error: limitErr.error, code: limitErr.code });
  }

  const callback_url = body.callback_url || null;

  // Calculate 1% commission (minimum 1 satoshi)
  const commission = Math.max(1, Math.floor(amount_sats * 0.01));
  const forwarded = amount_sats - commission;

  try {
    let paymentHash = '';
    let paymentRequest = '';

    if (LNBITS_INVOICE_KEY) {
      const response = await fetch(`${LNBITS_URL}/api/v1/payments`, {
        method: 'POST',
        headers: {
          'X-Api-Key': LNBITS_INVOICE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          out: false,
          amount: amount_sats,
          memo: `AIPP Invoice (Merch: ${apiKey.slice(-6)})`,
        }),
      });

      if (!response.ok) {
        throw new Error(`LNBits returned status ${response.status}`);
      }

      const data = (await response.json()) as any;
      paymentHash = data.payment_hash;
      paymentRequest = data.payment_request;
    } else {
      paymentHash = 'demo_' + crypto.randomBytes(8).toString('hex');
      paymentRequest = `lnbc${amount_sats}n1demo_invoice_generated_by_aipp_backend_for_testing_purposes`;
    }

    // Insert pending invoice
    await db.run(
      'INSERT INTO invoices (payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, status, callback_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      paymentHash,
      apiKey,
      amount_sats,
      commission,
      forwarded,
      'pending',
      callback_url,
      new Date().toISOString()
    );

    res.json({ payment_request: paymentRequest, payment_hash: paymentHash });
  } catch (err: any) {
    console.error('Invoice creation failed:', err);
    res.status(500).json({ error: 'Failed to create invoice', code: 'SERVER_ERROR' });
  }
});

// Helper: Trigger webhook callback with exponential backoff retries (3 attempts over 3 minutes)
async function triggerWebhookWithRetry(callbackUrl: string, payload: any, attempt: number = 1) {
  try {
    const res = await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      throw new Error(`Receiver returned status ${res.status}`);
    }
    console.log(`[Webhook success] Fired callback to ${callbackUrl} (Attempt ${attempt})`);
  } catch (err: any) {
    console.error(`[Webhook error] Attempt ${attempt} failed for ${callbackUrl}:`, err.message);
    if (attempt < 3) {
      const delayMs = attempt * 60 * 1000; // 1 min, then 2 mins
      console.log(`[Webhook queue] Retrying callback to ${callbackUrl} in ${delayMs / 1000}s...`);
      setTimeout(() => {
        triggerWebhookWithRetry(callbackUrl, payload, attempt + 1);
      }, delayMs);
    } else {
      console.error(`[Webhook failed] Max attempts reached for callback: ${callbackUrl}`);
    }
  }
}

// 3. POST /lnbits-webhook (Payment confirmed, instant/accumulated split & payout routing)
app.post('/lnbits-webhook', async (req: Request, res: Response) => {
  // Verify HMAC signature from LNBits to prevent spoofed webhook calls
  const signature = req.headers['x-lnbits-webhook-secret'] as string | undefined
    || req.headers['x-webhook-signature'] as string | undefined;
  if (LNBITS_WEBHOOK_SECRET && !verifyWebhookSignature(req.body as Buffer, signature)) {
    console.warn('[Webhook] Invalid signature from:', req.ip);
    return res.status(401).json({ error: 'Invalid webhook signature', code: 'UNAUTHORIZED' });
  }

  let body: any = {};
  try {
    if (req.body && req.body.length > 0) {
      body = JSON.parse(req.body.toString('utf8'));
    }
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' });
  }

  const paymentHash = body.payment_hash || body.checking_id;
  if (!paymentHash) {
    return res.status(400).json({ error: 'Missing payment hash', code: 'BAD_REQUEST' });
  }

  try {
    const invoice = await db.get('SELECT * FROM invoices WHERE payment_hash = ?', paymentHash);
    if (!invoice) {
      return res.json({ status: 'ignored', reason: 'invoice_not_found' });
    }

    if (invoice.status === 'settled') {
      return res.json({ status: 'ok', reason: 'already_settled' });
    }

    const merchant = await db.get('SELECT * FROM merchants WHERE api_key = ?', invoice.api_key);
    if (!merchant) {
      return res.status(400).json({ error: 'Merchant not found', code: 'MERCHANT_NOT_FOUND' });
    }

    const isDemo = invoice.payment_hash.startsWith('demo_') ||
                   merchant.ln_address === 'mehmet@phoenixwallet.me' ||
                   merchant.ln_address === 'devtest@aipp.dev';

    // Verify invoice payment status with LNBits to prevent spoofed/fake webhook requests
    if (LNBITS_INVOICE_KEY && !isDemo) {
      const verifyRes = await fetch(`${LNBITS_URL}/api/v1/payments/${paymentHash}`, {
        headers: { 'X-Api-Key': LNBITS_INVOICE_KEY }
      });
      if (!verifyRes.ok) {
        return res.status(400).json({ error: 'Failed to verify payment status with LNBits', code: 'VERIFICATION_FAILED' });
      }
      const verifyData = (await verifyRes.json()) as any;
      if (!verifyData.paid) {
        return res.status(400).json({ error: 'Invoice remains unpaid on LNBits', code: 'UNPAID_INVOICE' });
      }
    }

    console.log(`⚡ Payment confirmed for ${invoice.amount_sats} sats. Splitting 1% commission...`);

    const payoutMode = merchant.payout_mode || 'instant';

    if (payoutMode === 'instant') {
      // Execute instant payout forwarding
      try {
        const payoutHash = await payLightningAddress(merchant.ln_address, invoice.forwarded_amount_sats, isDemo);
        
        await db.run(
          'UPDATE invoices SET status = ?, payout_status = ? WHERE payment_hash = ?',
          'settled',
          'forwarded',
          paymentHash
        );

        await db.run(
          'INSERT INTO ledgers (id, payment_hash, api_key, amount_sats, commission_sats, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
          crypto.randomUUID(),
          paymentHash,
          invoice.api_key,
          invoice.amount_sats,
          invoice.commission_sats,
          new Date().toISOString()
        );

        console.log(`✅ Payout forwarded successfully to ${merchant.ln_address}. Hash: ${payoutHash}`);
        
        if (invoice.callback_url) {
          triggerWebhookWithRetry(invoice.callback_url, {
            payment_hash: paymentHash,
            amount_sats: invoice.amount_sats,
            forwarded_amount_sats: invoice.forwarded_amount_sats,
            status: 'settled',
            payout_status: 'forwarded'
          });
        }

        res.json({ status: 'ok', payout_hash: payoutHash });
      } catch (payoutErr: any) {
        console.error(`❌ Payout forwarding failed for ${merchant.ln_address}:`, payoutErr.message);
        await db.run('UPDATE invoices SET status = ? WHERE payment_hash = ?', 'forward_failed', paymentHash);
        res.status(500).json({ error: 'Failed to forward payout', reason: payoutErr.message, code: 'FORWARD_FAILED' });
      }
    } else {
      // Payout threshold logic (Accumulated Payouts) — uses EXCLUSIVE transaction to prevent race conditions
      try {
        await db.run('BEGIN EXCLUSIVE');

        await db.run(
          'UPDATE invoices SET status = ?, payout_status = ? WHERE payment_hash = ?',
          'settled',
          'pending_threshold',
          paymentHash
        );

        // Fetch total accumulated pending threshold payouts (within the exclusive transaction)
        const accumRecord = await db.get(
          "SELECT SUM(forwarded_amount_sats) as total, SUM(commission_sats) as commission, SUM(amount_sats) as amount FROM invoices WHERE api_key = ? AND status = 'settled' AND payout_status = 'pending_threshold'",
          invoice.api_key
        );
        const accumTotalForwarded = accumRecord?.total || 0;
        const accumTotalAmount = accumRecord?.amount || 0;
        const accumTotalCommission = accumRecord?.commission || 0;

        console.log(`[Threshold Queue] Accumulated ${accumTotalForwarded} sats. Target threshold: ${merchant.payout_threshold_sats} sats.`);

        if (accumTotalForwarded >= merchant.payout_threshold_sats) {
          // Mark all pending as 'paying' to prevent double-spend before async payout call
          await db.run(
            "UPDATE invoices SET payout_status = 'paying' WHERE api_key = ? AND status = 'settled' AND payout_status = 'pending_threshold'",
            invoice.api_key
          );
          await db.run('COMMIT');

          console.log(`⚡ Threshold met! Executing single payout of ${accumTotalForwarded} sats to ${merchant.ln_address}...`);
          const payoutHash = await payLightningAddress(merchant.ln_address, accumTotalForwarded, isDemo);

          await db.run(
            "UPDATE invoices SET payout_status = 'forwarded' WHERE api_key = ? AND status = 'settled' AND payout_status = 'paying'",
            invoice.api_key
          );

          await db.run(
            'INSERT INTO ledgers (id, payment_hash, api_key, amount_sats, commission_sats, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
            crypto.randomUUID(),
            'accum_' + crypto.randomBytes(8).toString('hex'),
            invoice.api_key,
            accumTotalAmount,
            accumTotalCommission,
            new Date().toISOString()
          );

          console.log(`✅ Accumulated payout successfully forwarded to ${merchant.ln_address}. Hash: ${payoutHash}`);

          if (invoice.callback_url) {
            triggerWebhookWithRetry(invoice.callback_url, {
              payment_hash: paymentHash,
              amount_sats: invoice.amount_sats,
              forwarded_amount_sats: invoice.forwarded_amount_sats,
              status: 'settled',
              payout_status: 'forwarded',
              accumulated_payout_hash: payoutHash
            });
          }
          res.json({ status: 'ok', payout_hash: payoutHash, threshold_met: true });
        } else {
          await db.run('COMMIT');
          // Send notification payload showing pending payout state
          if (invoice.callback_url) {
            triggerWebhookWithRetry(invoice.callback_url, {
              payment_hash: paymentHash,
              amount_sats: invoice.amount_sats,
              forwarded_amount_sats: invoice.forwarded_amount_sats,
              status: 'settled',
              payout_status: 'pending_threshold',
              accumulated_sats: accumTotalForwarded,
              threshold_sats: merchant.payout_threshold_sats
            });
          }
          res.json({ status: 'ok', payout_status: 'pending_threshold', accumulated_sats: accumTotalForwarded });
        }
      } catch (err: any) {
        // Rollback on any error
        try { await db.run('ROLLBACK'); } catch (_) {}
        console.error('Threshold processing failed:', err);
        res.status(500).json({ error: 'Threshold processing failed', code: 'SERVER_ERROR' });
      }
    }
  } catch (err: any) {
    console.error('Webhook processing failed:', err);
    res.status(500).json({ error: 'Webhook processing failed', code: 'SERVER_ERROR' });
  }
});

// 4. GET /confirm/:hash (Check invoice payment and routing status)
app.get('/confirm/:hash', async (req: Request, res: Response) => {
  const hash = req.params.hash;

  try {
    const invoice = await db.get('SELECT * FROM invoices WHERE payment_hash = ?', hash);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found', code: 'NOT_FOUND' });
    }

    // For demo hashes: simulate payment locally
    if (invoice.status === 'pending' && hash.startsWith('demo_')) {
      const lnbitsWebhookUrl = `http://127.0.0.1:${PORT}/lnbits-webhook`;
      await fetch(lnbitsWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_hash: hash })
      });
      
      const updatedInvoice = await db.get('SELECT * FROM invoices WHERE payment_hash = ?', hash);
      return res.json({ paid: updatedInvoice.status === 'settled', status: updatedInvoice.status });
    }

    // For real LNbits invoices: verify payment status with LNbits
    if (invoice.status === 'pending' && !hash.startsWith('demo_') && LNBITS_INVOICE_KEY) {
      try {
        const verifyRes = await fetch(`${LNBITS_URL}/api/v1/payments/${hash}`, {
          headers: { 'X-Api-Key': LNBITS_INVOICE_KEY }
        });
        if (verifyRes.ok) {
          const verifyData = (await verifyRes.json()) as any;
          if (verifyData.paid) {
            // Payment confirmed! Trigger webhook to settle the invoice
            const lnbitsWebhookUrl = `http://127.0.0.1:${PORT}/lnbits-webhook`;
            await fetch(lnbitsWebhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ payment_hash: hash })
            });
            const updatedInvoice = await db.get('SELECT * FROM invoices WHERE payment_hash = ?', hash);
            return res.json({ paid: updatedInvoice.status === 'settled', status: updatedInvoice.status });
          }
        }
      } catch (e) {
        console.error('LNbits verification failed:', e);
      }
    }

    res.json({ paid: invoice.status === 'settled', status: invoice.status });
  } catch (err: any) {
    res.status(500).json({ error: 'Database query failed', code: 'SERVER_ERROR' });
  }
});

// 5. GET /merchant/stats (Get 7 days transaction stats for charts)
app.get('/merchant/stats', async (req: Request, res: Response) => {
  const apiKey = getAippKey(req);
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing or invalid AIPP API key in headers', code: 'UNAUTHORIZED' });
  }

  try {
    const merchant = await db.get('SELECT ln_address FROM merchants WHERE api_key = ?', apiKey);
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found', code: 'NOT_FOUND' });
    }

    const stats = await db.all(`
      SELECT 
        date(timestamp) as date,
        SUM(amount_sats) as total_volume,
        COUNT(id) as transactions_count,
        SUM(commission_sats) as total_commission
      FROM ledgers 
      WHERE api_key = ? AND timestamp >= datetime('now', '-7 days')
      GROUP BY date
      ORDER BY date ASC
    `, apiKey);
    res.json({ stats, ln_address: merchant.ln_address });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve stats', code: 'SERVER_ERROR' });
  }
});

// 6. GET /merchant/transactions (Get merchant transaction history)
app.get('/merchant/transactions', async (req: Request, res: Response) => {
  const apiKey = getAippKey(req);
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing or invalid AIPP API key in headers', code: 'UNAUTHORIZED' });
  }

  try {
    const txs = await db.all(`
      SELECT payment_hash, amount_sats, commission_sats, forwarded_amount_sats, status, created_at
      FROM invoices
      WHERE api_key = ?
      ORDER BY created_at DESC
      LIMIT 100
    `, apiKey);
    res.json(txs);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve transactions', code: 'SERVER_ERROR' });
  }
});

// 7. POST /test-target (For self-contained offline testing)
app.post('/test-target', (req: Request, res: Response) => {
  res.json({
    success: true,
    method: req.method,
    headers: req.headers,
    body: req.body && req.body.length > 0 ? JSON.parse(req.body.toString('utf8')) : null
  });
});

async function startServer() {
  // Initialize SQLite Database
  db = await open({
    filename: './aipp.db',
    driver: sqlite3.Database,
  });

  // Create tables if they do not exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS merchants (
      api_key TEXT PRIMARY KEY,
      ln_address TEXT NOT NULL UNIQUE,
      payout_mode TEXT NOT NULL DEFAULT 'instant',
      payout_threshold_sats INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
      payment_hash TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      amount_sats INTEGER NOT NULL,
      commission_sats INTEGER NOT NULL,
      forwarded_amount_sats INTEGER NOT NULL,
      status TEXT NOT NULL,
      payout_status TEXT NOT NULL DEFAULT 'none',
      callback_url TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ledgers (
      id TEXT PRIMARY KEY,
      payment_hash TEXT NOT NULL,
      api_key TEXT NOT NULL,
      amount_sats INTEGER NOT NULL,
      commission_sats INTEGER NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_spend (
      api_key TEXT NOT NULL,
      date TEXT NOT NULL,
      usd_amount REAL NOT NULL DEFAULT 0,
      requests_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (api_key, date)
    );
  `);

  console.log('⚡ SQLite Database file initialized (aipp.db).');

  // Pre-seed a developer test key — only in development mode
  if (!IS_PRODUCTION) {
    const devKey = 'aipp_devtest';
    const existingDevKey = await db.get('SELECT * FROM merchants WHERE api_key = ?', devKey);
    if (!existingDevKey) {
      await db.run(
        'INSERT OR IGNORE INTO merchants (api_key, ln_address, payout_mode, payout_threshold_sats, created_at) VALUES (?, ?, ?, ?, ?)',
        devKey,
        'devtest@aipp.dev',
        'instant',
        0,
        new Date().toISOString()
      );

      // Add mock transaction
      const mockHash = 'demo_mock_payout_' + crypto.randomBytes(8).toString('hex');
      await db.run(
        'INSERT INTO invoices (payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, status, payout_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        mockHash,
        devKey,
        25000,
        250,
        24750,
        'settled',
        'forwarded',
        new Date().toISOString()
      );

      await db.run(
        'INSERT INTO ledgers (id, payment_hash, api_key, amount_sats, commission_sats, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
        crypto.randomUUID(),
        mockHash,
        devKey,
        25000,
        250,
        new Date().toISOString()
      );

      console.log(`⚡ Pre-seeded developer testing merchant: ${devKey} for Lightning Address devtest@aipp.dev.`);
    }
  }

  // Fetch initial BTC/USD rate, then refresh every 5 minutes
  await refreshBtcRate();
  setInterval(refreshBtcRate, 5 * 60 * 1000);

  // Listen
  app.listen(PORT, () => {
    console.log(`⚡ AIPP Generic Payment Bridge listening on port ${PORT}`);
    console.log(`⚡ LNBits API configured: ${LNBITS_INVOICE_KEY ? 'YES' : 'NO'}`);
    console.log(`⚡ Admin key configured (payouts): ${LNBITS_ADMIN_KEY ? 'YES' : '❌ NO — payouts will fail!'}`);
    console.log(`⚡ Webhook secret: ${LNBITS_WEBHOOK_SECRET ? 'SET ✅' : '⚠️ NOT SET — webhook spoofing possible'}`);
    console.log(`⚡ Mode: ${IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    console.log(`⚡ BTC/USD Rate: $${BTC_USD_RATE.toLocaleString()}`);
    console.log(`⚡ Rate limit: 10 req/min, Default fee: ${FEE_PER_REQUEST_SATS} sats, Daily limit: $${DAILY_LIMIT_USD}`);

    // Auto-poller: every 15 seconds, check pending invoices against LNbits
    if (LNBITS_INVOICE_KEY) {
      setInterval(async () => {
        try {
          const pendingInvoices = await db.all("SELECT payment_hash FROM invoices WHERE status = 'pending' AND payment_hash NOT LIKE 'demo_%'");
          for (const inv of pendingInvoices) {
            try {
              const verifyRes = await fetch(`${LNBITS_URL}/api/v1/payments/${inv.payment_hash}`, {
                headers: { 'X-Api-Key': LNBITS_INVOICE_KEY }
              });
              if (verifyRes.ok) {
                const data = (await verifyRes.json()) as any;
                if (data.paid) {
                  console.log(`⚡ Auto-poller: Payment detected for ${inv.payment_hash}. Processing...`);
                  // Trigger webhook to settle
                  await fetch(`http://127.0.0.1:${PORT}/lnbits-webhook`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ payment_hash: inv.payment_hash })
                  });
                }
              }
            } catch (e) {
              // Silently skip failed verifications
            }
          }
        } catch (e) {
          // Silently skip DB errors
        }
      }, 15000);
      console.log('⚡ Auto-poller active: checking pending payments every 15s');
    }
  });
}

// Start
startServer().catch((err) => {
  console.error('Failed to initialize server:', err);
  process.exit(1);
});
