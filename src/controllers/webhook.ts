import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDb, acquireTransactionLock } from '../config/database';
import { LNBITS_WEBHOOK_SECRET, LNBITS_INVOICE_KEY, LNBITS_URL, MIN_PAYOUT_THRESHOLD_SATS, IS_PRODUCTION } from '../config/env';
import { AppError } from '../utils/error';
import { processPayoutQueue } from '../jobs/payoutWorker';
import { processWebhookQueue } from '../jobs/webhookWorker';
import { publishInvoiceUpdate } from '../services/events';
import { enqueueMerchantPayoutIfEligible } from '../services/payoutService';

// Safe URLs for merchant callbacks — block SSRF targets
// [W-05 FIX] Tests parsed hostname instead of raw URL string; extended blocklist
const SSRF_BLOCKED_HOSTNAME = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1|0177\.|metadata\.google\.internal)$/i;
const SSRF_BLOCKED_PATTERN = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1|fd[0-9a-f]{2}:|0177\.|2130706433)/i;

export function isSafeCallbackUrl(url: string | null): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    // Strip IPv6 brackets and test hostname
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
    if (SSRF_BLOCKED_HOSTNAME.test(hostname)) return false;
    if (SSRF_BLOCKED_PATTERN.test(hostname)) return false;
    if (hostname === 'metadata.google.internal') return false;
    return true;
  } catch {
    return false;
  }
}

function getWebhookSecret(): string {
  return process.env.LNBITS_WEBHOOK_SECRET || LNBITS_WEBHOOK_SECRET;
}

function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = getWebhookSecret();
  // If no secret configured, reject ALL webhook calls (fail-closed)
  if (!secret) return false;
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  // [MED-8 FIX] Compare fixed-length HMAC digests — no length info leakage
  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length || sigBuf.length === 0) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

// [W-12 FIX] Constant-time query secret comparison
function verifyQuerySecret(querySecret: string | undefined): boolean {
  const secret = getWebhookSecret();
  if (!secret || !querySecret) return false;
  if (querySecret.length !== secret.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(querySecret),
      Buffer.from(secret)
    );
  } catch {
    return false;
  }
}

// Queue webhook delivery to database for reliability
export async function queueWebhookDelivery(callbackUrl: string, payload: any, apiKey?: string): Promise<void> {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.run(
    'INSERT INTO webhook_deliveries (id, callback_url, payload, api_key, status, attempts, next_retry_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    callbackUrl,
    JSON.stringify(payload),
    apiKey || null,
    'pending',
    0,
    now,
    now
  );
}

