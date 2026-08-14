const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const MERCHANT_KEY = 'aipp_merch_0a38484f676d4a7054ef4134ecb0362c';

async function main() {
  const db = await open({ filename: '/app/data/aipp.db', driver: sqlite3.Database });

  // invoices use 'api_key' not 'merchant_api_key'
  const invoices = await db.all(
    'SELECT * FROM invoices WHERE api_key = ? ORDER BY rowid DESC LIMIT 20',
    MERCHANT_KEY
  );
  console.log('\n=== INVOICES ===');
  for (const inv of invoices) {
    console.log(`  hash: ${inv.payment_hash?.slice(0,16)}... | protocol: ${inv.protocol} | ${inv.amount_sats}sats | status: ${inv.status} | payout: ${inv.payout_status} | ${inv.created_at}`);
  }

  // ledgers
  const ledgers = await db.all(
    'SELECT * FROM ledgers WHERE api_key = ? ORDER BY rowid DESC LIMIT 20',
    MERCHANT_KEY
  );
  console.log('\n=== LEDGERS ===');
  console.log(JSON.stringify(ledgers, null, 2));

  // payout_queue
  const payouts = await db.all(
    'SELECT * FROM payout_queue WHERE api_key = ? ORDER BY rowid DESC LIMIT 20',
    MERCHANT_KEY
  );
  console.log('\n=== PAYOUT_QUEUE ===');
  console.log(JSON.stringify(payouts, null, 2));

  // balance summary
  const settled = invoices.filter(i => i.status === 'settled');
  const totalSats = settled.reduce((s, i) => s + (i.amount_sats || 0), 0);
  const totalComm = settled.reduce((s, i) => s + (i.commission_sats || 0), 0);
  const net = totalSats - totalComm;
  console.log(`\n=== SUMMARY ===`);
  console.log(`Settled invoices: ${settled.length}`);
  console.log(`Gross: ${totalSats} sats | Commission: ${totalComm} sats | Net: ${net} sats`);

  await db.close();
}

main().catch(console.error);
