const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const fs = require('fs');

async function migrate() {
  const dbPath = process.env.DB_PATH || './data/aipp.db';
  console.log('Migrating DB:', dbPath);

  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  
  try {
    await db.exec('ALTER TABLE invoices ADD COLUMN usdc_amount_units INTEGER;');
    console.log('Added usdc_amount_units');
  } catch (e) { console.log('usdc_amount_units probably exists:', e.message); }

  try {
    await db.exec('ALTER TABLE invoices ADD COLUMN service_fee_usdc_units INTEGER;');
    console.log('Added service_fee_usdc_units');
  } catch (e) { console.log('service_fee_usdc_units probably exists:', e.message); }

  try {
    await db.exec('ALTER TABLE invoices ADD COLUMN net_usdc_units INTEGER;');
    console.log('Added net_usdc_units');
  } catch (e) { console.log('net_usdc_units probably exists:', e.message); }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_idempotency (
      merchant_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      invoice_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (merchant_id, idempotency_key),
      FOREIGN KEY (invoice_id) REFERENCES invoices(payment_hash)
    );
  `);
  console.log('Created invoice_idempotency table');
  
  await db.close();
  console.log('Migration Complete');
}

migrate();
