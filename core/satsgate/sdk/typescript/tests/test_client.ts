import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SatsgateClient } from '../src/client.js';
import { SatsgateError } from '../src/errors.js';
import { parseL402Authorization, decodeMacaroonPayload } from '../src/helpers.js';

// ---------------------------------------------------------------------------
// parseL402Authorization
// ---------------------------------------------------------------------------

describe('parseL402Authorization', () => {
  it('throws on empty input', () => {
    assert.throws(() => parseL402Authorization(''), /missing/);
  });

  it('throws on missing scheme (no space)', () => {
    assert.throws(() => parseL402Authorization('just-token'), /malformed/);
  });

  it('throws on wrong scheme', () => {
    assert.throws(() => parseL402Authorization('Basic abc123'), /not L402/);
  });

  it('throws on missing preimage (no colon in token)', () => {
    assert.throws(() => parseL402Authorization('L402 macaroon-only'), /malformed L402/);
  });

  it('throws on invalid hex in preimage', () => {
    assert.throws(() => parseL402Authorization('L402 mac:not-hex!'), /not hex/);
  });

  it('parses a valid L402 authorization string', () => {
    const [mac, pre] = parseL402Authorization('L402 abc:0123456789abcdef');
    assert.equal(mac, 'abc');
    assert.equal(pre, '0123456789abcdef');
  });

  it('is case-insensitive for the scheme', () => {
    const [mac, pre] = parseL402Authorization('l402 mymac:deadbeef');
    assert.equal(mac, 'mymac');
    assert.equal(pre, 'deadbeef');
  });

  it('handles empty preimage gracefully (valid hex, zero length)', () => {
    const [mac, pre] = parseL402Authorization('L402 macaroon:');
    assert.equal(mac, 'macaroon');
    assert.equal(pre, '');
  });
});

// ---------------------------------------------------------------------------
// decodeMacaroonPayload
// ---------------------------------------------------------------------------

describe('decodeMacaroonPayload', () => {
  it('decodes a valid JSON payload followed by a fake signature', () => {
    const payload = Buffer.from(
      JSON.stringify({ ph: 'aabb', res: 'test', exp: 9999 }) + '.fakesig',
    );
    const b64 = payload.toString('base64url');
    const decoded = decodeMacaroonPayload(b64);
    assert.equal(decoded.ph, 'aabb');
    assert.equal(decoded.res, 'test');
    assert.equal(decoded.exp, 9999);
  });

  it('handles payloads that need base64 padding', () => {
    // Create a payload whose base64url encoding is not a multiple of 4
    const json = JSON.stringify({ ph: 'cc' }) + '.sig';
    const payload = Buffer.from(json);
    const b64 = payload.toString('base64url');
    const decoded = decodeMacaroonPayload(b64);
    assert.equal(decoded.ph, 'cc');
  });
});

// ---------------------------------------------------------------------------
// SatsgateClient constructor
// ---------------------------------------------------------------------------

describe('SatsgateClient', () => {
  it('uses default baseUrl when none is provided', () => {
    const client = new SatsgateClient({ apiKey: 'sg_test_abc' });
    assert.equal(client.baseUrl, 'https://api.aipp.dev');
  });

  it('strips trailing slash from baseUrl', () => {
    const client = new SatsgateClient({
      baseUrl: 'http://localhost:8000/',
      apiKey: 'sg_test_abc',
    });
    assert.equal(client.baseUrl, 'http://localhost:8000');
  });

  it('preserves baseUrl without trailing slash', () => {
    const client = new SatsgateClient({
      baseUrl: 'https://custom.example.com',
      apiKey: 'sg_test_abc',
    });
    assert.equal(client.baseUrl, 'https://custom.example.com');
  });

  it('exposes the apiKey as a readonly property', () => {
    const client = new SatsgateClient({ apiKey: 'sg_live_xyz' });
    assert.equal(client.apiKey, 'sg_live_xyz');
  });
});

// ---------------------------------------------------------------------------
// SatsgateError
// ---------------------------------------------------------------------------

describe('SatsgateError', () => {
  it('sets name and message', () => {
    const err = new SatsgateError('something went wrong');
    assert.equal(err.name, 'SatsgateError');
    assert.equal(err.message, 'something went wrong');
    assert.equal(err.statusCode, undefined);
    assert.equal(err.data, undefined);
  });

  it('captures statusCode and data when provided', () => {
    const err = new SatsgateError('fail', {
      statusCode: 402,
      data: { detail: 'insufficient credits' },
    });
    assert.equal(err.statusCode, 402);
    assert.deepEqual(err.data, { detail: 'insufficient credits' });
  });

  it('is an instance of Error', () => {
    const err = new SatsgateError('test');
    assert.ok(err instanceof Error);
  });
});
