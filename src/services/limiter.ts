import { getDb } from '../config/database';
import { DAILY_LIMIT_USD } from '../config/env';
import { AppError } from '../utils/error';

export async function checkLimit(apiKey: string, costUsd: number): Promise<void> {
  const db = getDb();
  const todayUtc = new Date().toISOString().split('T')[0];
  let record = await db.get('SELECT * FROM daily_spend WHERE api_key = ? AND date = ?', apiKey, todayUtc);

  if (!record) {
    record = { api_key: apiKey, date: todayUtc, usd_amount: 0, requests_count: 0 };
    await db.run(
      'INSERT INTO daily_spend (api_key, date, usd_amount, requests_count) VALUES (?, ?, ?, ?)',
      apiKey, todayUtc, 0, 0
    );
  }

  if (record.usd_amount + costUsd > DAILY_LIMIT_USD) {
    throw new AppError(`Daily limit reached ($${DAILY_LIMIT_USD}). Resets at midnight UTC.`, 429, 'DAILY_LIMIT_EXCEEDED');
  }
}
