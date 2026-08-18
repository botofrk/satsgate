import crypto from 'crypto';
import { Database } from 'sqlite';
import { MIN_PAYOUT_THRESHOLD_SATS } from '../config/env';

export interface PayoutEnqueueResult {
  enqueued: boolean;
  jobId?: string;
  accumulatedSats?: number;
  threshold?: number;
  reason?: string;
}

/**
 * Evaluates settled invoices with payout_status = 'pending_threshold' for a merchant.
 * If total accumulated net forwarded sats meets or exceeds the effective threshold,
 * atomically marks those invoices as 'queued' and inserts a single batch job into payout_queue.
 * Must be executed within an active SQLite transaction.
 */
export async function enqueueMerchantPayoutIfEligible(
  db: Database,
  apiKey: string
): Promise<PayoutEnqueueResult> {
  const merchant = await db.get(
    'SELECT api_key, ln_address, payout_mode, payout_threshold_sats FROM merchants WHERE api_key = ?',
    apiKey
  );
  if (!merchant || !merchant.ln_address) {
    return { enqueued: false, reason: 'merchant_or_destination_missing' };
  }

  const payoutMode = merchant.payout_mode || 'instant';
  if (payoutMode === 'manual') {
    return { enqueued: false, reason: 'manual_payout_mode' };
  }

  const effectiveThreshold = payoutMode === 'instant'
    ? 1
    : Math.max(MIN_PAYOUT_THRESHOLD_SATS, merchant.payout_threshold_sats || 0);

  const accumRecord = await db.get(
    "SELECT SUM(forwarded_amount_sats) as total FROM invoices WHERE api_key = ? AND status = 'settled' AND payout_status = 'pending_threshold'",
    apiKey
  );

  const accumTotalForwarded = accumRecord?.total ?? 0;

  if (accumTotalForwarded >= effectiveThreshold) {
    await db.run(
      "UPDATE invoices SET payout_status = 'queued' WHERE api_key = ? AND status = 'settled' AND payout_status = 'pending_threshold'",
      apiKey
    );

    const jobId = crypto.randomUUID();
    const batchId = `batch_${crypto.randomBytes(8).toString('hex')}`;
    const now = new Date().toISOString();

    await db.run(
      "INSERT INTO payout_queue (id, payment_hash, api_key, amount_sats, ln_address, status, next_retry_at, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)",
      jobId,
      batchId,
      apiKey,
      accumTotalForwarded,
      merchant.ln_address,
      now,
      now
    );

    console.log(`[Payout Enqueue] Threshold met (${effectiveThreshold} sats)! Job ${jobId} queued for ${accumTotalForwarded} sats to ${merchant.ln_address}.`);

    return {
      enqueued: true,
      jobId,
      accumulatedSats: accumTotalForwarded,
      threshold: effectiveThreshold
    };
  }

  console.log(`[Payout Enqueue] Payment accumulated. Total: ${accumTotalForwarded} sats. Waiting to reach ${effectiveThreshold} sats.`);
  return {
    enqueued: false,
    accumulatedSats: accumTotalForwarded,
    threshold: effectiveThreshold,
    reason: 'threshold_not_met'
  };
}
