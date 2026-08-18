process.env.LNBITS_WEBHOOK_SECRET = 'test_payout_trigger_secret_123456';
process.env.LNBITS_INVOICE_KEY = 'test_lnbits_inv_key';
process.env.DB_PATH = './data/aipp_payout_trigger_test.db';

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';
import { initDb, getDb, closeDb } from '../src/config/database';
import request from 'supertest';
import { app } from '../src/server';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const TEST_DB_PATH = path.join(__dirname, '../data/aipp_payout_trigger_test.db');

describe('Unified Payout Trigger Regression Suite', () => {
  beforeAll(async () => {
    process.env.DB_PATH = TEST_DB_PATH;
    const dir = path.dirname(TEST_DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    await initDb();
  });

  afterAll(async () => {
    await closeDb();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    const walFile = `${TEST_DB_PATH}-wal`;
    const shmFile = `${TEST_DB_PATH}-shm`;
    if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
    if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('Requirement 1 & 5: Polling settlement creates a payout job when instant threshold (1 sat) is met', async () => {
    const db = getDb();
    const apiKey = 'm_poll_instant_' + crypto.randomBytes(3).toString('hex');
    await db.run(
      "INSERT INTO merchants (api_key, ln_address, payout_mode, payout_threshold_sats, created_at) VALUES (?, ?, 'instant', 0, ?)",
      apiKey, 'instant_merchant@aipp.dev', new Date().toISOString()
    );

    const hash = 'poll_hash_' + crypto.randomBytes(6).toString('hex');
    await db.run(
      "INSERT INTO invoices (payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, status, payout_status, protocol, created_at) VALUES (?, ?, 22, 6, 16, 'pending', 'none', 'l402', ?)",
      hash, apiKey, new Date().toISOString()
    );

    // Mock LNbits check returning paid: true
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/payments/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ paid: true, preimage: 'preimage_poll_123' })
        });
      }
      return Promise.resolve({ ok: false });
    });
    vi.stubGlobal('fetch', fetchMock);

    // Poll status
    const res = await request(app).get(`/invoice/status/${hash}`);
    expect(res.status).toBe(200);
    expect(res.body.paid).toBe(true);
    expect(res.body.status).toBe('settled');

    // Verify invoice is marked queued and job exists in payout_queue
    const invoice = await db.get('SELECT status, payout_status, preimage FROM invoices WHERE payment_hash = ?', hash);
    expect(invoice.status).toBe('settled');
    expect(invoice.payout_status).toBe('queued');
    expect(invoice.preimage).toBe('preimage_poll_123');

    const payoutJob = await db.get('SELECT * FROM payout_queue WHERE api_key = ?', apiKey);
    expect(payoutJob).toBeDefined();
    expect(payoutJob.amount_sats).toBe(16);
    expect(payoutJob.ln_address).toBe('instant_merchant@aipp.dev');
    expect(payoutJob.status).toBe('pending');
  });

  it('Requirement 2: Webhook settlement creates the exact same payout job when instant threshold is met', async () => {
    const db = getDb();
    const apiKey = 'm_wh_instant_' + crypto.randomBytes(3).toString('hex');
    await db.run(
      "INSERT INTO merchants (api_key, ln_address, payout_mode, payout_threshold_sats, created_at) VALUES (?, ?, 'instant', 0, ?)",
      apiKey, 'webhook_merchant@aipp.dev', new Date().toISOString()
    );

    const hash = 'wh_hash_' + crypto.randomBytes(6).toString('hex');
    await db.run(
      "INSERT INTO invoices (payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, status, payout_status, protocol, created_at) VALUES (?, ?, 50, 5, 45, 'pending', 'none', 'l402', ?)",
      hash, apiKey, new Date().toISOString()
    );

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/payments/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ paid: true, preimage: 'preimage_wh_456' })
        });
      }
      return Promise.resolve({ ok: false });
    });
    vi.stubGlobal('fetch', fetchMock);

    const body = { payment_hash: hash };
    const rawBody = JSON.stringify(body);
    const secret = process.env.LNBITS_WEBHOOK_SECRET!;
    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    const res = await request(app)
      .post('/lnbits-webhook')
      .set('x-lnbits-webhook-secret', signature)
      .set('Content-Type', 'application/json')
      .send(rawBody);

    expect(res.status).toBe(200);

    const invoice = await db.get('SELECT status, payout_status FROM invoices WHERE payment_hash = ?', hash);
    expect(invoice.status).toBe('settled');
    expect(invoice.payout_status).toBe('queued');

    const payoutJob = await db.get('SELECT * FROM payout_queue WHERE api_key = ?', apiKey);
    expect(payoutJob).toBeDefined();
    expect(payoutJob.amount_sats).toBe(45);
    expect(payoutJob.ln_address).toBe('webhook_merchant@aipp.dev');
    expect(payoutJob.status).toBe('pending');
  });

  it('Requirement 3: Concurrent polling and webhook settlement cannot enqueue payout twice (Idempotency Race Test)', async () => {
    const db = getDb();
    const apiKey = 'm_race_' + crypto.randomBytes(3).toString('hex');
    await db.run(
      "INSERT INTO merchants (api_key, ln_address, payout_mode, payout_threshold_sats, created_at) VALUES (?, ?, 'instant', 0, ?)",
      apiKey, 'race_merchant@aipp.dev', new Date().toISOString()
    );

    const hash = 'race_hash_' + crypto.randomBytes(6).toString('hex');
    await db.run(
      "INSERT INTO invoices (payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, status, payout_status, protocol, created_at) VALUES (?, ?, 100, 6, 94, 'pending', 'none', 'l402', ?)",
      hash, apiKey, new Date().toISOString()
    );

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/payments/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ paid: true, preimage: 'preimage_race_789' })
        });
      }
      return Promise.resolve({ ok: false });
    });
    vi.stubGlobal('fetch', fetchMock);

    const body = { payment_hash: hash };
    const rawBody = JSON.stringify(body);
    const secret = process.env.LNBITS_WEBHOOK_SECRET!;
    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    // Run polling and webhook concurrently
    const [pollRes, whRes] = await Promise.all([
      request(app).get(`/invoice/status/${hash}`),
      request(app)
        .post('/lnbits-webhook')
        .set('x-lnbits-webhook-secret', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody)
    ]);

    expect(pollRes.status).toBe(200);
    expect(whRes.status).toBe(200);

    // Exactly 1 job must exist in payout_queue for this merchant
    const payoutJobs = await db.all('SELECT * FROM payout_queue WHERE api_key = ?', apiKey);
    expect(payoutJobs.length).toBe(1);
    expect(payoutJobs[0].amount_sats).toBe(94);
  });

  it('Requirement 4: Accumulated merchant net is batched once when custom threshold is met across multiple settled invoices', async () => {
    const db = getDb();
    const apiKey = 'm_batch_' + crypto.randomBytes(3).toString('hex');
    // Threshold set to 100 sats
    await db.run(
      "INSERT INTO merchants (api_key, ln_address, payout_mode, payout_threshold_sats, created_at) VALUES (?, ?, 'threshold', 100, ?)",
      apiKey, 'batch_merchant@aipp.dev', new Date().toISOString()
    );

    const hash1 = 'batch_h1_' + crypto.randomBytes(4).toString('hex');
    const hash2 = 'batch_h2_' + crypto.randomBytes(4).toString('hex');
    const hash3 = 'batch_h3_' + crypto.randomBytes(4).toString('hex');

    // Invoice 1: 40 sats net
    await db.run(
      "INSERT INTO invoices (payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, status, payout_status, protocol, created_at) VALUES (?, ?, 45, 5, 40, 'pending', 'none', 'l402', ?)",
      hash1, apiKey, new Date().toISOString()
    );
    // Invoice 2: 40 sats net (total 80 < 100)
    await db.run(
      "INSERT INTO invoices (payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, status, payout_status, protocol, created_at) VALUES (?, ?, 45, 5, 40, 'pending', 'none', 'l402', ?)",
      hash2, apiKey, new Date().toISOString()
    );
    // Invoice 3: 40 sats net (total 120 >= 100)
    await db.run(
      "INSERT INTO invoices (payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, status, payout_status, protocol, created_at) VALUES (?, ?, 45, 5, 40, 'pending', 'none', 'l402', ?)",
      hash3, apiKey, new Date().toISOString()
    );

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/payments/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ paid: true, preimage: 'preimage_batch_test' })
        });
      }
      return Promise.resolve({ ok: false });
    });
    vi.stubGlobal('fetch', fetchMock);

    // Settle Invoice 1 (40 sats net < 100 threshold)
    await request(app).get(`/invoice/status/${hash1}`);
    let jobs = await db.all('SELECT * FROM payout_queue WHERE api_key = ?', apiKey);
    expect(jobs.length).toBe(0); // No payout yet
    let inv1 = await db.get('SELECT payout_status FROM invoices WHERE payment_hash = ?', hash1);
    expect(inv1.payout_status).toBe('pending_threshold');

    // Settle Invoice 2 (total 80 sats net < 100 threshold)
    await request(app).get(`/invoice/status/${hash2}`);
    jobs = await db.all('SELECT * FROM payout_queue WHERE api_key = ?', apiKey);
    expect(jobs.length).toBe(0); // Still no payout

    // Settle Invoice 3 (total 120 sats net >= 100 threshold)
    await request(app).get(`/invoice/status/${hash3}`);
    jobs = await db.all('SELECT * FROM payout_queue WHERE api_key = ?', apiKey);
    expect(jobs.length).toBe(1); // Single batch job queued
    expect(jobs[0].amount_sats).toBe(120);
    expect(jobs[0].status).toBe('pending');

    // All 3 invoices must now be 'queued'
    const invs = await db.all('SELECT payout_status FROM invoices WHERE api_key = ?', apiKey);
    expect(invs.every((i: any) => i.payout_status === 'queued')).toBe(true);
  });
});
