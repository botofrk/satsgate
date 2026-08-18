process.env.NODE_ENV = 'test';
process.env.DB_PATH = './data/aipp_invoice_concurrency_test.db';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import request from 'supertest';

vi.mock('../src/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/config/env')>();
  return {
    ...actual,
    LNBITS_INVOICE_KEY: 'test_lnbits_invoice_key',
    LNBITS_URL: 'https://lnbits.invalid'
  };
});

import { app } from '../src/server';
import { closeDb, getDb, initDb } from '../src/config/database';

const TEST_DB_PATH = path.join(__dirname, '../data/aipp_invoice_concurrency_test.db');
const API_KEY = 'aipp_invoice_concurrency_merchant';
let mockBatch = 0;

function lightningResponse(paymentHash: string) {
  return {
    ok: true,
    json: async () => ({ payment_hash: paymentHash, payment_request: `lnbc_${paymentHash}` })
  };
}

async function createLightning(idempotencyKey?: string, amountUsd = 0.01) {
  let req = request(app)
    .post('/invoice/create')
    .set('X-Api-Key', API_KEY)
    .send({ protocol: 'L402', amount_usd: amountUsd });
  if (idempotencyKey) req = req.set('Idempotency-Key', idempotencyKey);
  return req;
}

describe('invoice creation transaction serialization', () => {
  beforeAll(async () => {
    const dir = path.dirname(TEST_DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    await initDb();
    await getDb().run(
      'INSERT INTO merchants (api_key, ln_address, usdc_address, payout_mode, created_at) VALUES (?, ?, ?, ?, ?)',
      API_KEY,
      'invoice-concurrency@aipp.dev',
      '0x1234567890123456789012345678901234567890',
      'manual',
      new Date().toISOString()
    );
  });

  beforeEach(() => {
    const batch = ++mockBatch;
    let sequence = 0;
    vi.stubGlobal('fetch', vi.fn(async () => lightningResponse(`concurrency_hash_${batch}_${++sequence}`)));
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await closeDb();
    for (const file of [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`]) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  it('deduplicates concurrent identical idempotency keys before external invoice creation', async () => {
    const fetchMock = vi.mocked(fetch);
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => createLightning('same-idempotency-key'))
    );

    expect(responses.every(response => response.status === 200)).toBe(true);
    expect(new Set(responses.map(response => response.body.payment_hash)).size).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const row = await getDb().get(
      `SELECT COUNT(*) AS count
       FROM invoice_idempotency d JOIN invoices i ON i.payment_hash = d.invoice_id
       WHERE d.merchant_id = ? AND d.idempotency_key = ?`,
      API_KEY,
      'same-idempotency-key'
    );
    expect(row.count).toBe(1);
  });

  it('rejects concurrent conflicting fingerprints before creating a second external invoice', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();
    const responses = await Promise.all([
      createLightning('conflicting-idempotency-key', 0.01),
      createLightning('conflicting-idempotency-key', 0.02)
    ]);

    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not rollback when external invoice creation fails before BEGIN', async () => {
    const db = getDb();
    const runSpy = vi.spyOn(db, 'run');
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response);

    const failed = await createLightning();
    expect(failed.status).toBe(502);
    expect(runSpy.mock.calls.some(call => call[0] === 'ROLLBACK')).toBe(false);

    const succeeded = await createLightning();
    expect(succeeded.status).toBe(200);
    runSpy.mockRestore();
  });

  it('rolls back only its own started transaction and releases the queue', async () => {
    const db = getDb();
    const runSpy = vi.spyOn(db, 'run');
    const duplicateHash = 'duplicate_after_begin_hash';
    vi.mocked(fetch)
      .mockResolvedValueOnce(lightningResponse(duplicateHash) as any)
      .mockResolvedValueOnce(lightningResponse(duplicateHash) as any)
      .mockResolvedValueOnce(lightningResponse('after_rollback_success_hash') as any);

    const first = await createLightning();
    const second = await createLightning();
    const third = await createLightning();

    expect(first.status).toBe(200);
    expect(second.status).toBe(502);
    expect(third.status).toBe(200);
    expect(runSpy.mock.calls.filter(call => call[0] === 'ROLLBACK')).toHaveLength(1);
    const committed = await db.get(
      'SELECT COUNT(*) AS count FROM invoices WHERE payment_hash IN (?, ?)',
      duplicateHash,
      'after_rollback_success_hash'
    );
    expect(committed.count).toBe(2);
    runSpy.mockRestore();
  });

  it('creates 20 concurrent x402 invoices without duplicates', async () => {
    const before = await getDb().get('SELECT COUNT(*) AS count FROM invoices WHERE api_key = ? AND protocol = ?', API_KEY, 'x402');
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();
    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app)
          .post('/invoice/create')
          .set('X-Api-Key', API_KEY)
          .send({ protocol: 'X402', amount_usd: 0.01 })
      )
    );

    expect(responses.every(response => response.status === 200)).toBe(true);
    expect(new Set(responses.map(response => response.body.payment_hash)).size).toBe(20);
    expect(fetchMock).not.toHaveBeenCalled();
    const after = await getDb().get('SELECT COUNT(*) AS count FROM invoices WHERE api_key = ? AND protocol = ?', API_KEY, 'x402');
    expect(after.count - before.count).toBe(20);
  });
});
