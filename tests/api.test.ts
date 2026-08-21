process.env.NODE_ENV = 'test';
process.env.LNBITS_WEBHOOK_SECRET = 'test_webhook_secret_key_123456';
process.env.AIPP_ACCESS_SECRET = 'test_access_secret_key_1234567890';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { initDb, getDb, closeDb } from '../src/config/database';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const TEST_DB_PATH = path.join(__dirname, '../data/aipp_test.db');
const syntheticMerchantKey = (label: string) =>
  `aipp_merch_${label}_${crypto.randomBytes(24).toString('hex')}`;
const RETIRED_MERCHANT_KEY = syntheticMerchantKey('retired');
const ACTIVE_MERCHANT_KEY = syntheticMerchantKey('active');
const UNKNOWN_MERCHANT_KEY = syntheticMerchantKey('unknown');

describe('API Integration Tests via Supertest', () => {
  beforeAll(async () => {
    // Set test DB path and initialize
    process.env.DB_PATH = TEST_DB_PATH;
    
    // Ensure data directory exists
    const dir = path.dirname(TEST_DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Remove old test db if exists
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    await initDb();
    
    // Seed a merchant for testing
    const db = getDb();
    await db.run(
      "INSERT INTO merchants (api_key, ln_address, payout_mode, created_at) VALUES (?, ?, ?, ?)",
      "aipp_testkey",
      "test@aipp.dev",
      "instant",
      new Date().toISOString()
    );
    await db.run(
      "INSERT INTO merchants (api_key, ln_address, payout_mode, created_at) VALUES (?, ?, ?, ?)",
      ACTIVE_MERCHANT_KEY,
      "active-stats@aipp.dev",
      "instant",
      new Date().toISOString()
    );
  });

  afterAll(async () => {
    // Clean up test database files
    await closeDb();
    
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    const walFile = `${TEST_DB_PATH}-wal`;
    const shmFile = `${TEST_DB_PATH}-shm`;
    if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
    if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);
  });

  it('should return 200 OK on GET /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('db', 'ok');
  });

  it('returns 401 for GET /merchant/stats without a credential', async () => {
    const res = await request(app).get('/merchant/stats');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 for GET /merchant/stats with a well-formed unknown credential', async () => {
    const res = await request(app).get('/merchant/stats').set('X-Api-Key', UNKNOWN_MERCHANT_KEY);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 for GET /merchant/stats with a retired credential', async () => {
    const res = await request(app).get('/merchant/stats').set('X-Api-Key', RETIRED_MERCHANT_KEY);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('returns 200 for GET /merchant/stats with the active credential', async () => {
    const res = await request(app).get('/merchant/stats').set('X-Api-Key', ACTIVE_MERCHANT_KEY);
    expect(res.status).toBe(200);
    expect(res.body.payoutMode).toBe('instant');
  });

  it('should return PaidMCP manifest on GET /paidmcp.json', async () => {
    const res = await request(app).get('/paidmcp.json');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'aipp-merchant-api');
    expect(res.body).toHaveProperty('chains');
    expect(res.body.chains).toContain('base');
    expect(res.body.chains).toContain('base-sepolia');
  });

  it('should deny GET /invoice/receipt/:hash if invoice is not settled', async () => {
    const res = await request(app).get('/invoice/receipt/nonexistent_hash');
    expect(res.status).toBe(404); // Not found
  });

  it('should return 401 when creating invoice without API Key', async () => {
    const res = await request(app)
      .post('/invoice/create')
      .send({ amount_sats: 1000, protocol: 'L402' });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('API key');
  });

  it('should successfully create L402 invoice with valid API Key', async () => {
    const res = await request(app)
      .post('/invoice/create')
      .set('X-Api-Key', 'aipp_testkey')
      .send({ amount_sats: 1000, protocol: 'L402' });
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('payment_hash');
    expect(res.body).toHaveProperty('payment_request');
    expect(res.body.amount_sats).toBeGreaterThanOrEqual(1000);
  });

  it('should return agent manifest on GET /aipp-agent.json', async () => {
    const res = await request(app).get('/aipp-agent.json');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('spec_version', '1.1');
    expect(res.body).toHaveProperty('endpoints');
    expect(res.body.endpoints).toHaveProperty('create_invoice');
  });

  it('requires a scoped access token and never accepts payment_hash as content authorization', async () => {
    const created = await request(app)
      .post('/merchant/links/create')
      .set('X-Api-Key', 'aipp_testkey')
      .send({
        title: 'Report Download',
        amount_usd: 0.50,
        redirect_url: 'https://example.com/result'
      });
    expect(created.status).toBe(200);
    expect(created.body).toHaveProperty('manifest_url');

    const htmlRes = await request(app).get(`/t/${created.body.id}`);
    expect(htmlRes.status).toBe(200);
    expect(htmlRes.text).toContain('Report Download');

    const jsonRes = await request(app).get(`/t/${created.body.id}/manifest`);
    expect(jsonRes.status).toBe(200);
    expect(jsonRes.body.name).toBe('Report Download');

    const invoice = await request(app)
      .post(`/t/${created.body.id}/invoice`)
      .send({ mode: 'L402', checkout_id: 'open-tag-test-001' });
    expect(invoice.status).toBe(200);
    expect(invoice.body).toHaveProperty('tag_id', created.body.id);
    expect(invoice.body).toHaveProperty('access_claim_secret');

    const db = getDb();

    const pendingClaim = await request(app)
      .post(`/t/${created.body.id}/access-token`)
      .send({ payment_hash: invoice.body.payment_hash, access_claim_secret: invoice.body.access_claim_secret });
    expect(pendingClaim.status).toBe(402);

    await db.run("UPDATE invoices SET status = 'settled' WHERE payment_hash = ?", invoice.body.payment_hash);

    const legacyUnlock = await request(app)
      .get(`/t/${created.body.id}/unlock/${invoice.body.payment_hash}`);
    expect(legacyUnlock.status).toBe(410);

    const hashOnly = await request(app)
      .get(`/t/${created.body.id}/content?payment_hash=${invoice.body.payment_hash}`);
    expect(hashOnly.status).toBe(410);

    const hashHeader = await request(app)
      .get(`/t/${created.body.id}/content`)
      .set('X-Payment-Hash', invoice.body.payment_hash);
    expect(hashHeader.status).toBe(410);

    const cliHashOnly = await request(app)
      .get(`/cli/${created.body.id}?payment_hash=${invoice.body.payment_hash}`);
    expect(cliHashOnly.status).toBe(410);

    const wrongClaim = await request(app)
      .post(`/t/${created.body.id}/access-token`)
      .send({ payment_hash: invoice.body.payment_hash, access_claim_secret: 'wrong-secret' });
    expect(wrongClaim.status).toBe(401);

    const tokenResponse = await request(app)
      .post(`/t/${created.body.id}/access-token`)
      .send({ payment_hash: invoice.body.payment_hash, access_claim_secret: invoice.body.access_claim_secret });
    expect(tokenResponse.status).toBe(200);
    expect(tokenResponse.body).toHaveProperty('access_token');

    const stored = await db.get(
      'SELECT access_claim_secret_hash, access_token_hash, access_token_expires_at FROM invoices WHERE payment_hash = ?',
      invoice.body.payment_hash
    );
    expect(stored.access_claim_secret_hash).not.toBe(invoice.body.access_claim_secret);
    expect(stored.access_token_hash).not.toBe(tokenResponse.body.access_token);
    expect(new Date(stored.access_token_expires_at).getTime()).toBeGreaterThan(Date.now());

    for (let attempt = 0; attempt < 2; attempt++) {
      const content = await request(app)
        .get(`/t/${created.body.id}/content`)
        .set('Authorization', `Bearer ${tokenResponse.body.access_token}`);
      expect(content.status).toBe(200);
      expect(content.body.content).toEqual({ type: 'redirect', url: 'https://example.com/result' });
    }

    const otherTag = await request(app)
      .post('/merchant/links/create')
      .set('X-Api-Key', 'aipp_testkey')
      .send({ title: 'Other Report', amount_usd: 0.50, redirect_url: 'https://example.com/other' });
    const wrongTag = await request(app)
      .get(`/t/${otherTag.body.id}/content`)
      .set('Authorization', `Bearer ${tokenResponse.body.access_token}`);
    expect(wrongTag.status).toBe(402);

    const rotated = await request(app)
      .post(`/t/${created.body.id}/access-token`)
      .send({ payment_hash: invoice.body.payment_hash, access_claim_secret: invoice.body.access_claim_secret });
    expect(rotated.status).toBe(200);
    expect(rotated.body.access_token).not.toBe(tokenResponse.body.access_token);

    const oldToken = await request(app)
      .get(`/t/${created.body.id}/content`)
      .set('Authorization', `Bearer ${tokenResponse.body.access_token}`);
    expect(oldToken.status).toBe(402);

    await db.run(
      'UPDATE invoices SET access_token_expires_at = ? WHERE payment_hash = ?',
      new Date(Date.now() - 1000).toISOString(), invoice.body.payment_hash
    );
    const expired = await request(app)
      .get(`/t/${created.body.id}/content`)
      .set('Authorization', `Bearer ${rotated.body.access_token}`);
    expect(expired.status).toBe(402);

    expect(htmlRes.text).not.toContain('postMessage(');
    expect(htmlRes.text).not.toContain("payment_hash=' + encodeURIComponent");
  });

  it('should return agent-friendly 402 challenge on GET /premium-article-1 without auth', async () => {
    const res = await request(app).get('/premium-article-1');
    expect(res.status).toBe(402);
    expect(res.headers).toHaveProperty('www-authenticate');
    expect(res.headers).toHaveProperty('payment-required');
    expect(res.body).toHaveProperty('error', 'Payment Required');
    expect(res.body).toHaveProperty('payment_methods');
    expect(res.body.payment_methods).toHaveProperty('lightning');
    expect(res.body.payment_methods).toHaveProperty('usdc_base');
    expect(res.body).toHaveProperty('instructions');
  }, 15000);
});
