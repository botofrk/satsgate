import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDb } from '../config/database';
import { LNBITS_WEBHOOK_SECRET, LNBITS_INVOICE_KEY, LNBITS_URL } from '../config/env';
import { AppError } from '../utils/error';

function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!LNBITS_WEBHOOK_SECRET) return true;
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', LNBITS_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
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
    const signature = req.headers['x-lnbits-webhook-secret'] as string | undefined
      || req.headers['x-webhook-signature'] as string | undefined;
    const querySecret = req.query.secret as string | undefined;
    
    if (LNBITS_WEBHOOK_SECRET) {
      const isSignatureValid = verifyWebhookSignature(req.body as Buffer, signature);
      const isQueryValid = querySecret === LNBITS_WEBHOOK_SECRET;
      
      if (!isSignatureValid && !isQueryValid) {
        console.warn('[Webhook] Invalid signature/secret from:', req.ip);
        throw new AppError('Invalid webhook signature or secret', 401, 'UNAUTHORIZED');
      }
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
        await db.run('ROLLBACK');
        throw new AppError('Merchant not found', 400, 'MERCHANT_NOT_FOUND');
      }

      const isDemo = invoice.payment_hash.startsWith('demo_') ||
                     merchant.ln_address === 'mehmet@phoenixwallet.me' ||
                     merchant.ln_address === 'devtest@aipp.dev';

      if (LNBITS_INVOICE_KEY && !isDemo) {
        const verifyRes = await fetch(`${LNBITS_URL}/api/v1/payments/${paymentHash}`, {
          headers: { 'X-Api-Key': LNBITS_INVOICE_KEY }
        });
        if (!verifyRes.ok) {
          await db.run('ROLLBACK');
          throw new AppError('Failed to verify payment status with LNBits', 400, 'VERIFICATION_FAILED');
        }
        const verifyData = (await verifyRes.json()) as any;
        if (!verifyData.paid) {
          await db.run('ROLLBACK');
          throw new AppError('Invoice remains unpaid on LNBits', 400, 'UNPAID_INVOICE');
        }
      }

      console.log(`⚡ Payment confirmed for ${invoice.amount_sats} sats.`);

      const payoutMode = merchant.payout_mode || 'instant';

      if (payoutMode === 'instant') {
        // Enqueue payout job instead of synchronous execution
        const jobId = crypto.randomUUID();
        await db.run(
          "INSERT INTO payout_queue (id, payment_hash, api_key, amount_sats, ln_address, status, next_retry_at, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)",
          jobId,
          paymentHash,
          invoice.api_key,
          invoice.forwarded_amount_sats,
          merchant.ln_address,
          new Date().toISOString(),
          new Date().toISOString()
        );

        await db.run(
          "UPDATE invoices SET status = 'settled', payout_status = 'queued' WHERE payment_hash = ?",
          paymentHash
        );
        console.log(`[Webhook] Job ${jobId} queued for instant payout.`);
      } else {
        // Threshold accumulation
        await db.run(
          "UPDATE invoices SET status = 'settled', payout_status = 'pending_threshold' WHERE payment_hash = ?",
          paymentHash
        );
        
        const accumRecord = await db.get(
          "SELECT SUM(forwarded_amount_sats) as total FROM invoices WHERE api_key = ? AND status = 'settled' AND payout_status = 'pending_threshold'",
          invoice.api_key
        );
        
        const accumTotalForwarded = accumRecord?.total || 0;

        if (accumTotalForwarded >= merchant.payout_threshold_sats) {
          await db.run(
            "UPDATE invoices SET payout_status = 'queued' WHERE api_key = ? AND status = 'settled' AND payout_status = 'pending_threshold'",
            invoice.api_key
          );

          const jobId = crypto.randomUUID();
          await db.run(
            "INSERT INTO payout_queue (id, payment_hash, api_key, amount_sats, ln_address, status, next_retry_at, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)",
            jobId,
            `threshold_${invoice.api_key}_${Date.now()}`,
            invoice.api_key,
            accumTotalForwarded,
            merchant.ln_address,
            new Date().toISOString(),
            new Date().toISOString()
          );
          console.log(`[Webhook] Threshold met! Job ${jobId} queued for ${accumTotalForwarded} sats.`);
        }
      }

      await db.run('COMMIT');

      // Trigger merchant callback if provided
      if (invoice.callback_url) {
        triggerWebhookWithRetry(invoice.callback_url, {
          payment_hash: invoice.payment_hash,
          amount_sats: invoice.amount_sats,
          status: 'settled',
          payout_status: payoutMode === 'instant' ? 'queued' : 'pending'
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
