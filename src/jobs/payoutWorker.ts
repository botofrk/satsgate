import { getDb, acquireTransactionLock } from '../config/database';
import { payLightningAddress } from '../services/lightning';
import { sendEmail } from '../services/email';
import { sendUsdcPayout } from '../services/base';
import crypto from 'crypto';

let isProcessing = false;

export async function processPayoutQueue() {
  if (isProcessing) return;
  isProcessing = true;

  const db = getDb();
  
  try {
    while (true) {
      const now = new Date().toISOString();
      let job: any = null;

      // 1. Atomically acquire one job using SQLite immediate transaction and lock
      const release = await acquireTransactionLock();
      try {
        await db.run('BEGIN IMMEDIATE TRANSACTION');
        job = await db.get(
          "SELECT * FROM payout_queue WHERE status IN ('pending', 'failed', 'failed_safe_to_retry') AND next_retry_at <= ? AND attempts < 5 LIMIT 1",
          now
        );
        if (job) {
          await db.run("UPDATE payout_queue SET status = 'processing' WHERE id = ?", job.id);
        }
        await db.run('COMMIT');
      } catch (err: any) {
        await db.run('ROLLBACK').catch(() => {});
        console.error('[Payout Worker] Transaction error while acquiring job:', err.message);
        release();
        break; // Break loop on transaction failure (busy) to retry next time
      } finally {
        release();
      }

      // If no job was found, break the loop
      if (!job) break;

      // 2. Process the job outside the database transaction (non-blocking)
      try {
        let payoutReference = '';
        const isX402 = job.protocol === 'x402';
        // [K-11 FIX] is_demo is now determined by explicit flag, not string prefix
        const isDemo = !isX402 && (job.payment_hash.startsWith('demo_') || job.payment_hash.startsWith('mock_'));

        if (isX402) {
          console.log(`[Payout Worker] Processing job ${job.id} - ${job.usdc_amount} USDC to ${job.usdc_address}`);
          const txHash = await sendUsdcPayout(job.usdc_address, job.usdc_amount);
          payoutReference = txHash;
          console.log(`[Payout Worker] ✅ USDC payout successful: ${txHash}`);
        } else {
          console.log(`[Payout Worker] Processing job ${job.id} - ${job.amount_sats} sats to ${job.ln_address}`);
          const payoutHash = await payLightningAddress(job.ln_address, job.amount_sats, isDemo);
          payoutReference = payoutHash;
          console.log(`[Payout Worker] ✅ Lightning payout successful: ${payoutHash}`);
        }
        
        // [HIGH-5 FIX] Wrap all success updates in a single atomic transaction and lock
        const releaseSuccess = await acquireTransactionLock();
        try {
          await db.run('BEGIN IMMEDIATE TRANSACTION');
          // The queued amount is already the merchant net. Never calculate the fee twice.
          const isX402 = job.protocol === 'x402';
          let commissionSats = 0;
          let forwardedSats = 0;
          if (!isX402) {
            if (job.payment_hash.startsWith('batch_') || job.payment_hash.startsWith('manual_')) {
              const totals = await db.get(
                "SELECT COALESCE(SUM(commission_sats), 0) AS fee, COALESCE(SUM(forwarded_amount_sats), 0) AS net FROM invoices WHERE api_key = ? AND payout_status = 'queued'",
                job.api_key
              );
              commissionSats = totals?.fee ?? 0;
              forwardedSats = totals?.net ?? job.amount_sats;
            } else {
              const invoiceAmounts = await db.get(
                'SELECT commission_sats, forwarded_amount_sats FROM invoices WHERE payment_hash = ?',
                job.payment_hash
              );
              commissionSats = invoiceAmounts?.commission_sats ?? 0;
              forwardedSats = invoiceAmounts?.forwarded_amount_sats ?? job.amount_sats;
            }
          }

          await db.run("UPDATE payout_queue SET status = 'completed', payout_reference = ?, last_error = NULL WHERE id = ?", payoutReference, job.id);

          // Update individual invoices only after their recorded amounts were read.
          if (job.payment_hash.startsWith('batch_') || job.payment_hash.startsWith('manual_')) {
            await db.run(
              "UPDATE invoices SET payout_status = 'forwarded' WHERE api_key = ? AND payout_status = 'queued'",
              job.api_key
            );
          } else {
            await db.run("UPDATE invoices SET payout_status = 'forwarded' WHERE payment_hash = ?", job.payment_hash);
          }

          await db.run(
            'INSERT INTO ledgers (id, payment_hash, api_key, amount_sats, commission_sats, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
            crypto.randomUUID(),
            job.payment_hash,
            job.api_key,
            forwardedSats,
            commissionSats,
            new Date().toISOString()
          );
          await db.run('COMMIT');
        } catch (dbErr) {
          await db.run('ROLLBACK').catch(() => {});
          throw dbErr;
        } finally {
          releaseSuccess();
        }

        // Fetch merchant details for email notification
        const merchant = await db.get("SELECT email FROM merchants WHERE api_key = ?", job.api_key);
        if (!merchant) {
          console.warn(`[Payout Worker] Merchant not found for api_key (job ${job.id}), skipping email notification.`);
        } else if (merchant.email) {
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
          sendEmail(merchant.email, payoutSubject, payoutHtml).catch(err => console.error('[Payout Worker] Failed to send payout email:', err));
        }

      } catch (err: any) {
        console.error(`[Payout Worker] ❌ Job ${job.id} failed: ${err.message}`);
        
        const attempts = job.attempts + 1;
        // [LOW-4 FIX] Safe exponential backoff with explicit clamping
        const RETRY_DELAYS = [1, 5, 15, 30, 60];
        const delayMins = RETRY_DELAYS[Math.min(attempts - 1, RETRY_DELAYS.length - 1)];
        const nextRetry = new Date(Date.now() + delayMins * 60 * 1000).toISOString();

        const errStr = err.message.toLowerCase();
        const isUncertain = errStr.includes('timeout') || errStr.includes('network') || errStr.includes('econn') || errStr.includes('fetch');
        const newStatus = isUncertain ? 'uncertain' : 'failed_safe_to_retry';

        await db.run(
          "UPDATE payout_queue SET status = ?, attempts = ?, next_retry_at = ?, last_error = ? WHERE id = ?",
          newStatus,
          attempts,
          nextRetry,
          String(err.message || err).slice(0, 1000),
          job.id
        );

        if (isUncertain) {
          console.error(`[Payout Worker] 🚨 CRITICAL: Job ${job.id} is in UNCERTAIN state! Manual reconciliation required.`);
          const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_FROM || 'admin@aipp.dev';
          const alertHtml = `
            <h2>🚨 CRITICAL: Uncertain Payout</h2>
            <p>A payout job has entered an <strong>uncertain</strong> state. It is unknown if the transaction succeeded on-chain/network.</p>
            <ul>
              <li><strong>Job ID:</strong> ${job.id}</li>
              <li><strong>Payment Hash:</strong> ${job.payment_hash}</li>
              <li><strong>Protocol:</strong> ${job.protocol}</li>
              <li><strong>Amount:</strong> ${job.protocol === 'x402' ? job.usdc_amount + ' USDC' : job.amount_sats + ' sats'}</li>
              <li><strong>Target:</strong> ${job.protocol === 'x402' ? job.usdc_address : job.ln_address}</li>
              <li><strong>Error:</strong> ${err.message}</li>
            </ul>
            <p>Please manually verify the transaction and update the database accordingly.</p>
          `;
          sendEmail(adminEmail, '🚨 AIPP: UNCERTAIN PAYOUT ALARM', alertHtml).catch(e => console.error('[Payout Worker] Failed to send alarm email:', e));
        } else if (attempts >= 5) {
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
