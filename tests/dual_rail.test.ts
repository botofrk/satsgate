process.env.LNBITS_WEBHOOK_SECRET = 'test_webhook_secret_key_123456';
process.env.DB_PATH = './data/aipp_dual_rail_test.db';
process.env.AIPP_BASE_PRIVATE_KEY = '0x0123456789012345678901234567890123456789012345678901234567890123';

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';
import { initDb, getDb, closeDb } from '../src/config/database';
import request from 'supertest';
import { app } from '../src/server';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const TEST_DB_PATH = path.join(__dirname, '../data/aipp_dual_rail_test.db');

describe('Dual-Rail (L402 + X402) Integration Tests', () => {
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
    
    // Seed test merchant with BOTH Lightning and USDC configured
    const db = getDb();
    await db.run(
      "INSERT INTO merchants (api_key, ln_address, usdc_address, payout_mode, created_at) VALUES (?, ?, ?, ?, ?)",
      "dual_test_merchant_key",
      "merchant@aipp.dev",
      "0x1234567890123456789012345678901234567890",
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

  it('should successfully create DUAL invoice returning both rails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/payments')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ payment_hash: 'mock_dual_payment_hash_123', payment_request: 'lnbc1...' })
        });
      }
      return Promise.resolve({ ok: false });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(app)
      .post('/invoice/create')
      .set('X-Api-Key', 'dual_test_merchant_key')
      .send({ amount_usd: 1.0, protocol: 'DUAL' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('payment_hash');
    expect(res.body).toHaveProperty('protocol', 'dual');
    expect(res.body).toHaveProperty('amount_usd', 1.0);
    expect(res.body).toHaveProperty('amount_sats');
    expect(res.body).toHaveProperty('payment_request');
    expect(res.body).toHaveProperty('pay_to');
    expect(res.body).toHaveProperty('network');
    expect(res.body).toHaveProperty('token');
  });

  it('should settle DUAL invoice via LNBits Lightning path (L402)', async () => {
    const db = getDb();
    const paymentHash = 'dual_l402_hash_' + crypto.randomBytes(4).toString('hex');
    process.env.LNBITS_INVOICE_KEY = 'test_lnbits_invoice_key_123';
    
    // Manually insert a pending DUAL invoice
    await db.run(
      "INSERT INTO invoices (payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, status, protocol, usdc_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      paymentHash,
      "dual_test_merchant_key",
      2000,
      20,
      1980,
      'pending',
      'dual',
      1.30,
      new Date().toISOString()
    );

    // Setup LNBits mock
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/payments/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ paid: true, preimage: 'preimage_l402_xyz' })
        });
      }
      return Promise.resolve({ ok: false });
    });
    vi.stubGlobal('fetch', fetchMock);

    // Poll status (without tx_hash) - should verify via LNBits and settle as L402
    const res = await request(app)
      .get(`/invoice/status/${paymentHash}`);

    expect(res.status).toBe(200);
    expect(res.body.paid).toBe(true);
    expect(res.body.protocol).toBe('L402');
    expect(res.body.preimage).toBe('preimage_l402_xyz');
  });

  it('should settle DUAL invoice via USDC on Base path (X402)', async () => {
    const db = getDb();
    const paymentHash = 'demo_dual_x402_hash_' + crypto.randomBytes(4).toString('hex');
    
    // Manually insert a pending DUAL invoice
    await db.run(
      "INSERT INTO invoices (payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, status, protocol, usdc_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      paymentHash,
      "dual_test_merchant_key",
      2000,
      20,
      1980,
      'pending',
      'dual',
      1.30,
      new Date().toISOString()
    );

    // Import base services dynamically to mock or we can just mock verifyUsdcPayment in base.ts
    // For simplicity, we can stub global fetch or verifyUsdcPayment on base service.
    // Let's see: verifyUsdcPayment uses getProvider().getTransaction which uses RPC fetch.
    // Let's mock verifyUsdcPayment directly by importing it and spying on it, or mock the RPC fetch responses.
    // Alternatively, we can just stub fetch which getProvider() uses!
    // But since it's easier to mock verifyUsdcPayment, let's spy on the base module or fetch.
    const fetchMock = vi.fn().mockImplementation(() => {
      // Mock Base RPC responses for transaction verification
      return Promise.resolve({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          result: {
            status: "0x1", // success
            logs: [
              {
                address: "0x036cbd53842c5426634e7929541ec2318f3dcf7e", // USDC Sepolia
                topics: [
                  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", // Transfer topic
                  "0x0000000000000000000000000000000000000000000000000000000000000000", // from dummy
                  "0x0000000000000000000000001234567890123456789012345678901234567890"  // to merchant / gateway (derived from AIPP private key which we mock or default)
                ],
                data: "0x000000000000000000000000000000000000000000000000000000000013d620" // 1.30 USDC (1,300,000 units)
              }
            ]
          }
        })
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    // Let's mock verifyUsdcPayment using vitest spy to make the test RPC-independent
    const baseService = await import('../src/services/base');
    const verifySpy = vi.spyOn(baseService, 'verifyUsdcPayment').mockResolvedValue(true);

    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    
    // Poll status passing tx_hash - should verify via USDC and settle as x402
    const res = await request(app)
      .get(`/invoice/status/${paymentHash}`)
      .query({ tx_hash: txHash });

    expect(res.status).toBe(200);
    expect(res.body.paid).toBe(true);
    expect(res.body.protocol).toBe('x402');
    expect(res.body.preimage).toBe(txHash);
    expect(verifySpy).toHaveBeenCalledWith(txHash, 1.30);
  });
});
