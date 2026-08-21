import crypto from 'crypto';
import type { Database } from 'sqlite';

export const IDENTITY_COLUMNS = {
  merchants: 'api_key', invoices: 'api_key', payment_links: 'api_key', payout_queue: 'api_key',
  daily_spend: 'api_key', ledgers: 'api_key', webhook_deliveries: 'api_key', invoice_idempotency: 'merchant_id',
  merchant_sessions: 'api_key', merchant_passkeys: 'api_key', webauthn_challenges: 'api_key'
} as const;
export type RotationCounts = Record<keyof typeof IDENTITY_COLUMNS, number>;
export interface DbIdentity { size: number; mtimeMs: number }
export interface OrphanTableBaseline { count: number; identityFingerprints: string[]; rowFingerprints: string[] }
export interface ApprovedPreflightPayload { version: 1; createdAt: string; schemaFingerprint: string; targetFingerprint: string; counts: RotationCounts; orphans: Record<string, OrphanTableBaseline>; dbIdentity: DbIdentity }
export interface ApprovedPreflight { payload: ApprovedPreflightPayload; digest: string }
export interface RotationOptions { oldCredential: string; newCredential: string; apply?: boolean; expectedCounts?: RotationCounts; allowExistingOrphansUnchanged?: boolean; approvedPreflight?: ApprovedPreflight; dbIdentity?: DbIdentity; maxArtifactAgeMs?: number; beforeCommit?: () => void | Promise<void> }
export interface RotationResult { applied: boolean; counts: RotationCounts; sessionPolicy: 'revoke-and-migrate'; approvedPreflight: ApprovedPreflight; orphanCount: number }

const canonical = (value: unknown): string => value === null || typeof value !== 'object'
  ? JSON.stringify(value)
  : Array.isArray(value)
    ? `[${value.map(canonical).join(',')}]`
    : `{${Object.keys(value as object).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const shortFingerprint = (value: string) => sha256(value).slice(0, 16);

async function verifySchema(db: Database): Promise<string> {
  const tables = await db.all<Array<{ name: string; sql: string }>>('SELECT name,sql FROM sqlite_master WHERE type = ? AND name NOT LIKE ? ORDER BY name', 'table', 'sqlite_%');
  const found = new Map<string, Set<string>>();
  for (const { name } of tables) {
    const columns = await db.all<Array<{ name: string }>>(`PRAGMA table_info(${JSON.stringify(name)})`);
    found.set(name, new Set(columns.map(column => column.name)));
  }
  const known = new Set(Object.entries(IDENTITY_COLUMNS).map(([table, column]) => `${table}.${column}`));
  for (const [table, column] of Object.entries(IDENTITY_COLUMNS)) if (!found.get(table)?.has(column)) throw new Error(`Missing identity column: ${table}.${column}`);
  const unexpected: string[] = [];
  for (const [table, columns] of found) for (const column of columns) if ((column === 'api_key' || column === 'merchant_id') && !known.has(`${table}.${column}`)) unexpected.push(`${table}.${column}`);
  if (unexpected.length) throw new Error(`Unaccounted identity columns: ${unexpected.sort().join(', ')}`);
  return sha256(canonical(tables.map(t => ({ name: t.name, sql: t.sql }))));
}

async function countsFor(db: Database, credential: string): Promise<RotationCounts> {
  return Object.fromEntries(await Promise.all(Object.entries(IDENTITY_COLUMNS).map(async ([table, column]) => {
    const row = await db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`, credential);
    return [table, Number(row?.count || 0)] as const;
  }))) as RotationCounts;
}

async function orphanBaseline(db: Database, target: string): Promise<{ tables: Record<string, OrphanTableBaseline>; targetCount: number; total: number }> {
  const tables: Record<string, OrphanTableBaseline> = {}; let targetCount = 0; let total = 0;
  for (const [table, column] of Object.entries(IDENTITY_COLUMNS)) {
    if (table === 'merchants') continue;
    const rows = await db.all<Array<Record<string, unknown>>>(`SELECT c.* FROM ${table} c LEFT JOIN merchants m ON c.${column}=m.api_key WHERE c.${column} IS NOT NULL AND m.api_key IS NULL`);
    const identityFingerprints: string[] = []; const rowFingerprints: string[] = [];
    for (const row of rows) {
      const identity = String(row[column]); if (identity === target) targetCount++;
      identityFingerprints.push(shortFingerprint(identity)); rowFingerprints.push(sha256(canonical(row)));
    }
    tables[table] = { count: rows.length, identityFingerprints: identityFingerprints.sort(), rowFingerprints: rowFingerprints.sort() }; total += rows.length;
  }
  return { tables, targetCount, total };
}

const sameCounts = (a: RotationCounts, b: RotationCounts) => Object.keys(IDENTITY_COLUMNS).every(key => a[key as keyof RotationCounts] === b[key as keyof RotationCounts]);
const sameOrphans = (a: Record<string, OrphanTableBaseline>, b: Record<string, OrphanTableBaseline>) => canonical(a) === canonical(b);
export const sealApprovedPreflight = (payload: ApprovedPreflightPayload): ApprovedPreflight => ({ payload, digest: sha256(canonical(payload)) });
export function verifyApprovedPreflight(artifact: ApprovedPreflight, maxAgeMs = 24 * 60 * 60 * 1000): void {
  if (!artifact || artifact.digest !== sha256(canonical(artifact.payload))) throw new Error('Approved preflight artifact digest is invalid.');
  const created = Date.parse(artifact.payload.createdAt);
  if (artifact.payload.version !== 1 || !Number.isFinite(created) || Date.now() - created > maxAgeMs || created > Date.now() + 60_000) throw new Error('Approved preflight artifact is stale.');
}

