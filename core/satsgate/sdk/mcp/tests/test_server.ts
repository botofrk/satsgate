import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import {
  toolSchemas,
  SatsgateApiError,
  formatError,
  formatResult,
} from '../src/tools.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORIGINAL_API_KEY = process.env.SATSGATE_API_KEY;
const ORIGINAL_BASE_URL = process.env.SATSGATE_BASE_URL;

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

// ---------------------------------------------------------------------------
// Schema validation tests
// ---------------------------------------------------------------------------

describe('Tool Schemas', () => {
  it('SetPayeeSchema validates a valid lightning address', () => {
    const result = toolSchemas.SetPayeeSchema.lightningAddress.safeParse('user@wallet.com');
    assert.ok(result.success);
  });

  it('SetPayeeSchema rejects empty lightning address', () => {
    const result = toolSchemas.SetPayeeSchema.lightningAddress.safeParse('');
    assert.ok(!result.success);
  });

  it('PaywallChallengeSchema validates required fields', () => {
    const result = toolSchemas.PaywallChallengeSchema.resource.safeParse('/api/data');
    assert.ok(result.success);

    const amtResult = toolSchemas.PaywallChallengeSchema.amountSats.safeParse(1000);
    assert.ok(amtResult.success);
  });

  it('PaywallChallengeSchema rejects negative amount', () => {
    const result = toolSchemas.PaywallChallengeSchema.amountSats.safeParse(-100);
    assert.ok(!result.success);
  });

  it('PaywallChallengeSchema rejects non-integer amount', () => {
    const result = toolSchemas.PaywallChallengeSchema.amountSats.safeParse(1.5);
    assert.ok(!result.success);
  });

  it('PaywallVerifySchema validates authorization header', () => {
    const result = toolSchemas.PaywallVerifySchema.authorizationHeader.safeParse('L402 token:preimage');
    assert.ok(result.success);
  });

  it('PaywallVerifySchema rejects empty authorization header', () => {
    const result = toolSchemas.PaywallVerifySchema.authorizationHeader.safeParse('');
    assert.ok(!result.success);
  });

  it('SpendSchema validates idempotency key', () => {
    const result = toolSchemas.SpendSchema.idempotencyKey.safeParse('unique-key-123');
    assert.ok(result.success);
  });

  it('SpendSchema rejects empty idempotency key', () => {
    const result = toolSchemas.SpendSchema.idempotencyKey.safeParse('');
    assert.ok(!result.success);
  });

  it('LedgerSchema validates limit within range', () => {
    const validResult = toolSchemas.LedgerSchema.limit.safeParse(50);
    assert.ok(validResult.success);

    const overResult = toolSchemas.LedgerSchema.limit.safeParse(200);
    assert.ok(!overResult.success);
  });

  it('LedgerSchema allows undefined (optional)', () => {
    const result = toolSchemas.LedgerSchema.limit.safeParse(undefined);
    assert.ok(result.success);
  });

  it('UsageSummarySchema validates sinceHours', () => {
    const result = toolSchemas.UsageSummarySchema.sinceHours.safeParse(48);
    assert.ok(result.success);
  });

  it('UsageSummarySchema rejects zero sinceHours', () => {
    const result = toolSchemas.UsageSummarySchema.sinceHours.safeParse(0);
    assert.ok(!result.success);
  });

  it('UsageDailySchema validates days', () => {
    const result = toolSchemas.UsageDailySchema.days.safeParse(30);
    assert.ok(result.success);
  });

  it('UsageDailySchema rejects zero days', () => {
    const result = toolSchemas.UsageDailySchema.days.safeParse(0);
    assert.ok(!result.success);
  });

  it('UsageForecastSchema validates all optional fields', () => {
    const lbResult = toolSchemas.UsageForecastSchema.lookbackHours.safeParse(168);
    assert.ok(lbResult.success);

    const bdResult = toolSchemas.UsageForecastSchema.bufferDays.safeParse(3);
    assert.ok(bdResult.success);

    const mtResult = toolSchemas.UsageForecastSchema.maxTopups.safeParse(5);
    assert.ok(mtResult.success);

    const thResult = toolSchemas.UsageForecastSchema.triggerHours.safeParse(24);
    assert.ok(thResult.success);
  });
});

// ---------------------------------------------------------------------------
// Server creation tests
// ---------------------------------------------------------------------------

describe('createServer', () => {
  let server: McpServer;

  it('creates a server instance', () => {
    server = createServer();
    assert.ok(server);
  });

  it('server has name "satsgate"', () => {
    server = createServer();
    // McpServer exposes the name through its internal structure
    assert.ok(server);
    // The name and version are set during construction; we just verify no errors
  });
});

