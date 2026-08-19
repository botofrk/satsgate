process.env.LNBITS_WEBHOOK_SECRET = 'test_webhook_secret_key_123456';
process.env.ADMIN_SECRET = 'test_admin_secret_key_123456';
process.env.DB_PATH = './data/aipp_pricing_accounting_v1_test.db';
process.env.AIPP_BASE_PRIVATE_KEY = '0x0123456789012345678901234567890123456789012345678901234567890123';

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/config/env')>();
  return {
    ...actual,
    ADMIN_SECRET: 'test_admin_secret_key_123456',
    LNBITS_WEBHOOK_SECRET: 'test_webhook_secret_key_123456'
  };
});

import { initDb, getDb, closeDb } from '../src/config/database';
import request from 'supertest';
import { app } from '../src/server';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { ethers } from 'ethers';
import {
  CURRENT_FEE_POLICY_VERSION,
  LEGACY_FEE_POLICY_VERSION,
  AIPP_FEE_BPS,
  LIGHTNING_FIXED_FEE_SATS,
  BASE_USDC_MINIMUM_FEE_UNITS,
  calculateLegacyLightningFee,
  calculateLegacyBaseUsdcFee
} from '../src/services/fees';

const TEST_DB_PATH = path.join(__dirname, '../data/aipp_pricing_accounting_v1_test.db');
const TEST_API_KEY = 'aipp_merch_test_pricing_v1';
const TEST_LN_ADDR = 'merchant@aipp.dev';
const TEST_USDC_ADDR = '0x71C8fb49137459807530f43b90F9337072597fcA';

