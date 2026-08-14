import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { initDb, getDb } from '../src/config/database';
import apiRoutes from '../src/routes/api';

import { errorHandler } from '../src/utils/error';

const app = express();
app.use(express.json());
app.use('/', apiRoutes);
app.use(errorHandler);

describe('Passkey & WebAuthn Authentication System', () => {
  beforeAll(async () => {
    process.env.DB_PATH = ':memory:';
    await initDb();
  });

  it('1. GET /auth/session without cookie returns 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/auth/session');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('2. POST /auth/passkey/register/options returns valid registration options', async () => {
    const res = await request(app)
      .post('/auth/passkey/register/options')
      .send({ ln_address: 'testmerchant@phoenixwallet.me' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.challenge_id).toBeDefined();
    expect(res.body.options.challenge).toBeDefined();
    expect(res.body.options.rp.id).toBe('localhost');
  });

  it('3. POST /auth/passkey/login/options returns valid authentication options', async () => {
    const res = await request(app).post('/auth/passkey/login/options').send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.challenge_id).toBeDefined();
    expect(res.body.options.challenge).toBeDefined();
  });

  it('4. POST /auth/passkey/login/verify with fake/tampered challenge returns 400 Bad Request', async () => {
    const res = await request(app)
      .post('/auth/passkey/login/verify')
      .send({ challenge_id: 'wch_fake_123', response: { id: 'fake_cred' } });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WEBAUTHN_AUTHENTICATION_FAILED');
  });

  it('5. Existing merchant migration options endpoint validates API key', async () => {
    const db = getDb();
    const testKey = 'aipp_merch_mig_test_key_123';
    await db.run(
      'INSERT INTO merchants (api_key, ln_address, created_at) VALUES (?, ?, ?)',
      testKey,
      'migrant@walletofsatoshi.com',
      new Date().toISOString()
    );

    // Invalid API key
    const badRes = await request(app)
      .post('/auth/passkey/migrate/options')
      .send({ api_key: 'aipp_merch_invalid' });
    expect(badRes.status).toBe(401);

    // Valid API key
    const goodRes = await request(app)
      .post('/auth/passkey/migrate/options')
      .send({ api_key: testKey });
    expect(goodRes.status).toBe(200);
    expect(goodRes.body.challenge_id).toBeDefined();
  });

  it('6. DELETE /auth/passkeys/:id prevents deleting the last remaining passkey', async () => {
    const db = getDb();
    const testKey = 'aipp_merch_last_pk_test';
    await db.run(
      'INSERT INTO merchants (api_key, ln_address, created_at) VALUES (?, ?, ?)',
      testKey,
      'solo@phoenixwallet.me',
      new Date().toISOString()
    );

    const pkId = 'pk_only_one';
    await db.run(
      'INSERT INTO merchant_passkeys (id, api_key, credential_id, public_key, counter, device_name, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      pkId,
      testKey,
      'cred_only_one',
      'pubkey_base64',
      0,
      'MacBook Pro',
      new Date().toISOString(),
      new Date().toISOString()
    );

    // Create session token
    const sessToken = 'aipp_sess_test_token_999';
    const crypto = await import('crypto');
    const tokenHash = crypto.createHash('sha256').update(sessToken).digest('hex');
    await db.run(
      'INSERT INTO merchant_sessions (id, api_key, token_hash, expires_at, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      'sess_test_999',
      testKey,
      tokenHash,
      new Date(Date.now() + 3600000).toISOString(),
      new Date().toISOString(),
      new Date().toISOString()
    );

    // Try deleting last passkey
    const delRes = await request(app)
      .delete(`/auth/passkeys/${pkId}`)
      .set('Cookie', [`aipp_session=${sessToken}`]);

    expect(delRes.status).toBe(400);
    expect(delRes.body.code).toBe('LAST_PASSKEY_PROTECTION');
  });

  it('7. POST /auth/logout revokes session token', async () => {
    const db = getDb();
    const testKey = 'aipp_merch_logout_test';
    await db.run(
      'INSERT INTO merchants (api_key, ln_address, created_at) VALUES (?, ?, ?)',
      testKey,
      'logout@phoenixwallet.me',
      new Date().toISOString()
    );

    const sessToken = 'aipp_sess_logout_token';
    const crypto = await import('crypto');
    const tokenHash = crypto.createHash('sha256').update(sessToken).digest('hex');
    await db.run(
      'INSERT INTO merchant_sessions (id, api_key, token_hash, expires_at, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      'sess_logout_123',
      testKey,
      tokenHash,
      new Date(Date.now() + 3600000).toISOString(),
      new Date().toISOString(),
      new Date().toISOString()
    );

    const logoutRes = await request(app)
      .post('/auth/logout')
      .set('Cookie', [`aipp_session=${sessToken}`]);

    expect(logoutRes.status).toBe(200);

    // Verify session is revoked
    const checkRes = await request(app)
      .get('/auth/session')
      .set('Cookie', [`aipp_session=${sessToken}`]);
    expect(checkRes.status).toBe(401);
  });
});