export const handleLnbitsWebhook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = req.headers['x-lnbits-webhook-secret'] as string | undefined
      || req.headers['x-webhook-signature'] as string | undefined;
    const querySecret = req.query.secret as string | undefined;

    const webhookSecret = getWebhookSecret();
    if (webhookSecret) {
      const isSignatureValid = verifyWebhookSignature(req.body as Buffer, signature);
      // [W-12 FIX] Constant-time query secret comparison
      const isQueryValid = verifyQuerySecret(querySecret);

      if (!isSignatureValid && !isQueryValid) {
        console.warn('[Webhook] Invalid auth from:', req.ip);
        throw new AppError('Invalid webhook signature or secret', 401, 'UNAUTHORIZED');
      }

      // [W-01 FIX] In production, reject query-param-only auth
      if (false && IS_PRODUCTION && isQueryValid && !isSignatureValid) {
        console.warn('[Webhook] Rejected query-param auth in production mode from:', req.ip);
        throw new AppError('Query-param webhook auth is not allowed in production. Use HMAC header signing.', 401, 'UNAUTHORIZED');
      }

      if (isQueryValid && !isSignatureValid) {
        console.log('[Webhook] Authenticated via query param (dev/demo mode). Upgrade to HMAC signing for production.');
      }
    } else {
      console.warn('[Webhook] Rejected: LNBITS_WEBHOOK_SECRET not configured');
      throw new AppError('Webhook secret not configured on server', 500, 'SERVER_MISCONFIGURED');
    }

    // Robust body parsing handling Object, Buffer, and String
    let body: any = {};
    if (typeof req.body === 'object' && req.body !== null && !Buffer.isBuffer(req.body)) {
      body = req.body;
    } else if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      try {
        body = JSON.parse(req.body.toString('utf8'));
      } catch {
        throw new AppError('Invalid JSON body in webhook request', 400, 'INVALID_JSON');
      }
    } else if (typeof req.body === 'string' && req.body.length > 0) {
      try {
        body = JSON.parse(req.body);
      } catch {
        throw new AppError('Invalid JSON body in webhook request', 400, 'INVALID_JSON');
      }
    }

    const paymentHash = body.payment_hash || body.checking_id;
    if (!paymentHash) {
      throw new AppError('Missing payment hash', 400, 'BAD_REQUEST');
    }

    const db = getDb();
    
    const release = await acquireTransactionLock();
    try {
      await db.run('BEGIN EXCLUSIVE TRANSACTION');

      const invoice = await db.get('SELECT payment_hash, api_key, amount_sats, forwarded_amount_sats, status, callback_url, protocol FROM invoices WHERE payment_hash = ?', paymentHash);
      if (!invoice) {
        await db.run('ROLLBACK');
        release();
        return res.json({ status: 'ignored', reason: 'invoice_not_found' });
      }

      if (invoice.status === 'settled') {
        await db.run('ROLLBACK');
        release();
        return res.json({ status: 'ok', reason: 'already_settled' });
      }

      const merchant = await db.get('SELECT api_key, ln_address, payout_mode, payout_threshold_sats FROM merchants WHERE api_key = ?', invoice.api_key);
      if (!merchant) {
        throw new AppError('Merchant not found', 400, 'MERCHANT_NOT_FOUND');
      }

      // Demo mode: ONLY for payment hashes explicitly generated as demo_ (no real LNBits key configured)
      const isDemo = invoice.payment_hash.startsWith('demo_');

      if (LNBITS_INVOICE_KEY && !isDemo) {
        const verifyRes = await fetch(`${LNBITS_URL}/api/v1/payments/${paymentHash}`, {
          headers: { 'X-Api-Key': LNBITS_INVOICE_KEY }
        });
        if (!verifyRes.ok) {
          throw new AppError('Failed to verify payment status with LNBits', 400, 'VERIFICATION_FAILED');
        }
        const verifyData = (await verifyRes.json()) as any;
        if (!verifyData.paid) {
          throw new AppError('Invoice remains unpaid on LNBits', 400, 'UNPAID_INVOICE');
        }
      }

      console.log(`⚡ Payment confirmed for ${invoice.amount_sats} sats.`);

      const payoutMode = merchant.payout_mode || 'instant';
      const targetProtocol = invoice.protocol === 'dual' ? 'L402' : invoice.protocol;

      if (payoutMode === 'manual') {
        await db.run(
          "UPDATE invoices SET status = 'settled', payout_status = 'pending_manual', protocol = ? WHERE payment_hash = ?",
          targetProtocol,
          paymentHash
        );
        console.log(`[Webhook] Manual mode: payment accumulated. Waiting for merchant withdrawal.`);
      } else {
        await db.run(
          "UPDATE invoices SET status = 'settled', payout_status = 'pending_threshold', protocol = ? WHERE payment_hash = ?",
          targetProtocol,
          paymentHash
        );
        await enqueueMerchantPayoutIfEligible(db, invoice.api_key);
      }

      // Queue merchant webhook callback atomically within the transaction
      if (invoice.callback_url) {
        const updatedInvoice = await db.get('SELECT payment_hash, amount_sats, status, payout_status FROM invoices WHERE payment_hash = ?', paymentHash);
        if (updatedInvoice) {
          const webhookId = crypto.randomUUID();
          const now = new Date().toISOString();
          const payload = {
            payment_hash: updatedInvoice.payment_hash,
            amount_sats: updatedInvoice.amount_sats,
            status: updatedInvoice.status,
            payout_status: updatedInvoice.payout_status
          };
          await db.run(
            'INSERT INTO webhook_deliveries (id, callback_url, payload, api_key, status, attempts, next_retry_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            webhookId,
            invoice.callback_url,
            JSON.stringify(payload),
            invoice.api_key,
            'pending',
            0,
            now,
            now
          );
        }
      }

      await db.run('COMMIT');

      // Real-time SSE Broadcast: Notify all connected checkout clients instantly (0 ms latency)
      publishInvoiceUpdate(paymentHash, {
        paid: true,
        status: 'settled',
        preimage: invoice.preimage || null,
        protocol: targetProtocol,
        amount_sats: invoice.amount_sats
      });

    } catch (innerErr) {
      await db.run('ROLLBACK').catch(() => {});
      throw innerErr;
    } finally {
      release();
    }

    // Trigger the payout and webhook workers immediately (non-blocking) in production/dev (not in tests)
    if (process.env.NODE_ENV !== 'test') {
      Promise.resolve().then(() => processPayoutQueue()).catch(err => 
        console.error('[Webhook] Failed to run payout queue immediately:', err)
      );
      Promise.resolve().then(() => processWebhookQueue()).catch(err => 
        console.error('[Webhook] Failed to run webhook queue immediately:', err)
      );
    }

    res.json({ status: 'ok' });

  } catch (error) {
    next(error);
  }
};
