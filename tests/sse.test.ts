process.env.DB_PATH = './data/aipp_sse_test.db';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDb, getDb, closeDb } from '../src/config/database';
import { publishInvoiceUpdate } from '../src/services/events';
import request from 'supertest';
import { app } from '../src/server';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const TEST_DB_PATH = path.join(__dirname, '../data/aipp_sse_test.db');

describe('Server-Sent Events (SSE) Real-Time Stream Integration Tests', () => {
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

    // Seed test merchant
    const db = getDb();
    await db.run(
      "INSERT INTO merchants (api_key, ln_address, payout_mode, created_at) VALUES (?, ?, ?, ?)",
      "sse_test_merchant_key",
      "sse_merchant@aipp.dev",
      "instant",
      new Date().toISOString()
    );
  });

  afterAll(async () => {
    await closeDb();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    const walFile = `${TEST_DB_PATH}-wal`;
    const shmFile = `${TEST_DB_PATH}-shm`;
    if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
    if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);
  });

  it('should stream immediately if invoice is already settled', async () => {
    const db = getDb();
    const settledHash = 'sse_settled_hash_' + crypto.randomBytes(4).toString('hex');

    await db.run(
      "INSERT INTO invoices (payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, status, protocol, preimage, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      settledHash,
      "sse_test_merchant_key",
      500,
      5,
      495,
      'settled',
      'L402',
      'test_preimage_12345',
      new Date().toISOString()
    );

    const res = await request(app)
      .get(`/invoice/stream/${settledHash}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain(': connected');
    expect(res.text).toContain('"paid":true');
    expect(res.text).toContain('"status":"settled"');
    expect(res.text).toContain('test_preimage_12345');
  });

  it('should stream not_found event if invoice does not exist', async () => {
    const res = await request(app)
      .get('/invoice/stream/non_existent_hash_999')
      .expect(200);

    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('"status":"not_found"');
    expect(res.text).toContain('"paid":false');
  });

  it('should stream live settlement event when publishInvoiceUpdate is emitted for a pending invoice', async () => {
    const db = getDb();
    const pendingHash = 'sse_pending_hash_' + crypto.randomBytes(4).toString('hex');

    await db.run(
      "INSERT INTO invoices (payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, status, protocol, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      pendingHash,
      "sse_test_merchant_key",
      1000,
      10,
      990,
      'pending',
      'L402',
      new Date().toISOString()
    );

    // Trigger publishInvoiceUpdate slightly after subscription
    setTimeout(() => {
      publishInvoiceUpdate(pendingHash, {
        paid: true,
        status: 'settled',
        preimage: 'live_preimage_abc123',
        protocol: 'L402',
        amount_sats: 1000
      });
    }, 100);

    const res = await request(app)
      .get(`/invoice/stream/${pendingHash}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain(': connected');
    expect(res.text).toContain('"paid":true');
    expect(res.text).toContain('"status":"settled"');
    expect(res.text).toContain('live_preimage_abc123');
  });
});
