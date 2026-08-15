import sqlite3

db_path = '/home/hermes/aipp/aipp-key/data/aipp.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

target_key = 'aipp_merch_03275bb9a6aac74ad7026728e2be6cf1'
target_ln = 'nosycadet34@phoenixwallet.me'

print(f"Deleting records for API Key: {target_key} / LN: {target_ln}")

cursor.execute("DELETE FROM merchant_passkeys WHERE api_key = ?", (target_key,))
cursor.execute("DELETE FROM merchant_sessions WHERE api_key = ?", (target_key,))
cursor.execute("DELETE FROM payout_queue WHERE api_key = ?", (target_key,))
cursor.execute("DELETE FROM invoices WHERE api_key = ?", (target_key,))
cursor.execute("DELETE FROM payment_links WHERE api_key = ?", (target_key,))
cursor.execute("DELETE FROM merchants WHERE api_key = ? OR ln_address = ?", (target_key, target_ln))

conn.commit()
print("Merchant records successfully purged from DB!")
