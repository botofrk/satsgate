const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('/app/data/aipp.db');
db.run("DELETE FROM merchants WHERE ln_address = 'longingsavior14@walletofsatoshi.com'", function(err) {
  if (err) console.error(err);
  else console.log('Deleted rows:', this.changes);
});