describe('AIPP V1 Transaction Pricing & Accounting Verification (Historical Immutability & 3% Canonical Policy)', () => {
  beforeAll(async () => {
    process.env.DB_PATH = TEST_DB_PATH;
    const dir = path.dirname(TEST_DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);

    await initDb();
    const db = getDb();

    // Register merchant
    await db.run(
      'INSERT INTO merchants (api_key, ln_address, usdc_address, payout_mode, payout_threshold_sats, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      TEST_API_KEY,
      TEST_LN_ADDR,
      TEST_USDC_ADDR,
      'instant',
      0,
      new Date().toISOString()
    );

    // Register test Smart Tag
    await db.run(
      `INSERT INTO payment_links (id, api_key, title, amount_usd, redirect_url, capability_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'test_smart_tag_pricing',
      TEST_API_KEY,
      'Pricing Specimen Smart Tag',
      0.01,
      'https://aipp.dev/t/test_smart_tag_pricing/content',
      'api',
      new Date().toISOString()
    );
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

  describe('1. Lightning Canonical & Historical Accounting', () => {
    it('creates new 34 sats Lightning invoice (pricing-distinction canary): gross=34, fee=7, merchant_net=27', async () => {
      // 34 sats gross: ceil(34 * 3%) = 2 sats percentage fee + 5 sats fixed = 7 sats fee, 27 sats net.
      // (Legacy 1% + 5 sats would have produced ceil(34 * 1%) + 5 = 6 sats fee).
      const res = await request(app)
        .post('/invoice/create')
        .set('X-Api-Key', TEST_API_KEY)
        .send({ amount_sats: 34, protocol: 'L402' });

      expect(res.status).toBe(200);
      expect(res.body.amount_sats).toBe(34);
      expect(res.body.commission_sats).toBe(7);
      expect(res.body.merchant_amount_sats).toBe(27);
      expect(res.body.amount_sats).toBe(res.body.merchant_amount_sats + res.body.commission_sats);

      const db = getDb();
      const row = await db.get('SELECT * FROM invoices WHERE payment_hash = ?', res.body.payment_hash);
      expect(row.amount_sats).toBe(34);
      expect(row.commission_sats).toBe(7);
      expect(row.forwarded_amount_sats).toBe(27);
      expect(row.fee_policy_version).toBe(CURRENT_FEE_POLICY_VERSION);
      expect(row.fee_bps).toBe(AIPP_FEE_BPS);
      expect(row.lightning_fixed_fee_sats).toBe(LIGHTNING_FIXED_FEE_SATS);
      expect(row.amount_sats).toBe(row.forwarded_amount_sats + row.commission_sats);
    });

    it('creates new 22 sats Lightning invoice (sub-33 sats canary): gross=22, fee=6, merchant_net=16', async () => {
      const res = await request(app)
        .post('/invoice/create')
        .set('X-Api-Key', TEST_API_KEY)
        .send({ amount_sats: 22, protocol: 'L402' });

      expect(res.status).toBe(200);
      expect(res.body.amount_sats).toBe(22);
      expect(res.body.commission_sats).toBe(6);
      expect(res.body.merchant_amount_sats).toBe(16);
      expect(res.body.amount_sats).toBe(res.body.merchant_amount_sats + res.body.commission_sats);
    });

    it('preserves existing historical Lightning rows with persisted fee/net (e.g. 100 sats -> 6 fee, 94 net)', async () => {
      const db = getDb();
      const legacyLnHash = 'hist_ln_persisted_' + crypto.randomBytes(4).toString('hex');
      // Historical 100 sats invoice with persisted fee=6, net=94, version='legacy_v1_1pct'
      await db.run(
        `INSERT INTO invoices (
          payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, 
          status, protocol, fee_policy_version, created_at
        ) VALUES (?, ?, ?, ?, ?, 'settled', 'l402', ?, ?)`,
        legacyLnHash,
        TEST_API_KEY,
        100,
        6,
        94,
        LEGACY_FEE_POLICY_VERSION,
        '2026-01-15T00:00:00.000Z'
      );

      const receiptRes = await request(app).get(`/invoice/receipt/${legacyLnHash}`);
      expect(receiptRes.status).toBe(200);
      expect(receiptRes.body.financials).toEqual({
        currency: 'SATS',
        total_amount: 100,
        merchant_amount: 94,
        platform_fee: 6
      });

      // Verify database row was NOT mutated
      const row = await db.get('SELECT * FROM invoices WHERE payment_hash = ?', legacyLnHash);
      expect(row.amount_sats).toBe(100);
      expect(row.commission_sats).toBe(6);
      expect(row.forwarded_amount_sats).toBe(94);
      expect(row.amount_sats).toBe(row.forwarded_amount_sats + row.commission_sats);
    });

    it('preserves legacy Lightning rows missing policy metadata but containing persisted fee/net', async () => {
      const db = getDb();
      const legacyNoMetaHash = 'hist_ln_nometa_' + crypto.randomBytes(4).toString('hex');
      // Legacy row: fee_policy_version IS NULL, but commission_sats and forwarded_amount_sats are stored
      await db.run(
        `INSERT INTO invoices (
          payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, 
          status, protocol, created_at
        ) VALUES (?, ?, ?, ?, ?, 'settled', 'l402', '2026-01-20T00:00:00.000Z')`,
        legacyNoMetaHash,
        TEST_API_KEY,
        22,
        6,
        16
      );

      const receiptRes = await request(app).get(`/invoice/receipt/${legacyNoMetaHash}`);
      expect(receiptRes.status).toBe(200);
      expect(receiptRes.body.financials).toEqual({
        currency: 'SATS',
        total_amount: 22,
        merchant_amount: 16,
        platform_fee: 6
      });
      expect(receiptRes.body.record.fee_policy_version).toBe('legacy_v1_1pct');
    });

    it('correctly handles legacy Lightning rows missing all derived fields via version-aware fallback (1% + 5 sats)', async () => {
      const db = getDb();
      const legacyNoDerivedHash = 'hist_ln_noderived_' + crypto.randomBytes(4).toString('hex');
      // Very old legacy row lacking commission_sats and forwarded_amount_sats
      await db.run(
        `INSERT INTO invoices (
          payment_hash, api_key, amount_sats, status, protocol, created_at
        ) VALUES (?, ?, ?, 'settled', 'l402', '2025-12-10T00:00:00.000Z')`,
        legacyNoDerivedHash,
        TEST_API_KEY,
        22
      );

      const receiptRes = await request(app).get(`/invoice/receipt/${legacyNoDerivedHash}`);
      expect(receiptRes.status).toBe(200);
      expect(receiptRes.body.financials).toEqual({
        currency: 'SATS',
        total_amount: 22,
        merchant_amount: 16,
        platform_fee: 6
      });
    });

    it('rejects Lightning payments with non-positive net', async () => {
      const res6 = await request(app)
        .post('/invoice/create')
        .set('X-Api-Key', TEST_API_KEY)
        .send({ amount_sats: 6, protocol: 'L402' });

      expect(res6.status).toBe(400);
      expect(res6.body.code).toBe('INVALID_AMOUNT');
    });

    it('idempotency does not alter accounting or double-charge fees', async () => {
      const idemKey = 'lightning_idem_test_' + crypto.randomUUID();
      const res1 = await request(app)
        .post('/invoice/create')
        .set('X-Api-Key', TEST_API_KEY)
        .set('Idempotency-Key', idemKey)
        .send({ amount_sats: 100, protocol: 'L402' });

      expect(res1.status).toBe(200);
      expect(res1.body.amount_sats).toBe(100);
      expect(res1.body.commission_sats).toBe(8); // ceil(100 * 3%) + 5 = 3 + 5 = 8
      expect(res1.body.merchant_amount_sats).toBe(92);

      const res2 = await request(app)
        .post('/invoice/create')
        .set('X-Api-Key', TEST_API_KEY)
        .set('Idempotency-Key', idemKey)
        .send({ amount_sats: 100, protocol: 'L402' });

      expect(res2.status).toBe(200);
      expect(res2.body.payment_hash).toBe(res1.body.payment_hash);
      expect(res2.body.amount_sats).toBe(100);
      expect(res2.body.commission_sats).toBe(8);
      expect(res2.body.merchant_amount_sats).toBe(92);
    });
  });

  describe('2. Base USDC Canonical & Historical Accounting Immutability', () => {
    it('creates new $0.010000 USDC invoice (minimum-fee canary): gross=10000 units, fee=1000 units, net=9000 units', async () => {
      const res = await request(app)
        .post('/invoice/create')
        .set('X-Api-Key', TEST_API_KEY)
        .send({ amount_usd: '0.01', protocol: 'X402' });

      expect(res.status).toBe(200);
      expect(res.body.amount_usd).toBe(0.01);
      expect(res.body.protocol).toBe('x402');

      const db = getDb();
      const row = await db.get('SELECT * FROM invoices WHERE payment_hash = ?', res.body.payment_hash);
      expect(BigInt(row.usdc_amount_units)).toBe(10_000n);
      expect(BigInt(row.service_fee_usdc_units)).toBe(1000n);
      expect(BigInt(row.net_usdc_units)).toBe(9000n);
      expect(row.fee_policy_version).toBe(CURRENT_FEE_POLICY_VERSION);
      expect(BigInt(row.usdc_amount_units)).toBe(BigInt(row.net_usdc_units) + BigInt(row.service_fee_usdc_units));
    });

    it('creates new $0.040000 USDC invoice (percentage-fee canary): gross=40000 units, fee=1200 units, net=38800 units', async () => {
      // 0.040000 USDC gross (40,000 units): 40,000 * 300 / 10,000 = 1,200 units fee ($0.001200), 38,800 units net ($0.038800)
      const res = await request(app)
        .post('/invoice/create')
        .set('X-Api-Key', TEST_API_KEY)
        .send({ amount_usd: '0.04', protocol: 'X402' });

      expect(res.status).toBe(200);
      expect(res.body.amount_usd).toBe(0.04);
      expect(res.body.protocol).toBe('x402');

      const db = getDb();
      const row = await db.get('SELECT * FROM invoices WHERE payment_hash = ?', res.body.payment_hash);
      expect(BigInt(row.usdc_amount_units)).toBe(40_000n);
      expect(BigInt(row.service_fee_usdc_units)).toBe(1200n);
      expect(BigInt(row.net_usdc_units)).toBe(38_800n);
      expect(row.fee_policy_version).toBe(CURRENT_FEE_POLICY_VERSION);
      expect(BigInt(row.usdc_amount_units)).toBe(BigInt(row.net_usdc_units) + BigInt(row.service_fee_usdc_units));
    });

    it('preserves pre-change Base invoice created under 1%: retains 0.010000 gross, 0.000100 fee, 0.009900 net', async () => {
      const db = getDb();
      const legacyUsdcHash = 'hist_usdc_' + crypto.randomBytes(4).toString('hex');
      // Historical record created under 1% policy: $0.010000 gross, 100 units ($0.000100) fee, 9900 units ($0.009900) net
      await db.run(
        `INSERT INTO invoices (
          payment_hash, api_key, usdc_amount, usdc_amount_units, service_fee_usdc_units, net_usdc_units,
          fee_policy_version, status, protocol, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'settled', 'x402', ?)`,
        legacyUsdcHash,
        TEST_API_KEY,
        0.01,
        '10000',
        '100',
        '9900',
        LEGACY_FEE_POLICY_VERSION,
        '2026-02-01T00:00:00.000Z'
      );

      // Receipt check must return exact historical 1% values, NOT 3% (1000 fee / 9000 net)
      const receiptRes = await request(app).get(`/invoice/receipt/${legacyUsdcHash}`);
      expect(receiptRes.status).toBe(200);
      expect(receiptRes.body.financials.total_amount).toBe(0.01);
      expect(receiptRes.body.financials.platform_fee).toBe(0.0001);
      expect(receiptRes.body.financials.merchant_amount).toBe(0.0099);
      expect(receiptRes.body.record.fee_policy_version).toBe(LEGACY_FEE_POLICY_VERSION);
      expect(receiptRes.body.financials.total_amount).toBeCloseTo(
        receiptRes.body.financials.merchant_amount + receiptRes.body.financials.platform_fee,
        6
      );

      // Database row remains unmutated
      const row = await db.get('SELECT * FROM invoices WHERE payment_hash = ?', legacyUsdcHash);
      expect(BigInt(row.usdc_amount_units)).toBe(10_000n);
      expect(BigInt(row.service_fee_usdc_units)).toBe(100n);
      expect(BigInt(row.net_usdc_units)).toBe(9900n);
    });

    it('correctly handles unmigrated legacy Base records lacking unit columns via version-aware fallback', async () => {
      const db = getDb();
      const unmigratedHash = 'unmigrated_usdc_' + crypto.randomBytes(4).toString('hex');
      // Very old historical record without usdc_amount_units or net_usdc_units populated
      await db.run(
        `INSERT INTO invoices (
          payment_hash, api_key, usdc_amount, status, protocol, created_at
        ) VALUES (?, ?, ?, 'settled', 'x402', ?)`,
        unmigratedHash,
        TEST_API_KEY,
        0.01,
        '2025-12-01T00:00:00.000Z'
      );

      const receiptRes = await request(app).get(`/invoice/receipt/${unmigratedHash}`);
      expect(receiptRes.status).toBe(200);
      expect(receiptRes.body.financials.total_amount).toBe(0.01);
      expect(receiptRes.body.financials.platform_fee).toBe(0.0001); // 1% fallback
      expect(receiptRes.body.financials.merchant_amount).toBe(0.0099); // 99% fallback
      expect(receiptRes.body.record.fee_policy_version).toBe('legacy_v1_1pct');
    });
  });

  describe('3. Payout Queue, Retries & Idempotency', () => {
    it('retried payout uses exactly the original persisted net amount', async () => {
      const db = getDb();
      const failedJobId = crypto.randomUUID();
      const failedHash = 'failed_payout_' + crypto.randomBytes(4).toString('hex');

      // Enqueue job with persisted net 9000 units ($0.009 USDC)
      await db.run(
        `INSERT INTO payout_queue (
          id, payment_hash, api_key, amount_sats, usdc_address, usdc_amount,
          net_usdc_units, service_fee_usdc_units, gross_usdc_units,
          protocol, status, attempts, next_retry_at, created_at
        ) VALUES (?, ?, ?, 0, ?, 0.009, 9000, 1000, 10000, 'x402', 'failed', 2, datetime('now'), ?)`,
        failedJobId,
        failedHash,
        TEST_API_KEY,
        TEST_USDC_ADDR,
        new Date().toISOString()
      );

      // Admin retries the payout
      const retryRes = await request(app)
        .post('/admin/retry-payout')
        .set('X-Admin-Key', 'test_admin_secret_key_123456')
        .send({ id: failedJobId });

      expect(retryRes.status).toBe(200);

      // Verify payout queue job status is reset to pending with its exact original net_usdc_units preserved
      const retriedJob = await db.get('SELECT * FROM payout_queue WHERE id = ?', failedJobId);
      expect(retriedJob.status).toBe('pending');
      expect(retriedJob.net_usdc_units).toBe(9000);
      expect(retriedJob.usdc_amount).toBe(0.009);
    });
  });

  describe('4. Dashboard Transactions History Immutability', () => {
    it('reports historical rows with their authentic historical values and new rows with 3% values', async () => {
      const db = getDb();
      const legacyRowHash = 'dash_legacy_' + crypto.randomBytes(4).toString('hex');
      const newRowHash = 'dash_new_' + crypto.randomBytes(4).toString('hex');

      // Historical row (1% policy: $0.01 gross, $0.0001 fee, $0.0099 net)
      await db.run(
        `INSERT INTO invoices (
          payment_hash, api_key, usdc_amount, usdc_amount_units, service_fee_usdc_units, net_usdc_units,
          fee_policy_version, status, protocol, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'settled', 'x402', '2026-02-01T00:00:00.000Z')`,
        legacyRowHash,
        TEST_API_KEY,
        0.01,
        '10000',
        '100',
        '9900',
        LEGACY_FEE_POLICY_VERSION
      );

      // New row (3% policy: $0.01 gross, $0.0010 fee, $0.0090 net)
      await db.run(
        `INSERT INTO invoices (
          payment_hash, api_key, usdc_amount, usdc_amount_units, service_fee_usdc_units, net_usdc_units,
          fee_policy_version, status, protocol, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'settled', 'x402', '2026-08-19T00:00:00.000Z')`,
        newRowHash,
        TEST_API_KEY,
        0.01,
        '10000',
        '1000',
        '9000',
        CURRENT_FEE_POLICY_VERSION
      );

      const res = await request(app)
        .get('/merchant/transactions?range=all')
        .set('X-Api-Key', TEST_API_KEY);

      expect(res.status).toBe(200);
      const legacyTx = res.body.find((t: any) => t.payment_hash === legacyRowHash);
      const newTx = res.body.find((t: any) => t.payment_hash === newRowHash);

      expect(legacyTx).toBeDefined();
      expect(legacyTx.gross_display).toBe('$0.01');
      expect(legacyTx.fee_display).toBe('$0.0001');
      expect(legacyTx.net_display).toBe('$0.0099');

      expect(newTx).toBeDefined();
      expect(newTx.gross_display).toBe('$0.01');
      expect(newTx.fee_display).toBe('$0.0010');
      expect(newTx.net_display).toBe('$0.0090');
    });
  });

  describe('5. Manifest Specifications & Security', () => {
    it('exposes canonical 3% fee policy in Open Tag Spec', async () => {
      const res = await request(app).get('/spec/open-tag/1.0');
      expect(res.status).toBe(200);
      expect(res.body.fees.lightning).toBe('3% + 5 sats per successful transaction');
      expect(res.body.fees.base_usdc).toBe('3% per successful transaction; $0.001 minimum fee');
    });

    it('exposes canonical 3% fee policy in Agent Manifest (/aipp-agent.json)', async () => {
      const res = await request(app).get('/aipp-agent.json');
      expect(res.status).toBe(200);
      expect(res.body.fees.lightning_fee).toBe('3% + 5 sats per successful transaction');
      expect(res.body.fees.base_usdc).toBe('3% per successful transaction ($0.001 minimum fee)');
    });

    it('exposes canonical 3% fee policy in Smart Tag Manifest', async () => {
      const res = await request(app).get('/t/test_smart_tag_pricing/manifest');
      expect(res.status).toBe(200);
      const lnMethod = res.body.accepts.find((m: any) => m.protocol === 'L402');
      const usdcMethod = res.body.accepts.find((m: any) => m.protocol === 'x402');
      expect(lnMethod.fee_policy).toBe('3% + 5 sats per successful transaction');
      expect(usdcMethod.fee_policy).toBe('3% per successful transaction ($0.001 minimum fee)');
    });

    it('does not leak private keys or secrets in any response', async () => {
      const res = await request(app).get('/aipp-agent.json');
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(process.env.AIPP_BASE_PRIVATE_KEY);
      expect(text).not.toContain(process.env.LNBITS_WEBHOOK_SECRET);
    });
  });
});