export async function rotateMerchantCredential(db: Database, options: RotationOptions): Promise<RotationResult> {
  if (options.oldCredential.length < 12 || options.oldCredential.length > 200 || /\s/.test(options.oldCredential)) throw new Error('Old credential format is invalid.');
  if (!/^aipp_merch_[a-zA-Z0-9_-]{24,128}$/.test(options.newCredential)) throw new Error('New credential format is invalid.');
  if (options.oldCredential === options.newCredential) throw new Error('Credentials must differ.');
  const schemaFingerprint = await verifySchema(db);
  const counts = await countsFor(db, options.oldCredential);
  const orphans = await orphanBaseline(db, options.oldCredential);
  if (orphans.targetCount) throw new Error('Target-specific orphan rows block rotation.');
  if (counts.merchants !== 1) throw new Error('Expected exactly one source merchant.');
  if (Object.values(await countsFor(db, options.newCredential)).some(Boolean)) throw new Error('Replacement credential already exists.');
  const payload: ApprovedPreflightPayload = { version: 1, createdAt: new Date().toISOString(), schemaFingerprint, targetFingerprint: shortFingerprint(options.oldCredential), counts, orphans: orphans.tables, dbIdentity: options.dbIdentity || { size: 0, mtimeMs: 0 } };
  const generated = sealApprovedPreflight(payload);
  if (orphans.total && !options.allowExistingOrphansUnchanged) throw Object.assign(new Error('Pre-existing unrelated orphan rows require --allow-existing-orphans-unchanged and an approved preflight artifact.'), { approvedPreflight: generated });
  if (!options.apply) return { applied: false, counts, sessionPolicy: 'revoke-and-migrate', approvedPreflight: generated, orphanCount: orphans.total };
  if (!options.expectedCounts || !sameCounts(counts, options.expectedCounts)) throw new Error('Counts differ from approved preflight assumptions.');
  if (options.allowExistingOrphansUnchanged || options.approvedPreflight) {
    if (!options.allowExistingOrphansUnchanged || !options.approvedPreflight) throw new Error('Apply with existing orphans requires the explicit allow flag and approved artifact.');
    verifyApprovedPreflight(options.approvedPreflight, options.maxArtifactAgeMs);
    const approved = options.approvedPreflight.payload;
    if (approved.schemaFingerprint !== schemaFingerprint || approved.targetFingerprint !== shortFingerprint(options.oldCredential) || !sameCounts(approved.counts, counts) || !sameOrphans(approved.orphans, orphans.tables) || canonical(approved.dbIdentity) !== canonical(options.dbIdentity || { size: 0, mtimeMs: 0 })) throw new Error('Approved preflight artifact does not match the current database preflight.');
  } else if (orphans.total) throw new Error('Apply with existing orphans requires the explicit allow flag and approved artifact.');
  await db.exec('PRAGMA defer_foreign_keys=ON; BEGIN IMMEDIATE TRANSACTION;');
  try {
    const lockedCounts = await countsFor(db, options.oldCredential);
    const lockedOrphans = await orphanBaseline(db, options.oldCredential);
    if (!sameCounts(lockedCounts, options.expectedCounts)) throw new Error('Counts changed after acquiring the rotation lock.');
    if (lockedOrphans.targetCount || !sameOrphans(lockedOrphans.tables, orphans.tables)) throw new Error('Orphan baseline changed after acquiring the rotation lock.');
    for (const [table, column] of Object.entries(IDENTITY_COLUMNS)) {
      if (table === 'merchants' || table === 'merchant_sessions') continue;
      const result = await db.run(`UPDATE ${table} SET ${column}=? WHERE ${column}=?`, options.newCredential, options.oldCredential);
      if (Number(result.changes || 0) !== counts[table as keyof RotationCounts]) throw new Error(`Update count mismatch: ${table}`);
    }
    const merchant = await db.run('UPDATE merchants SET api_key=? WHERE api_key=?', options.newCredential, options.oldCredential);
    if (Number(merchant.changes || 0) !== 1) throw new Error('Merchant update mismatch.');
    const sessions = await db.run('UPDATE merchant_sessions SET api_key=?, revoked_at=COALESCE(revoked_at,?) WHERE api_key=?', options.newCredential, new Date().toISOString(), options.oldCredential);
    if (Number(sessions.changes || 0) !== counts.merchant_sessions) throw new Error('Session revoke mismatch.');
    if (options.beforeCommit) await options.beforeCommit();
    if (Object.values(await countsFor(db, options.oldCredential)).some(Boolean)) throw new Error('Old credential still has rows.');
    if (!sameCounts(await countsFor(db, options.newCredential), counts)) throw new Error('Post-rotation counts differ.');
    const afterOrphans = await orphanBaseline(db, options.newCredential);
    if (afterOrphans.targetCount || !sameOrphans(afterOrphans.tables, orphans.tables)) throw new Error('Post-rotation orphan baseline changed.');
    await db.exec('COMMIT;');
    return { applied: true, counts, sessionPolicy: 'revoke-and-migrate', approvedPreflight: generated, orphanCount: orphans.total };
  } catch (error) { await db.exec('ROLLBACK;').catch(() => undefined); throw error; }
}
