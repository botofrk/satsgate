import sqlite3

db_path = '/home/hermes/aipp/aipp-key/data/aipp.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT api_key, ln_address, usdc_address FROM merchants")
rows = cursor.fetchall()

print(f"Total Merchants Registered: {len(rows)}")
for r in rows:
    print(f"LN: {r[1]} | USDC: {r[2]} | Key: {r[0]}")
