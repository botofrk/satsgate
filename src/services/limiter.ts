import { getDb, acquireTransactionLock } from '../config/database';
import { DAILY_LIMIT_USD } from '../config/env';
import { AppError } from '../utils/error';

export async function checkLimit(apiKey: string, costUsd: number): Promise<void> {
  const db = getDb();
  const todayUtc = new Date().toISOString().split('T')[0];

  // Atomic upsert + check inside a mutex-locked transaction to prevent race conditions.
  const release = await acquireTransactionLock();
  try {
    await db.run('BEGIN IMMEDIATE');
    // Upsert the row first (so we always have a row to lock on)
    await db.run(
      'INSERT OR IGNORE INTO daily_spend (api_key, date, usd_amount, requests_count) VALUES (?, ?, 0, 0)',
      apiKey, todayUtc
    );

    const record = await db.get(
      'SELECT usd_amount FROM daily_spend WHERE api_key = ? AND date = ?',
      apiKey, todayUtc
    );

    if ((record?.usd_amount || 0) + costUsd > DAILY_LIMIT_USD) {
      await db.run('ROLLBACK');
      throw new AppError(`Daily limit reached ($${DAILY_LIMIT_USD}). Resets at midnight UTC.`, 429, 'DAILY_LIMIT_EXCEEDED');
    }

    await db.run(
      'UPDATE daily_spend SET usd_amount = usd_amount + ?, requests_count = requests_count + 1 WHERE api_key = ? AND date = ?',
      costUsd, apiKey, todayUtc
    );

    await db.run('COMMIT');
  } catch (err) {
    try { await db.run('ROLLBACK'); } catch (_) { /* already committed or rolled back */ }
    throw err;
  } finally {
    release();
  }
}
