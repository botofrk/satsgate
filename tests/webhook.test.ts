process.env.LNBITS_WEBHOOK_SECRET = 'test_webhook_secret_key_123456';
process.env.DB_PATH = './data/aipp_webhook_test.db';

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';
import { initDb, getDb, closeDb } from '../src/config/database';
import { processWebhookQueue } from '../src/jobs/webhookWorker';
import request from 'supertest';
import { app } from '../src/server';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const TEST_DB_PATH = path.join(__dirname, '../data/aipp_webhook_test.db');

describe('Persistent Webhook Queue Integration Tests', () => {
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
      "webhook_test_merchant_key",
      "merchant@aipp.dev",
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

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should queue webhook in database on LNBits webhook and process successfully', async () => {
    const db = getDb();
    const paymentHash = 'webhook_test_payment_hash_' + crypto.randomBytes(4).toString('hex');
    
    // Insert mock invoice with a callback URL
    await db.run(
      "INSERT INTO invoices (payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, status, payout_status, callback_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      paymentHash,
      "webhook_test_merchant_key",
      1000,
      10,
      990,
      'pending',
      'none',
      'https://merchant.example.com/callback',
      new Date().toISOString()
    );

    // Setup LNBits verification and merchant callback mock
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/payments/')) {
        // LNBits verify request
        return Promise.resolve({
          ok: true,
          json: async () => ({ paid: true, preimage: 'preimage_hash_xyz' })
        });
      }
      if (url === 'https://merchant.example.com/callback') {
        // Merchant callback delivery
        return Promise.resolve({
          ok: true
        });
      }
      return Promise.resolve({ ok: false });
    });
    vi.stubGlobal('fetch', fetchMock);

    // Set webhook secret for signing
    process.env.LNBITS_WEBHOOK_SECRET = 'test_webhook_secret_key_123456';
    const payload = { payment_hash: paymentHash };
    
    const hmacSecret = 'test_webhook_secret_key_123456';
    const hmacSig = crypto
      .createHmac('sha256', hmacSecret)
      .update(Buffer.from(JSON.stringify(payload)))
      .digest('hex');

    // Send LNBits webhook request with HMAC header signature
    const res = await request(app)
      .post('/lnbits-webhook')
      .set('x-lnbits-webhook-secret', hmacSig)
      .send(payload);

    expect(res.status).toBe(200);

    // Verify webhook is queued in webhook_deliveries
    const delivery = await db.get("SELECT * FROM webhook_deliveries WHERE callback_url = ?", 'https://merchant.example.com/callback');
    expect(delivery).toBeDefined();
    expect(delivery.status).toBe('pending');
    expect(delivery.attempts).toBe(0);

    const parsedPayload = JSON.parse(delivery.payload);
    expect(parsedPayload.payment_hash).toBe(paymentHash);
    expect(parsedPayload.status).toBe('settled');

    // Run the webhook queue worker
    await processWebhookQueue();

    // Verify the delivery is now marked completed
    const updatedDelivery = await db.get("SELECT * FROM webhook_deliveries WHERE id = ?", delivery.id);
    expect(updatedDelivery.status).toBe('completed');
    expect(fetchMock).toHaveBeenCalled();
  });
});
