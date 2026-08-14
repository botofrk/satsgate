import { getDb, acquireTransactionLock } from '../config/database';
import crypto from 'crypto';

let isProcessing = false;

export async function processWebhookQueue() {
  if (isProcessing) return;
  isProcessing = true;

  const db = getDb();

  try {
    while (true) {
      const now = new Date().toISOString();
      let job: any = null;

      // 1. Acquire one webhook job atomically using SQLite immediate transaction and lock
      const release = await acquireTransactionLock();
      try {
        await db.run('BEGIN IMMEDIATE TRANSACTION');
        job = await db.get(
          "SELECT * FROM webhook_deliveries WHERE status IN ('pending', 'failed') AND next_retry_at <= ? AND attempts < 5 LIMIT 1",
          now
        );
        if (job) {
          await db.run("UPDATE webhook_deliveries SET status = 'processing' WHERE id = ?", job.id);
        }
        await db.run('COMMIT');
      } catch (err: any) {
        await db.run('ROLLBACK').catch(() => {});
        console.error('[Webhook Worker] Transaction error while acquiring job:', err.message);
        release();
        break; 
      } finally {
        release();
      }

      if (!job) break;

      // 2. Send the webhook with cryptographic HMAC-SHA256 signature outside the db transaction
      try {
        const rawPayload = typeof job.payload === 'string' ? job.payload : JSON.stringify(job.payload);
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signingSecret = job.api_key || 'aipp_default';

        // Calculate HMAC-SHA256 signature over timestamp + '.' + rawPayload (Standardized format)
        const signature = crypto
          .createHmac('sha256', signingSecret)
          .update(`${timestamp}.${rawPayload}`)
          .digest('hex');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const res = await fetch(job.callback_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'AIPP-Webhook/1.0',
            'X-AIPP-Timestamp': timestamp,
            'X-AIPP-Signature': `t=${timestamp},v1=${signature}`
          },
          body: rawPayload,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(`Receiver returned status ${res.status}`);
        }

        console.log(`[Webhook Worker] ✅ Callback successfully delivered to ${job.callback_url} (Job: ${job.id})`);

        // Mark as completed
        await db.run("UPDATE webhook_deliveries SET status = 'completed' WHERE id = ?", job.id);

      } catch (err: any) {
        console.error(`[Webhook Worker] ❌ Webhook delivery failed for ${job.callback_url}: ${err.message}`);
        
        const attempts = job.attempts + 1;
        const RETRY_DELAYS = [1, 5, 15, 30, 60]; // Retry delays in minutes
        const delayMins = RETRY_DELAYS[Math.min(attempts - 1, RETRY_DELAYS.length - 1)];
        const nextRetry = new Date(Date.now() + delayMins * 60 * 1000).toISOString();

        await db.run(
          "UPDATE webhook_deliveries SET status = 'failed', attempts = ?, next_retry_at = ? WHERE id = ?",
          attempts,
          nextRetry,
          job.id
        );

        if (attempts >= 5) {
          console.error(`[Webhook Worker] 🚨 Webhook job ${job.id} to ${job.callback_url} exhausted all retries.`);
        }
      }
    }
  } finally {
    isProcessing = false;
  }
}

export function startWebhookWorker() {
  console.log('⚡ Webhook Worker started (checking queue every 10 seconds)');
  setInterval(processWebhookQueue, 10 * 1000);
}
