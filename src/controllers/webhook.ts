import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDb } from '../config/database';
import { LNBITS_WEBHOOK_SECRET, LNBITS_INVOICE_KEY, LNBITS_URL, MIN_PAYOUT_THRESHOLD_SATS } from '../config/env';
import { AppError } from '../utils/error';

// Safe URLs for merchant callbacks — block SSRF targets
const SSRF_BLOCKED = /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1|fd[0-9a-f]{2}:)/i;

export function isSafeCallbackUrl(url: string | null): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    if (SSRF_BLOCKED.test(url)) return false;
    return true;
  } catch {
    return false;
  }
}

function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  // If no secret configured, reject ALL webhook calls (fail-closed)
  if (!LNBITS_WEBHOOK_SECRET) return false;
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', LNBITS_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  // Guard against different-length buffers before timingSafeEqual
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

// Fire-and-forget webhook callback to the merchant
function triggerWebhookWithRetry(callbackUrl: string, payload: any, attempt: number = 1) {
  setTimeout(async () => {
    try {
      const res = await fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        throw new Error(`Receiver returned status ${res.status}`);
      }
      console.log(`[Merchant Webhook success] Fired callback to ${callbackUrl} (Attempt ${attempt})`);
    } catch (err: any) {
      console.error(`[Merchant Webhook error] Attempt ${attempt} failed for ${callbackUrl}:`, err.message);
      if (attempt < 3) {
        const delayMs = attempt * 60 * 1000;
        console.log(`[Merchant Webhook queue] Retrying callback to ${callbackUrl} in ${delayMs / 1000}s...`);
        triggerWebhookWithRetry(callbackUrl, payload, attempt + 1);
      }
    }
  }, 0);
}

export const handleLnbitsWebhook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Two accepted auth modes:
    // 1. HMAC header (preferred, for self-hosted LNBits that supports webhook signing)
    // 2. Query param secret (fallback for demo.lnbits.com which just POSTs to the URL as-is)
    const signature = req.headers['x-lnbits-webhook-secret'] as string | undefined
      || req.headers['x-webhook-signature'] as string | undefined;
    const querySecret = req.query.secret as string | undefined;

    if (LNBITS_WEBHOOK_SECRET) {
      const isSignatureValid = verifyWebhookSignature(req.body as Buffer, signature);
      const isQueryValid = querySecret === LNBITS_WEBHOOK_SECRET;

      if (!isSignatureValid && !isQueryValid) {
        console.warn('[Webhook] Invalid auth from:', req.ip);
        throw new AppError('Invalid webhook signature or secret', 401, 'UNAUTHORIZED');
      }

      if (isQueryValid && !isSignatureValid) {
        // demo.lnbits.com mode — log a notice but allow through
        console.log('[Webhook] Authenticated via query param (demo.lnbits.com mode). Upgrade to self-hosted LNBits for HMAC signing.');
      }
    } else {
      // No secret configured at all — reject all to fail-closed
      console.warn('[Webhook] Rejected: LNBITS_WEBHOOK_SECRET not configured');
      throw new AppError('Webhook secret not configured on server', 500, 'SERVER_MISCONFIGURED');
    }

    let body: any = {};
    if (req.body && req.body.length > 0) {
      body = JSON.parse(req.body.toString('utf8'));
    }

    const paymentHash = body.payment_hash || body.checking_id;
    if (!paymentHash) {
      throw new AppError('Missing payment hash', 400, 'BAD_REQUEST');
    }

    const db = getDb();
    
    // Start transaction for webhook processing
    await db.run('BEGIN EXCLUSIVE TRANSACTION');

    try {
      const invoice = await db.get('SELECT * FROM invoices WHERE payment_hash = ?', paymentHash);
      if (!invoice) {
        await db.run('ROLLBACK');
        return res.json({ status: 'ignored', reason: 'invoice_not_found' });
      }

      if (invoice.status === 'settled') {
        await db.run('ROLLBACK');
        return res.json({ status: 'ok', reason: 'already_settled' });
      }

      const merchant = await db.get('SELECT * FROM merchants WHERE api_key = ?', invoice.api_key);
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

      if (payoutMode === 'manual') {
        // Accumulate for manual withdrawal
        await db.run(
          "UPDATE invoices SET status = 'settled', payout_status = 'pending_manual' WHERE payment_hash = ?",
          paymentHash
        );
        console.log(`[Webhook] Manual mode: payment accumulated. Waiting for merchant withdrawal.`);
      } else {
        // Unify instant and threshold accumulation to respect MIN_PAYOUT_THRESHOLD_SATS
        await db.run(
          "UPDATE invoices SET status = 'settled', payout_status = 'pending_threshold' WHERE payment_hash = ?",
          paymentHash
        );
        
        const accumRecord = await db.get(
          "SELECT SUM(forwarded_amount_sats) as total FROM invoices WHERE api_key = ? AND status = 'settled' AND payout_status = 'pending_threshold'",
          invoice.api_key
        );
        
        const accumTotalForwarded = accumRecord?.total || 0;
        
        const effectiveThreshold = payoutMode === 'instant' 
          ? MIN_PAYOUT_THRESHOLD_SATS 
          : Math.max(MIN_PAYOUT_THRESHOLD_SATS, merchant.payout_threshold_sats || 0);

        if (accumTotalForwarded >= effectiveThreshold) {
          await db.run(
            "UPDATE invoices SET payout_status = 'queued' WHERE api_key = ? AND status = 'settled' AND payout_status = 'pending_threshold'",
            invoice.api_key
          );

          const jobId = crypto.randomUUID();
          await db.run(
            "INSERT INTO payout_queue (id, payment_hash, api_key, amount_sats, ln_address, status, next_retry_at, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)",
            jobId,
            `batch_${invoice.api_key}_${Date.now()}`,
            invoice.api_key,
            accumTotalForwarded,
            merchant.ln_address,
            new Date().toISOString(),
            new Date().toISOString()
          );
          console.log(`[Webhook] Threshold met (${effectiveThreshold})! Job ${jobId} queued for ${accumTotalForwarded} sats.`);
        } else {
          console.log(`[Webhook] Payment accumulated. Total: ${accumTotalForwarded} sats. Waiting to reach ${effectiveThreshold} sats.`);
        }
      }

      await db.run('COMMIT');

      // Fetch the updated invoice to get the exact payout_status
      const updatedInvoice = await db.get('SELECT * FROM invoices WHERE payment_hash = ?', paymentHash);

      // Trigger merchant callback if provided
      if (invoice.callback_url && updatedInvoice) {
        triggerWebhookWithRetry(invoice.callback_url, {
          payment_hash: updatedInvoice.payment_hash,
          amount_sats: updatedInvoice.amount_sats,
          status: updatedInvoice.status,
          payout_status: updatedInvoice.payout_status
        });
      }

      res.json({ status: 'ok' });

    } catch (innerErr) {
      await db.run('ROLLBACK');
      throw innerErr;
    }

  } catch (error) {
    next(error);
  }
};
