import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import crypto from 'crypto';
import { IS_PRODUCTION } from './env';

let dbInstance: Database | null = null;

export async function initDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  dbInstance = await open({
    filename: process.env.DB_PATH || './data/aipp.db', // Use data dir by default, or override for local tests
    driver: sqlite3.Database,
  });

  // Enable foreign keys and WAL mode for better concurrency
  await dbInstance.exec('PRAGMA foreign_keys = ON;');
  await dbInstance.exec('PRAGMA journal_mode = WAL;');

  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS merchants (
      api_key TEXT PRIMARY KEY,
      ln_address TEXT NOT NULL UNIQUE,
      payout_mode TEXT NOT NULL DEFAULT 'instant',
      payout_threshold_sats INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
      payment_hash TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      amount_sats INTEGER NOT NULL,
      commission_sats INTEGER NOT NULL,
      forwarded_amount_sats INTEGER NOT NULL,
      status TEXT NOT NULL,
      payout_status TEXT NOT NULL DEFAULT 'none',
      callback_url TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ledgers (
      id TEXT PRIMARY KEY,
      payment_hash TEXT NOT NULL,
      api_key TEXT NOT NULL,
      amount_sats INTEGER NOT NULL,
      commission_sats INTEGER NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_spend (
      api_key TEXT NOT NULL,
      date TEXT NOT NULL,
      usd_amount REAL NOT NULL DEFAULT 0,
      requests_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (api_key, date)
    );

    CREATE TABLE IF NOT EXISTS payout_queue (
      id TEXT PRIMARY KEY,
      payment_hash TEXT NOT NULL,
      api_key TEXT NOT NULL,
      amount_sats INTEGER NOT NULL,
      ln_address TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, failed, completed
      attempts INTEGER NOT NULL DEFAULT 0,
      next_retry_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  console.log('⚡ SQLite Database file initialized (aipp.db).');

  // Pre-seed a developer test key — only in development mode
  if (!IS_PRODUCTION) {
    const devKey = 'aipp_devtest';
    const existingDevKey = await dbInstance.get('SELECT * FROM merchants WHERE api_key = ?', devKey);
    if (!existingDevKey) {
      await dbInstance.run(
        'INSERT OR IGNORE INTO merchants (api_key, ln_address, payout_mode, payout_threshold_sats, created_at) VALUES (?, ?, ?, ?, ?)',
        devKey,
        'devtest@aipp.dev',
        'instant',
        0,
        new Date().toISOString()
      );

      // Add mock transaction
      const mockHash = 'demo_mock_payout_' + crypto.randomBytes(8).toString('hex');
      await dbInstance.run(
        'INSERT INTO invoices (payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, status, payout_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        mockHash,
        devKey,
        1000,
        10,
        990,
        'settled',
        'forwarded',
        new Date().toISOString()
      );
    }
  }

  return dbInstance;
}

export function getDb(): Database {
  if (!dbInstance) {
    throw new Error('Database not initialized! Call initDb() first.');
  }
  return dbInstance;
}
