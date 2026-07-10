import { getDb } from '../config/database';

export async function processPruning() {
  try {
    const db = getDb();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Find all merchants created more than 30 days ago
    const merchants = await db.all('SELECT * FROM merchants WHERE created_at < ?', thirtyDaysAgo);

    let prunedCount = 0;

    for (const merchant of merchants) {
      // 2. Check if they have ANY invoices in the last 30 days
      const recentInvoice = await db.get(
        'SELECT payment_hash FROM invoices WHERE api_key = ? AND created_at >= ? LIMIT 1',
        merchant.api_key,
        thirtyDaysAgo
      );

      if (recentInvoice) {
        continue; // They are active
      }

      // 3. Check if they have any pending balance (trapped funds)
      const pendingFunds = await db.get(
        "SELECT SUM(forwarded_amount_sats) as total FROM invoices WHERE api_key = ? AND status = 'settled' AND payout_status IN ('pending_threshold', 'pending_manual')",
        merchant.api_key
      );

      if (pendingFunds && pendingFunds.total > 0) {
        continue; // They have trapped funds, do not delete
      }

      // 4. Safe to prune. Delete all related data, then the merchant.
      await db.run('BEGIN EXCLUSIVE TRANSACTION');
      try {
        await db.run('DELETE FROM invoices WHERE api_key = ?', merchant.api_key);
        await db.run('DELETE FROM daily_spend WHERE api_key = ?', merchant.api_key);
        await db.run('DELETE FROM ledgers WHERE api_key = ?', merchant.api_key);
        await db.run('DELETE FROM merchants WHERE api_key = ?', merchant.api_key);
        await db.run('COMMIT');
        
        console.log(`[Prune Worker] 🗑️ Pruned inactive merchant: ${merchant.ln_address}`);
        prunedCount++;
      } catch (err) {
        try { await db.run('ROLLBACK'); } catch (_) { /* already rolled back */ }
        console.error(`[Prune Worker] Failed to prune merchant ${merchant.ln_address}:`, err);
      }
    }

    if (prunedCount > 0) {
      console.log(`[Prune Worker] Finished pruning. Removed ${prunedCount} inactive merchants.`);
    }

  } catch (err) {
    console.error('[Prune Worker] Error running prune job:', err);
  }
}

export function startPruneWorker() {
  // Run once immediately on startup, then every 24 hours
  processPruning();
  setInterval(processPruning, 24 * 60 * 60 * 1000);
}
