import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDb } from '../config/database';
import { LNBITS_WEBHOOK_SECRET, LNBITS_INVOICE_KEY, LNBITS_URL, MIN_PAYOUT_THRESHOLD_SATS, IS_PRODUCTION } from '../config/env';
import { AppError } from '../utils/error';
import { processPayoutQueue } from '../jobs/payoutWorker';

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

function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  // If no secret configured, reject ALL webhook calls (fail-closed)
  if (!LNBITS_WEBHOOK_SECRET) return false;
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', LNBITS_WEBHOOK_SECRET)
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
  if (!LNBITS_WEBHOOK_SECRET || !querySecret) return false;
  if (querySecret.length !== LNBITS_WEBHOOK_SECRET.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(querySecret),
      Buffer.from(LNBITS_WEBHOOK_SECRET)
    );
  } catch {
    return false;
  }
}

// [W-03 FIX] Merchant callback with explicit 10s timeout
function triggerWebhookWithRetry(callbackUrl: string, payload: any, attempt: number = 1) {
  setTimeout(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (!res.ok) {
        throw new Error(`Receiver returned status ${res.status}`);
      }
      console.log(`[Merchant Webhook] ✅ Callback sent to ${callbackUrl} (Attempt ${attempt})`);
    } catch (err: any) {
      console.error(`[Merchant Webhook] ❌ Attempt ${attempt} failed for ${callbackUrl}: ${err.message}`);
      if (attempt < 3) {
        const delayMs = attempt * 60 * 1000;
        console.log(`[Merchant Webhook] Retrying in ${delayMs / 1000}s...`);
        triggerWebhookWithRetry(callbackUrl, payload, attempt + 1);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }, 0);
}

export const handleLnbitsWebhook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = req.headers['x-lnbits-webhook-secret'] as string | undefined
      || req.headers['x-webhook-signature'] as string | undefined;
    const querySecret = req.query.secret as string | undefined;

    if (LNBITS_WEBHOOK_SECRET) {
      const isSignatureValid = verifyWebhookSignature(req.body as Buffer, signature);
      // [W-12 FIX] Constant-time query secret comparison
      const isQueryValid = verifyQuerySecret(querySecret);

      if (!isSignatureValid && !isQueryValid) {
        console.warn('[Webhook] Invalid auth from:', req.ip);
        throw new AppError('Invalid webhook signature or secret', 401, 'UNAUTHORIZED');
      }

      // [W-01 FIX] In production, reject query-param-only auth
      if (IS_PRODUCTION && isQueryValid && !isSignatureValid) {
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

    // [HIGH-3 FIX] Wrap JSON.parse in try-catch
    let body: any = {};
    if (req.body && req.body.length > 0) {
      try {
        body = JSON.parse(req.body.toString('utf8'));
      } catch {
        throw new AppError('Invalid JSON body in webhook request', 400, 'INVALID_JSON');
      }
    }

    const paymentHash = body.payment_hash || body.checking_id;
    if (!paymentHash) {
      throw new AppError('Missing payment hash', 400, 'BAD_REQUEST');
    }

    const db = getDb();
    
    await db.run('BEGIN EXCLUSIVE TRANSACTION');

    try {
      const invoice = await db.get('SELECT payment_hash, api_key, amount_sats, forwarded_amount_sats, status, callback_url, protocol FROM invoices WHERE payment_hash = ?', paymentHash);
      if (!invoice) {
        await db.run('ROLLBACK');
        return res.json({ status: 'ignored', reason: 'invoice_not_found' });
      }

      if (invoice.status === 'settled') {
        await db.run('ROLLBACK');
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

      if (payoutMode === 'manual') {
        await db.run(
          "UPDATE invoices SET status = 'settled', payout_status = 'pending_manual' WHERE payment_hash = ?",
          paymentHash
        );
        console.log(`[Webhook] Manual mode: payment accumulated. Waiting for merchant withdrawal.`);
      } else {
        await db.run(
          "UPDATE invoices SET status = 'settled', payout_status = 'pending_threshold' WHERE payment_hash = ?",
          paymentHash
        );
        
        const accumRecord = await db.get(
          "SELECT SUM(forwarded_amount_sats) as total FROM invoices WHERE api_key = ? AND status = 'settled' AND payout_status = 'pending_threshold'",
          invoice.api_key
        );
        
        // [W-06 FIX] Use ?? (nullish coalescing) instead of || for SUM result
        const accumTotalForwarded = accumRecord?.total ?? 0;
        
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
            `batch_${crypto.randomBytes(8).toString('hex')}`, // [K-11 FIX] Random suffix, not predictable
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

      // Trigger the payout worker immediately (non-blocking) to achieve instant pass-through
      Promise.resolve().then(() => processPayoutQueue()).catch(err => 
        console.error('[Webhook] Failed to run payout queue immediately:', err)
      );

      const updatedInvoice = await db.get('SELECT payment_hash, amount_sats, status, payout_status FROM invoices WHERE payment_hash = ?', paymentHash);

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
      await db.run('ROLLBACK').catch(() => {});
      throw innerErr;
    }

  } catch (error) {
    next(error);
  }
};
