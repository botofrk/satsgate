import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import { rotateMerchantCredential, type ApprovedPreflight, type RotationCounts } from '../src/security/rotateMerchantCredential';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const allowExistingOrphansUnchanged = process.argv.includes('--allow-existing-orphans-unchanged');
  if (process.argv.slice(2).some(arg => !['--apply', '--allow-existing-orphans-unchanged'].includes(arg))) throw new Error('Only guarded mode flags are supported; never pass credentials as arguments.');
  const dbPath = process.env.AIPP_ROTATION_DB_PATH;
  const oldCredential = process.env.AIPP_ROTATION_OLD_CREDENTIAL || '';
  const newCredential = process.env.AIPP_ROTATION_NEW_CREDENTIAL || '';
  if (!dbPath || !oldCredential || !newCredential) throw new Error('Protected rotation environment variables are required.');
  let expectedCounts: RotationCounts | undefined;
  let approvedPreflight: ApprovedPreflight | undefined;
  const artifactPath = process.env.AIPP_ROTATION_APPROVED_PREFLIGHT_FILE;
  if (apply) {
    if (!process.env.AIPP_ROTATION_EXPECTED_COUNTS) throw new Error('Apply requires approved dry-run counts.');
    expectedCounts = JSON.parse(process.env.AIPP_ROTATION_EXPECTED_COUNTS);
    if (allowExistingOrphansUnchanged) {
      if (!artifactPath) throw new Error('Apply with existing orphans requires an approved preflight file.');
      approvedPreflight = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    }
  }
  const stat = fs.statSync(dbPath);
  const db = await open({ filename: dbPath, driver: sqlite3.Database, mode: apply ? sqlite3.OPEN_READWRITE : sqlite3.OPEN_READONLY });
  try {
    const result = await rotateMerchantCredential(db, { oldCredential, newCredential, apply, expectedCounts, allowExistingOrphansUnchanged, approvedPreflight, dbIdentity: { size: stat.size, mtimeMs: stat.mtimeMs } });
    if (!apply && artifactPath) fs.writeFileSync(artifactPath, JSON.stringify(result.approvedPreflight, null, 2), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', applied: result.applied, counts: result.counts, orphanCount: result.orphanCount, orphanBaselineDigest: result.approvedPreflight.digest, sessionPolicy: result.sessionPolicy }));
  } finally { await db.close(); }
}
main().catch(error => {
  const artifactPath = process.env.AIPP_ROTATION_APPROVED_PREFLIGHT_FILE;
  if (error.approvedPreflight && artifactPath && !fs.existsSync(artifactPath)) fs.writeFileSync(artifactPath, JSON.stringify(error.approvedPreflight, null, 2), { mode: 0o600, flag: 'wx' });
  console.error(`Rotation refused: ${error.message}`); process.exitCode = 1;
});
