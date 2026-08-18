process.env.NODE_ENV = 'test';
process.env.DB_PATH = './data/aipp_concurrent_test.db';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { initDb, getDb, closeDb } from '../src/config/database';
import { publishInvoiceUpdate } from '../src/services/events';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const TEST_DB_PATH = path.join(__dirname, '../data/aipp_concurrent_test.db');

describe('20 Concurrent 0.01 USD Wallet Payments Load Test', () => {
  const NUM_TRANSACTIONS = 20;
  const AMOUNT_USD = 0.01;
  const apiKey = 'aipp_merch_concurrent_20';

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

    // Mock LNBits outbound fetch
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/payments')) {
        const hash = crypto.randomBytes(16).toString('hex');
        return Promise.resolve({
          ok: true,
          json: async () => ({ payment_hash: hash, payment_request: `lnbc_${hash}` })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }));

    // Seed test merchant
    const db = getDb();
    await db.run(
      "INSERT INTO merchants (api_key, ln_address, email, payout_mode, payout_threshold_sats, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      apiKey,
      "tester20@aipp.dev",
      "tester20@aipp.dev",
      "manual",
      0,
      new Date().toISOString()
    );
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await closeDb();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    const walFile = `${TEST_DB_PATH}-wal`;
    const shmFile = `${TEST_DB_PATH}-shm`;
    if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
    if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);
  });

  it('should process 20 concurrent 0.01 USD transactions with real-time SSE streaming', async () => {
    const db = getDb();
    console.log(`\n🚀 Step 1: Concurrently creating ${NUM_TRANSACTIONS} invoices of $${AMOUNT_USD.toFixed(2)} USD...`);

    const createStartTime = Date.now();

    // 1. Create 20 invoices in parallel
    const createPromises = Array.from({ length: NUM_TRANSACTIONS }).map(async (_, idx) => {
      const res = await request(app)
        .post('/invoice/create')
        .set('X-Api-Key', apiKey)
        .send({
          protocol: 'L402',
          amount_usd: AMOUNT_USD
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('payment_hash');
      expect(res.body).toHaveProperty('payment_request');
      return {
        index: idx + 1,
        payment_hash: res.body.payment_hash,
        payment_request: res.body.payment_request,
        amount_sats: res.body.amount_sats
      };
    });

    const createdInvoices = await Promise.all(createPromises);
    const createDuration = Date.now() - createStartTime;
    console.log(`✅ All ${NUM_TRANSACTIONS} invoices created in ${createDuration} ms!`);

    expect(createdInvoices.length).toBe(NUM_TRANSACTIONS);

    // 2. Open 20 SSE streams in parallel and verify settlement
    console.log(`📡 Step 2: Concurrently streaming & settling all ${NUM_TRANSACTIONS} invoices...`);
    const settleStartTime = Date.now();

    const settlePromises = createdInvoices.map(async (inv) => {
      const startStreamTime = Date.now();

      const timer = setInterval(async () => {
        await db.run(
          "UPDATE invoices SET status = 'settled', preimage = ? WHERE payment_hash = ?",
          `preimage_${inv.payment_hash}`,
          inv.payment_hash
        );

        publishInvoiceUpdate(inv.payment_hash, {
          paid: true,
          status: 'settled',
          preimage: `preimage_${inv.payment_hash}`,
          protocol: 'L402',
          amount_sats: inv.amount_sats
        });
      }, 30);

      const sseRes = await request(app)
        .get(`/invoice/stream/${inv.payment_hash}`)
        .expect(200);

      clearInterval(timer);

      const latencyMs = Date.now() - startStreamTime;
      expect(sseRes.headers['content-type']).toContain('text/event-stream');
      expect(sseRes.text).toContain('"paid":true');
      expect(sseRes.text).toContain('"status":"settled"');
      expect(sseRes.text).toContain(`preimage_${inv.payment_hash}`);

      return {
        index: inv.index,
        hash: inv.payment_hash,
        latencyMs
      };
    });

    const settlementResults = await Promise.all(settlePromises);
    const totalSettleDuration = Date.now() - settleStartTime;

    console.log('\n================================================================');
    console.log('📊 20 CONCURRENT WALLET PAYMENTS BENCHMARK RESULTS:');
    console.log('================================================================');

    let totalLatency = 0;
    let minLatency = 999999;
    let maxLatency = 0;

    settlementResults.forEach((r) => {
      console.log(
        `✓ Tx #${r.index.toString().padStart(2, '0')} [${r.hash.substring(0, 18)}...] -> SSE Verified in ${r.latencyMs} ms`
      );
      totalLatency += r.latencyMs;
      if (r.latencyMs < minLatency) minLatency = r.latencyMs;
      if (r.latencyMs > maxLatency) maxLatency = r.latencyMs;
    });

    const avgLatency = (totalLatency / NUM_TRANSACTIONS).toFixed(1);

    console.log('----------------------------------------------------------------');
    console.log(`🎯 Total Transactions Tested : ${NUM_TRANSACTIONS} / ${NUM_TRANSACTIONS}`);
    console.log(`💰 Cost per Transaction      : $${AMOUNT_USD.toFixed(2)} USD`);
    console.log(`✅ Success Rate              : 100.0% (${NUM_TRANSACTIONS}/${NUM_TRANSACTIONS} Successful)`);
    console.log(`⏱️ Avg SSE Latency           : ${avgLatency} ms`);
    console.log(`🚀 Min / Max Latency         : ${minLatency} ms / ${maxLatency} ms`);
    console.log(`⚡ Total Settlement Time     : ${totalSettleDuration} ms`);
    console.log('================================================================\n');

    // Verify DB integrity
    const countRow = await db.get("SELECT COUNT(*) as count FROM invoices WHERE api_key = ? AND status = 'settled'", apiKey);
    expect(countRow.count).toBe(NUM_TRANSACTIONS);
  }, 25000);
});
