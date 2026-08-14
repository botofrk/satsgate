const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function main() {
  const db = await open({ filename: '/app/data/aipp.db', driver: sqlite3.Database });

  const invoices = await db.all(
    'SELECT payment_hash, api_key, amount_sats, protocol, status, payout_status, created_at FROM invoices ORDER BY rowid DESC LIMIT 10'
  );

  console.log('\n=== LAST 10 INVOICES ===');
  for (const inv of invoices) {
    console.log(`  [${inv.created_at}] api_key: ${inv.api_key?.slice(0,20)}... | ${inv.amount_sats}sats | ${inv.protocol} | status: ${inv.status} | hash: ${inv.payment_hash?.slice(0,16)}...`);
  }

  await db.close();
}

main().catch(console.error);
