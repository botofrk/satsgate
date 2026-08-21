import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { rotateMerchantCredential, type RotationCounts } from '../src/security/rotateMerchantCredential';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new Error('Only --apply is supported; never pass credentials as arguments.');
  const dbPath = process.env.AIPP_ROTATION_DB_PATH;
  const oldCredential = process.env.AIPP_ROTATION_OLD_CREDENTIAL || '';
  const newCredential = process.env.AIPP_ROTATION_NEW_CREDENTIAL || '';
  if (!dbPath || !oldCredential || !newCredential) throw new Error('Protected rotation environment variables are required.');
  let expectedCounts: RotationCounts | undefined;
  if (apply) {
    if (!process.env.AIPP_ROTATION_EXPECTED_COUNTS) throw new Error('Apply requires approved dry-run counts.');
    expectedCounts = JSON.parse(process.env.AIPP_ROTATION_EXPECTED_COUNTS);
  }
  const db = await open({ filename: dbPath, driver: sqlite3.Database, mode: sqlite3.OPEN_READWRITE });
  try {
    const result = await rotateMerchantCredential(db, { oldCredential, newCredential, apply, expectedCounts });
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', applied: result.applied, counts: result.counts, sessionPolicy: result.sessionPolicy }));
  } finally { await db.close(); }
}
main().catch(error => { console.error(`Rotation refused: ${error.message}`); process.exitCode = 1; });
