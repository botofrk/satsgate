const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function main() {
  const apiKey = process.env.AIPP_MAINTENANCE_MERCHANT_API_KEY;
  const usdcAddress = process.env.AIPP_MAINTENANCE_USDC_ADDRESS;
  if (!apiKey || !usdcAddress || !/^0x[a-fA-F0-9]{40}$/.test(usdcAddress)) throw new Error('Protected merchant key and valid USDC address required.');
  const db = await open({ filename: process.env.DB_PATH || './data/aipp.db', driver: sqlite3.Database });
  const result = await db.run('UPDATE merchants SET usdc_address = ? WHERE api_key = ?', usdcAddress, apiKey);
  console.log(`Merchant wallet update completed; affected rows: ${result.changes || 0}.`);
  await db.close();
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
