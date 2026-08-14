const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const MERCHANT_KEY = 'aipp_merch_0a38484f676d4a7054ef4134ecb0362c';
const PAYOUT_ID = '8fba8b92-2bda-4dbe-ad26-99920400617d';
const NEW_LN = 'longingsavior14@walletofsatoshi.com';

async function main() {
  const db = await open({ filename: '/app/data/aipp.db', driver: sqlite3.Database });

  // Update merchant ln_address
  await db.run(
    'UPDATE merchants SET ln_address = ? WHERE api_key = ?',
    NEW_LN, MERCHANT_KEY
  );
  console.log('✅ Merchant ln_address updated to:', NEW_LN);

  // Update payout queue with new address and reset to pending
  await db.run(
    `UPDATE payout_queue 
     SET ln_address = ?, status = 'pending', attempts = 0, next_retry_at = datetime('now')
     WHERE id = ?`,
    NEW_LN, PAYOUT_ID
  );

  const updated = await db.get('SELECT * FROM payout_queue WHERE id = ?', PAYOUT_ID);
  console.log('\nUpdated payout entry:');
  console.log(JSON.stringify(updated, null, 2));
  console.log('\n✅ Payout will be retried in the next worker cycle (max 30 seconds).');

  await db.close();
}

main().catch(console.error);
