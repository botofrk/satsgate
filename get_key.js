const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
async function run() {
  const db = await open({ filename: './data/aipp.db', driver: sqlite3.Database });
  const row = await db.get('SELECT api_key FROM merchants LIMIT 1');
  console.log(row.api_key);
}
run();
