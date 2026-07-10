import { getDb } from '../config/database';
import { payLightningAddress } from '../services/lightning';
import { sendEmail } from '../services/email';
import { sendUsdcPayout } from '../services/base';
import crypto from 'crypto';

let isProcessing = false;

export async function processPayoutQueue() {
  if (isProcessing) return;
  isProcessing = true;

  const db = getDb();
  
  // Find pending or failed jobs that are due for retry
  const now = new Date().toISOString();
  try {
    const jobs = await db.all(
      "SELECT * FROM payout_queue WHERE status IN ('pending', 'failed') AND next_retry_at <= ? AND attempts < 5 LIMIT 50",
      now
    );

    if (jobs.length > 0) {
      console.log(`[Payout Worker] Found ${jobs.length} jobs to process.`);
    }

    for (const job of jobs) {
      try {
        // Mark as processing
        await db.run("UPDATE payout_queue SET status = 'processing' WHERE id = ?", job.id);

        const isX402 = job.protocol === 'x402';

        if (isX402) {
          console.log(`[Payout Worker] Processing job ${job.id} - ${job.usdc_amount} USDC to ${job.usdc_address}`);
          // Send USDC on Base using derived private key wallet
          const txHash = await sendUsdcPayout(job.usdc_address, job.usdc_amount);
          console.log(`[Payout Worker] ✅ USDC payout successful: ${txHash}`);
        } else {
          console.log(`[Payout Worker] Processing job ${job.id} - ${job.amount_sats} sats to ${job.ln_address}`);
          const payoutHash = await payLightningAddress(job.ln_address, job.amount_sats, job.payment_hash.startsWith('demo_'));
          console.log(`[Payout Worker] ✅ Lightning payout successful: ${payoutHash}`);
        }
        
        // Success! Update job status
        await db.run("UPDATE payout_queue SET status = 'completed' WHERE id = ?", job.id);

        // Update individual invoices
        if (job.payment_hash.startsWith('batch_')) {
          await db.run(
            "UPDATE invoices SET payout_status = 'forwarded' WHERE api_key = ? AND payout_status = 'queued'",
            job.api_key
          );
        } else {
          await db.run("UPDATE invoices SET payout_status = 'forwarded' WHERE payment_hash = ?", job.payment_hash);
        }

        // Record to ledger
        await db.run(
          'INSERT INTO ledgers (id, payment_hash, api_key, amount_sats, commission_sats, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
          crypto.randomUUID(),
          job.payment_hash,
          job.api_key,
          isX402 ? 0 : job.amount_sats,
          0,
          new Date().toISOString()
        );

        // Fetch merchant details for email notification
        const merchant = await db.get("SELECT email FROM merchants WHERE api_key = ?", job.api_key);
        if (merchant && merchant.email) {
          const payoutSubject = isX402 
            ? `🔵 USDC Payout completed: ${job.usdc_amount} USDC sent!`
            : `⚡ Payout completed: ${job.amount_sats} sats sent!`;

          const amountLabel = isX402 ? 'Amount (USDC):' : 'Amount:';
          const amountVal = isX402 ? `${job.usdc_amount} USDC` : `${job.amount_sats} satoshis`;
          const destLabel = isX402 ? 'Base USDC Wallet:' : 'Destination:';
          const destVal = isX402 ? job.usdc_address : job.ln_address;

          const payoutHtml = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 2px solid #000; box-shadow: 4px 4px 0 #000; border-radius: 8px;">
              <h2 style="font-size: 24px; font-weight: 800; margin-bottom: 20px; text-transform: uppercase; color: #000;">${isX402 ? '🔵' : '⚡'} AIPP Payout Notification</h2>
              <p>Hello,</p>
              <p>We have successfully forwarded your accumulated earnings to your address.</p>
              <table style="width: 100%; border-collapse: collapse; margin: 20px 0; border: 2px solid #000;">
                <tr style="background: #f3f4f6;">
                  <td style="padding: 10px; border-bottom: 1px solid #000; font-weight: bold;">${amountLabel}</td>
                  <td style="padding: 10px; border-bottom: 1px solid #000; font-family: monospace;">${amountVal}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border-bottom: 1px solid #000; font-weight: bold;">${destLabel}</td>
                  <td style="padding: 10px; border-bottom: 1px solid #000; font-family: monospace;">${destVal}</td>
                </tr>
                <tr style="background: #f3f4f6;">
                  <td style="padding: 10px; font-weight: bold;">Transaction Key:</td>
                  <td style="padding: 10px; font-family: monospace; font-size: 12px; word-break: break-all;">${job.payment_hash}</td>
                </tr>
              </table>
              <p>Your funds should arrive in your wallet shortly. If you experience any delays, please verify the routing path or contact our support team.</p>
              <p>Best regards,<br>AIPP Team</p>
            </div>
          `;
          sendEmail(merchant.email, payoutSubject, payoutHtml).catch(err => console.error('Failed to send payout email:', err));
        }

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
  } finally {
    isProcessing = false;
  }
}

export function startPayoutWorker() {
  console.log('⚡ Payout Worker started (checking queue every 30 seconds)');
  setInterval(processPayoutQueue, 30 * 1000);
}
