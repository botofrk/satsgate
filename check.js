const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('/app/data/aipp.db');

db.all('SELECT * FROM invoices ORDER BY created_at DESC LIMIT 1', (err, rows) => {
  console.log('--- LATEST INVOICE ---');
  console.log(rows);
});

db.all('SELECT * FROM payout_queue ORDER BY created_at DESC LIMIT 5', (err, rows) => {
  console.log('--- RECENT PAYOUTS ---');
  console.log(rows);
});

db.all('SELECT * FROM merchants ORDER BY created_at DESC LIMIT 1', (err, rows) => {
  console.log('--- MERCHANT ---');
  console.log(rows);
});
