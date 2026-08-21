process.env.NODE_ENV = 'test';

import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDb, getDb, initDb } from '../src/config/database';
import { rotateMerchantCredential, type RotationCounts } from '../src/security/rotateMerchantCredential';

const oldCredential = ['aipp', 'devtest'].join('_');
const newCredential = `aipp_merch_${'b'.repeat(32)}`;
const files: string[] = [];

async function freshDb(name: string) {
  await closeDb();
  delete process.env.AIPP_DEMO_MERCHANT_API_KEY;
  delete process.env.AIPP_DEMO_LN_ADDRESS;
  delete process.env.AIPP_DEMO_USDC_ADDRESS;
  const file = path.join(__dirname, `../data/${name}.db`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  files.push(file, `${file}-wal`, `${file}-shm`);
  for (const candidate of files) if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
  process.env.DB_PATH = file;
  return initDb();
}

afterEach(async () => {
  await closeDb();
  delete process.env.AIPP_DEMO_MERCHANT_API_KEY;
  delete process.env.AIPP_DEMO_LN_ADDRESS;
  delete process.env.AIPP_DEMO_USDC_ADDRESS;
  for (const file of files.splice(0)) if (fs.existsSync(file)) fs.unlinkSync(file);
});

describe('demo credential containment', () => {
  it('contains no static merchant credential in public dashboard output', () => {
    const dashboard = fs.readFileSync(path.join(__dirname, '../dashboard.html'), 'utf8');
    expect(dashboard).not.toContain(oldCredential);
    expect(dashboard).not.toContain('quickLogin');
  });

  it('does not seed a demo merchant when the server secret is absent', async () => {
    const db = await freshDb('demo_secret_absent');
    expect((await db.get('SELECT COUNT(*) AS count FROM payment_links WHERE id=?', 'demo')).count).toBe(0);
    expect((await db.get('SELECT COUNT(*) AS count FROM merchants WHERE api_key=?', oldCredential)).count).toBe(0);
  });

  it('seeds and binds demo data from valid server-only configuration', async () => {
    await closeDb();
    const file = path.join(__dirname, '../data/demo_secret_present.db');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    files.push(file, `${file}-wal`, `${file}-shm`);
    process.env.DB_PATH = file;
    process.env.AIPP_DEMO_MERCHANT_API_KEY = newCredential;
    process.env.AIPP_DEMO_LN_ADDRESS = 'demo@example.test';
    process.env.AIPP_DEMO_USDC_ADDRESS = `0x${'1'.repeat(40)}`;
    const db = await initDb();
    expect((await db.get('SELECT api_key FROM payment_links WHERE id=?', 'demo')).api_key).toBe(newCredential);
    expect((await db.get('SELECT COUNT(*) AS count FROM merchants WHERE api_key=?', oldCredential)).count).toBe(0);
  });
});

async function populatedDb(name: string) {
  const db = await freshDb(name);
  const now = new Date().toISOString();
  await db.run('INSERT INTO merchants(api_key,ln_address,created_at) VALUES(?,?,?)', oldCredential, 'rotate@example.test', now);
  await db.run("INSERT INTO invoices(payment_hash,api_key,status,payout_status,created_at) VALUES('hash1',?,'settled','forwarded',?)", oldCredential, now);
  await db.run("INSERT INTO payment_links(id,api_key,title,amount_usd,redirect_url,created_at) VALUES('link1',?,'title',1,'https://example.test',?)", oldCredential, now);
  await db.run("INSERT INTO payout_queue(id,payment_hash,api_key,status,next_retry_at,created_at) VALUES('job1','hash1',?,'completed',?,?)", oldCredential, now, now);
  await db.run("INSERT INTO daily_spend(api_key,date) VALUES(?,'2026-08-21')", oldCredential);
  await db.run("INSERT INTO ledgers(id,payment_hash,api_key,amount_sats,commission_sats,timestamp) VALUES('ledger1','hash1',?,10,1,?)", oldCredential, now);
  await db.run("INSERT INTO webhook_deliveries(id,callback_url,payload,status,api_key,next_retry_at,created_at) VALUES('hook1','https://example.test','{}','pending',?,?,?)", oldCredential, now, now);
  await db.run("INSERT INTO invoice_idempotency(merchant_id,idempotency_key,request_fingerprint,invoice_id,created_at) VALUES(?,'idem1','fp','hash1',?)", oldCredential, now);
  await db.run("INSERT INTO merchant_sessions(id,api_key,token_hash,expires_at,last_seen_at,created_at) VALUES('session1',?,'tokenhash',?,?,?)", oldCredential, now, now, now);
  await db.run("INSERT INTO merchant_passkeys(id,api_key,credential_id,public_key,device_name,created_at,last_used_at) VALUES('pass1',?,'cred1','pub','device',?,?)", oldCredential, now, now);
  await db.run("INSERT INTO webauthn_challenges(id,challenge_hash,ceremony_type,api_key,expires_at,created_at) VALUES('challenge1','challengehash','login',?,?,?)", oldCredential, now, now);
  return db;
}

describe('guarded merchant credential rotation', () => {
  it('dry-run performs zero writes', async () => {
    const db = await populatedDb('rotation_dry_run');
    const result = await rotateMerchantCredential(db, { oldCredential, newCredential });
    expect(result.applied).toBe(false);
    expect((await db.get('SELECT COUNT(*) AS count FROM merchants WHERE api_key=?', oldCredential)).count).toBe(1);
  });

  it('updates all relationships, preserves history, revokes sessions, and invalidates the old credential', async () => {
    const db = await populatedDb('rotation_apply');
    const preflight = await rotateMerchantCredential(db, { oldCredential, newCredential });
    const result = await rotateMerchantCredential(db, { oldCredential, newCredential, apply: true, expectedCounts: preflight.counts });
    expect(result.applied).toBe(true);
    expect((await db.get('SELECT COUNT(*) AS count FROM merchants WHERE api_key=?', oldCredential)).count).toBe(0);
    expect((await db.get('SELECT COUNT(*) AS count FROM merchants WHERE api_key=?', newCredential)).count).toBe(1);
    for (const table of ['invoices', 'payment_links', 'payout_queue', 'daily_spend', 'ledgers', 'webhook_deliveries', 'merchant_passkeys']) {
      expect((await db.get(`SELECT COUNT(*) AS count FROM ${table} WHERE api_key=?`, newCredential)).count).toBe(1);
    }
    expect((await db.get('SELECT COUNT(*) AS count FROM invoice_idempotency WHERE merchant_id=?', newCredential)).count).toBe(1);
    const session = await db.get('SELECT api_key,revoked_at FROM merchant_sessions WHERE id=?', 'session1');
    expect(session.api_key).toBe(newCredential);
    expect(session.revoked_at).toBeTruthy();
    expect((await db.get('SELECT status,payout_status FROM invoices WHERE payment_hash=?', 'hash1'))).toMatchObject({ status: 'settled', payout_status: 'forwarded' });
  });

  it('rolls back every write when a guarded failure occurs', async () => {
    const db = await populatedDb('rotation_rollback');
    const preflight = await rotateMerchantCredential(db, { oldCredential, newCredential });
    await expect(rotateMerchantCredential(db, {
      oldCredential, newCredential, apply: true, expectedCounts: preflight.counts,
      beforeCommit: () => { throw new Error('synthetic guarded failure'); }
    })).rejects.toThrow('synthetic guarded failure');
    expect((await db.get('SELECT COUNT(*) AS count FROM merchants WHERE api_key=?', oldCredential)).count).toBe(1);
    expect((await db.get('SELECT COUNT(*) AS count FROM merchants WHERE api_key=?', newCredential)).count).toBe(0);
    expect((await db.get('SELECT revoked_at FROM merchant_sessions WHERE id=?', 'session1')).revoked_at).toBeNull();
  });

  it('refuses apply when approved preflight counts differ', async () => {
    const db = await populatedDb('rotation_count_guard');
    const preflight = await rotateMerchantCredential(db, { oldCredential, newCredential });
    const bad = { ...preflight.counts, invoices: preflight.counts.invoices + 1 } as RotationCounts;
    await expect(rotateMerchantCredential(db, { oldCredential, newCredential, apply: true, expectedCounts: bad })).rejects.toThrow('approved preflight');
  });
});