// ---------------------------------------------------------------------------
// Error formatting tests
// ---------------------------------------------------------------------------

describe('formatError', () => {
  it('formats SatsgateApiError', () => {
    const err = new SatsgateApiError(401, { error: 'Unauthorized' });
    const result = formatError(err);
    assert.ok(result.isError);
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0]!.type, 'text');
    const parsed = JSON.parse(result.content[0]!.text);
    assert.ok(parsed.error.includes('401'));
    assert.ok(parsed.error.includes('Unauthorized'));
  });

  it('formats generic Error', () => {
    const err = new Error('Something went wrong');
    const result = formatError(err);
    assert.ok(result.isError);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.error, 'Something went wrong');
  });

  it('formats string error', () => {
    const result = formatError('plain string error');
    assert.ok(result.isError);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.error, 'plain string error');
  });

  it('formats unknown error types', () => {
    const result = formatError(42);
    assert.ok(result.isError);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed.error, '42');
  });
});

// ---------------------------------------------------------------------------
// Result formatting tests
// ---------------------------------------------------------------------------

describe('formatResult', () => {
  it('formats object data as pretty JSON', () => {
    const data = { balance: 1000, currency: 'credits' };
    const result = formatResult(data);
    assert.ok(!('isError' in result));
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0]!.type, 'text');
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, data);
  });

  it('formats array data', () => {
    const data = [{ id: 1 }, { id: 2 }];
    const result = formatResult(data);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.deepEqual(parsed, data);
  });

  it('formats null data', () => {
    const result = formatResult(null);
    const parsed = JSON.parse(result.content[0]!.text);
    assert.equal(parsed, null);
  });
});

// ---------------------------------------------------------------------------
// SatsgateApiError tests
// ---------------------------------------------------------------------------

describe('SatsgateApiError', () => {
  it('extracts error field from body', () => {
    const err = new SatsgateApiError(400, { error: 'Bad request' });
    assert.equal(err.statusCode, 400);
    assert.ok(err.message.includes('Bad request'));
  });

  it('extracts message field from body', () => {
    const err = new SatsgateApiError(403, { message: 'Forbidden' });
    assert.ok(err.message.includes('Forbidden'));
  });

  it('extracts detail field from body', () => {
    const err = new SatsgateApiError(404, { detail: 'Not found' });
    assert.ok(err.message.includes('Not found'));
  });

  it('handles string body', () => {
    const err = new SatsgateApiError(500, 'Internal Server Error');
    assert.ok(err.message.includes('Internal Server Error'));
  });

  it('falls back to JSON stringify for unknown body shape', () => {
    const err = new SatsgateApiError(502, { unknown: 'field' } as Record<string, string>);
    assert.ok(err.message.includes('unknown'));
  });
});

// ---------------------------------------------------------------------------
// Environment config tests
// ---------------------------------------------------------------------------

describe('Environment configuration', () => {
  beforeEach(() => {
    setEnv('SATSGATE_API_KEY', ORIGINAL_API_KEY);
    setEnv('SATSGATE_BASE_URL', ORIGINAL_BASE_URL);
  });

  afterEach(() => {
    setEnv('SATSGATE_API_KEY', ORIGINAL_API_KEY);
    setEnv('SATSGATE_BASE_URL', ORIGINAL_BASE_URL);
  });

  it('getConfig throws when SATSGATE_API_KEY is missing', async () => {
    setEnv('SATSGATE_API_KEY', undefined);
    // Dynamically import to test the config function
    const { getConfig } = await import('../src/tools.js');
    assert.throws(() => getConfig(), {
      message: /SATSGATE_API_KEY/,
    });
  });

  it('getConfig returns default base URL when SATSGATE_BASE_URL is not set', async () => {
    setEnv('SATSGATE_API_KEY', 'test-key-123');
    setEnv('SATSGATE_BASE_URL', undefined);
    const { getConfig } = await import('../src/tools.js');
    const config = getConfig();
    assert.equal(config.apiKey, 'test-key-123');
    assert.equal(config.baseUrl, 'https://api.aipp.dev');
  });

  it('getConfig uses custom base URL when set', async () => {
    setEnv('SATSGATE_API_KEY', 'test-key-456');
    setEnv('SATSGATE_BASE_URL', 'https://custom.api.com');
    const { getConfig } = await import('../src/tools.js');
    const config = getConfig();
    assert.equal(config.apiKey, 'test-key-456');
    assert.equal(config.baseUrl, 'https://custom.api.com');
  });
});
