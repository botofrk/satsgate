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

  // Enable foreign keys and WAL mode for better concurrency, set busy timeout
  await dbInstance.exec('PRAGMA foreign_keys = ON;');
  await dbInstance.exec('PRAGMA journal_mode = WAL;');
  await dbInstance.exec('PRAGMA busy_timeout = 5000;');

  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS merchants (
      api_key TEXT PRIMARY KEY,
      ln_address TEXT NOT NULL UNIQUE,
      email TEXT,
      payout_mode TEXT NOT NULL DEFAULT 'instant',
      payout_threshold_sats INTEGER NOT NULL DEFAULT 0,
      usdc_address TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
      payment_hash TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      amount_sats INTEGER,
      commission_sats INTEGER,
      forwarded_amount_sats INTEGER,
      status TEXT NOT NULL,
      payout_status TEXT NOT NULL DEFAULT 'none',
      callback_url TEXT,
      protocol TEXT NOT NULL DEFAULT 'L402',
      usdc_amount REAL,
      usdc_amount_units INTEGER,
      service_fee_usdc_units INTEGER,
      net_usdc_units INTEGER,
      preimage TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoice_idempotency (
      merchant_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      invoice_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (merchant_id, idempotency_key),
      FOREIGN KEY (invoice_id) REFERENCES invoices(payment_hash)
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
      amount_sats INTEGER,
      ln_address TEXT,
      protocol TEXT NOT NULL DEFAULT 'L402',
      usdc_address TEXT,
      usdc_amount REAL,
      status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, failed, completed
      payout_reference TEXT,
      last_error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_retry_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      question TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS waitlist (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      ln_address TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY,
      callback_url TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      api_key TEXT,
      next_retry_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recovery_challenges (
      id TEXT PRIMARY KEY,
      address TEXT NOT NULL,
      address_type TEXT NOT NULL,
      nonce TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS merchant_passkeys (
      id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      credential_id TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT,
      device_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      FOREIGN KEY (api_key) REFERENCES merchants(api_key) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS webauthn_challenges (
      id TEXT PRIMARY KEY,
      challenge_hash TEXT NOT NULL,
      ceremony_type TEXT NOT NULL,
      api_key TEXT,
      temp_registration_id TEXT,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS merchant_sessions (
      id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (api_key) REFERENCES merchants(api_key) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payment_links (
      id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      title TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      redirect_url TEXT NOT NULL,
      capability_type TEXT NOT NULL DEFAULT 'link',
      description TEXT,
      input_schema TEXT,
      output_schema TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Performance indexes on hot query paths
  await dbInstance.exec(`
    CREATE INDEX IF NOT EXISTS idx_invoices_api_key ON invoices (api_key);
    CREATE INDEX IF NOT EXISTS idx_invoices_api_key_status ON invoices (api_key, status);
    CREATE INDEX IF NOT EXISTS idx_invoices_payout_status ON invoices (api_key, status, payout_status);
    CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices (api_key, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_payout_queue_status ON payout_queue (status, next_retry_at);
    CREATE INDEX IF NOT EXISTS idx_ledgers_api_key ON ledgers (api_key);
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries (status, next_retry_at);
    CREATE INDEX IF NOT EXISTS idx_payment_links_api_key ON payment_links (api_key);
  `);

  // Migration: Add email column if it doesn't exist
  try {
    await dbInstance.exec('ALTER TABLE merchants ADD COLUMN email TEXT;');
  } catch (err) {
    // Column already exists, ignore
  }

  // Migration: Add usdc_address column to merchants
  try {
    await dbInstance.exec('ALTER TABLE merchants ADD COLUMN usdc_address TEXT;');
  } catch (err) {
    // Ignore
  }

  // Migration: Add protocol column to invoices
  try {
    await dbInstance.exec("ALTER TABLE invoices ADD COLUMN protocol TEXT NOT NULL DEFAULT 'L402';");
  } catch (err) {
    // Ignore
  }

  // Migration: Add usdc_amount column to invoices
  try {
    await dbInstance.exec('ALTER TABLE invoices ADD COLUMN usdc_amount REAL;');
  } catch (err) {
    // Ignore
  }

  // Migration: Add preimage column to invoices
  try {
    await dbInstance.exec('ALTER TABLE invoices ADD COLUMN preimage TEXT;');
  } catch (err) {
    // Ignore
  }
  
  // Now we can safely index it
  await dbInstance.exec('CREATE INDEX IF NOT EXISTS idx_invoices_preimage ON invoices (preimage);');

  // Migration: Add protocol column to payout_queue
  try {
    await dbInstance.exec("ALTER TABLE payout_queue ADD COLUMN protocol TEXT NOT NULL DEFAULT 'L402';");
  } catch (err) {
    // Ignore
  }

  // Migration: Add usdc_address column to payout_queue
  try {
    await dbInstance.exec('ALTER TABLE payout_queue ADD COLUMN usdc_address TEXT;');
  } catch (err) {
    // Ignore
  }

  // Migration: Add usdc_amount column to payout_queue
  try {
    await dbInstance.exec('ALTER TABLE payout_queue ADD COLUMN usdc_amount REAL;');
  } catch (err) {
    // Ignore
  }

  try {
    await dbInstance.exec('ALTER TABLE payout_queue ADD COLUMN payout_reference TEXT;');
  } catch (err) {
    // Ignore
  }

  try {
    await dbInstance.exec('ALTER TABLE payout_queue ADD COLUMN last_error TEXT;');
  } catch (err) {
    // Ignore
  }

  // Migration: Add api_key column to webhook_deliveries
  try {
    await dbInstance.exec('ALTER TABLE webhook_deliveries ADD COLUMN api_key TEXT;');
  } catch (err) {
    // Ignore
  }

  // Open Tag migrations. Invoices are bound to the exact priced capability so
  // a proof for one tag cannot unlock another tag owned by the same merchant.
  for (const migration of [
    "ALTER TABLE payment_links ADD COLUMN capability_type TEXT NOT NULL DEFAULT 'link';",
    'ALTER TABLE payment_links ADD COLUMN description TEXT;',
    'ALTER TABLE payment_links ADD COLUMN input_schema TEXT;',
    'ALTER TABLE payment_links ADD COLUMN output_schema TEXT;',
    'ALTER TABLE invoices ADD COLUMN tag_id TEXT;'
  ]) {
    try {
      await dbInstance.exec(migration);
    } catch (err) {
      // Column already exists.
    }
  }
  await dbInstance.exec('CREATE INDEX IF NOT EXISTS idx_invoices_tag_id ON invoices (tag_id, status);');

  console.log('⚡ SQLite Database file initialized (aipp.db).');

  // Seed permanent demo merchant and Smart Tag ('demo') for autonomous agent testing
  const devKey = 'aipp_devtest';
  await dbInstance.run(
    'INSERT OR IGNORE INTO merchants (api_key, ln_address, usdc_address, payout_mode, payout_threshold_sats, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    devKey,
    'longingsavior14@walletofsatoshi.com',
    '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    'instant',
    0,
    new Date().toISOString()
  );
  await dbInstance.run("UPDATE merchants SET ln_address = 'longingsavior14@walletofsatoshi.com', payout_mode = 'instant' WHERE api_key = ?", devKey);

  const existingDemoTag = await dbInstance.get('SELECT * FROM payment_links WHERE id = ?', 'demo');
  if (!existingDemoTag) {
    await dbInstance.run(
      `INSERT INTO payment_links (id, api_key, title, amount_usd, redirect_url, capability_type, description, input_schema, output_schema, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'demo',
      devKey,
      'AIPP Agent Autonomous Test',
      0.01,
      'https://aipp.dev/t/demo/content',
      'api',
      'Test AIPP autonomous HTTP 402 payment flow ($0.01 test tag).',
      JSON.stringify({ type: 'object', properties: { query: { type: 'string', description: 'Optional test input' } } }),
      JSON.stringify({ type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } }),
      new Date().toISOString()
    );
  }

  return dbInstance;
}

export function getDb(): Database {
  if (!dbInstance) {
    throw new Error('Database not initialized! Call initDb() first.');
  }
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}

let currentTransactionPromise: Promise<void> = Promise.resolve();

export function acquireTransactionLock(): Promise<() => void> {
  let release: () => void;
  const nextPromise = new Promise<void>(resolve => {
    release = resolve;
  });
  const waitPromise = currentTransactionPromise;
  currentTransactionPromise = nextPromise;
  return waitPromise.then(() => release);
}
