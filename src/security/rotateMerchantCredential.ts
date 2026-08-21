import type { Database } from 'sqlite';

export const IDENTITY_COLUMNS = {
  merchants: 'api_key', invoices: 'api_key', payment_links: 'api_key', payout_queue: 'api_key',
  daily_spend: 'api_key', ledgers: 'api_key', webhook_deliveries: 'api_key', invoice_idempotency: 'merchant_id',
  merchant_sessions: 'api_key', merchant_passkeys: 'api_key', webauthn_challenges: 'api_key'
} as const;
export type RotationCounts = Record<keyof typeof IDENTITY_COLUMNS, number>;
export interface RotationOptions { oldCredential: string; newCredential: string; apply?: boolean; expectedCounts?: RotationCounts; beforeCommit?: () => void | Promise<void>; }
export interface RotationResult { applied: boolean; counts: RotationCounts; sessionPolicy: 'revoke-and-migrate'; }

async function verifySchema(db: Database): Promise<void> {
  const tables = await db.all<Array<{ name: string }>>('SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE ?', 'table', 'sqlite_%');
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
}

async function countsFor(db: Database, credential: string): Promise<RotationCounts> {
  const pairs = await Promise.all(Object.entries(IDENTITY_COLUMNS).map(async ([table, column]) => {
    const row = await db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`, credential);
    return [table, Number(row?.count || 0)] as const;
  }));
  return Object.fromEntries(pairs) as RotationCounts;
}

async function assertNoOrphans(db: Database): Promise<void> {
  for (const [table, column] of Object.entries(IDENTITY_COLUMNS)) {
    if (table === 'merchants') continue;
    const row = await db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table} c LEFT JOIN merchants m ON c.${column}=m.api_key WHERE c.${column} IS NOT NULL AND m.api_key IS NULL`);
    if (Number(row?.count || 0)) throw new Error(`Orphan check failed: ${table}.${column}`);
  }
}
const same = (a: RotationCounts, b: RotationCounts) => Object.keys(IDENTITY_COLUMNS).every(key => a[key as keyof RotationCounts] === b[key as keyof RotationCounts]);

export async function rotateMerchantCredential(db: Database, options: RotationOptions): Promise<RotationResult> {
  if (options.oldCredential.length < 12 || options.oldCredential.length > 200 || /\s/.test(options.oldCredential)) throw new Error('Old credential format is invalid.');
  if (!/^aipp_merch_[a-zA-Z0-9_-]{24,128}$/.test(options.newCredential)) throw new Error('New credential format is invalid.');
  if (options.oldCredential === options.newCredential) throw new Error('Credentials must differ.');
  await verifySchema(db); await assertNoOrphans(db);
  const counts = await countsFor(db, options.oldCredential);
  if (counts.merchants !== 1) throw new Error('Expected exactly one source merchant.');
  if (Object.values(await countsFor(db, options.newCredential)).some(Boolean)) throw new Error('Replacement credential already exists.');
  if (!options.apply) return { applied: false, counts, sessionPolicy: 'revoke-and-migrate' };
  if (!options.expectedCounts || !same(counts, options.expectedCounts)) throw new Error('Counts differ from approved preflight assumptions.');
  await db.exec('PRAGMA defer_foreign_keys=ON; BEGIN IMMEDIATE TRANSACTION;');
  try {
    const lockedCounts = await countsFor(db, options.oldCredential);
    if (!same(lockedCounts, options.expectedCounts)) throw new Error('Counts changed after acquiring the rotation lock.');
    await assertNoOrphans(db);
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
    if (!same(await countsFor(db, options.newCredential), counts)) throw new Error('Post-rotation counts differ.');
    await assertNoOrphans(db); await db.exec('COMMIT;');
    return { applied: true, counts, sessionPolicy: 'revoke-and-migrate' };
  } catch (error) { await db.exec('ROLLBACK;').catch(() => undefined); throw error; }
}
