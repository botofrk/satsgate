import { getDb } from '../config/database';
import { payLightningAddress } from '../services/lightning';
import crypto from 'crypto';

export async function processPayoutQueue() {
  const db = getDb();
  
  // Find pending or failed jobs that are due for retry
  const now = new Date().toISOString();
  const jobs = await db.all(
    "SELECT * FROM payout_queue WHERE status IN ('pending', 'failed') AND next_retry_at <= ? AND attempts < 5",
    now
  );

  if (jobs.length > 0) {
    console.log(`[Payout Worker] Found ${jobs.length} jobs to process.`);
  }

  for (const job of jobs) {
    try {
      // Mark as processing
      await db.run("UPDATE payout_queue SET status = 'processing' WHERE id = ?", job.id);

      console.log(`[Payout Worker] Processing job ${job.id} - ${job.amount_sats} sats to ${job.ln_address}`);
      
      const payoutHash = await payLightningAddress(job.ln_address, job.amount_sats, job.payment_hash.startsWith('demo_'));
      
      // Success! Update job and invoice
      await db.run("UPDATE payout_queue SET status = 'completed' WHERE id = ?", job.id);
      await db.run("UPDATE invoices SET payout_status = 'forwarded' WHERE payment_hash = ?", job.payment_hash);

      // Record to ledger
      const invoice = await db.get("SELECT * FROM invoices WHERE payment_hash = ?", job.payment_hash);
      if (invoice) {
        await db.run(
          'INSERT INTO ledgers (id, payment_hash, api_key, amount_sats, commission_sats, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
          crypto.randomUUID(),
          invoice.payment_hash,
          invoice.api_key,
          invoice.amount_sats,
          invoice.commission_sats,
          new Date().toISOString()
        );
      }

      console.log(`[Payout Worker] ✅ Job ${job.id} completed. Payout hash: ${payoutHash}`);

    } catch (err: any) {
      console.error(`[Payout Worker] ❌ Job ${job.id} failed: ${err.message}`);
      
      const attempts = job.attempts + 1;
      // Exponential backoff: 1min, 5min, 15min, 30min, 60min
      const delayMins = [1, 5, 15, 30, 60][attempts - 1] || 60;
      const nextRetry = new Date(Date.now() + delayMins * 60 * 1000).toISOString();

      await db.run(
        "UPDATE payout_queue SET status = 'failed', attempts = ?, next_retry_at = ? WHERE id = ?",
        attempts,
        nextRetry,
        job.id
      );

      if (attempts >= 5) {
        console.error(`[Payout Worker] 🚨 Job ${job.id} exhausted all retries and is permanently failed.`);
      }
    }
  }
}

export function startPayoutWorker() {
  console.log('⚡ Payout Worker started (checking queue every 30 seconds)');
  setInterval(processPayoutQueue, 30 * 1000);
}
