import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { initDb, getDb } from '../src/config/database';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = path.join(__dirname, '../data/aipp_test.db');

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
  });

  afterAll(async () => {
    // Clean up test database files
    const db = getDb();
    await db.close();
    
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
    expect(res.body).toHaveProperty('amount_sats', 1000);
  });
});
