const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./data/aipp.db');
db.run('DELETE FROM merchants', (err) => {
  if (err) console.error(err);
  else console.log('merchants deleted');
});
db.run('DELETE FROM invoices', (err) => {
  if (err) console.error(err);
  else console.log('invoices deleted');
});
