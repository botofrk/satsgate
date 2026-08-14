const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function main() {
  const db = await open({ filename: './data/aipp.db', driver: sqlite3.Database });
  await db.run("UPDATE merchants SET usdc_address = '0x236a2bA6E2C862c5c4dfF2ff35a9cf9C1eEF217c' WHERE api_key = 'aipp_devtest'");
  console.log('✅ Updated aipp_devtest merchant with usdc_address!');
  const row = await db.get("SELECT * FROM merchants WHERE api_key = 'aipp_devtest'");
  console.log(JSON.stringify(row, null, 2));
}

main().catch(console.error);
