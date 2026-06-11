import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface SatsgateConfig {
  apiKey: string;
  baseUrl: string;
}

function getConfig(): SatsgateConfig {
  const apiKey = process.env.SATSGATE_API_KEY;
  if (!apiKey) {
    throw new Error('SATSGATE_API_KEY environment variable is required');
  }
  const baseUrl = process.env.SATSGATE_BASE_URL ?? 'https://api.aipp.dev';
  return { apiKey, baseUrl };
}

// ---------------------------------------------------------------------------
// HTTP client helpers
// ---------------------------------------------------------------------------

interface SatsgateErrorBody {
  error?: string;
  message?: string;
  detail?: string;
}

class SatsgateApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: SatsgateErrorBody | string,
  ) {
    const msg =
      typeof body === 'string'
        ? body
        : body.error ?? body.message ?? body.detail ?? JSON.stringify(body);
    super(`Satsgate API error (${statusCode}): ${msg}`);
    this.name = 'SatsgateApiError';
  }
}

async function apiRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const { apiKey, baseUrl } = getConfig();

  const url = `${baseUrl.replace(/\/+$/, '')}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'User-Agent': '@satsgate/mcp/0.4.0',
  };

  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);

  if (!response.ok) {
    let errorBody: SatsgateErrorBody | string;
    try {
      errorBody = (await response.json()) as SatsgateErrorBody;
    } catch {
      errorBody = await response.text();
    }
    throw new SatsgateApiError(response.status, errorBody);
  }

  // Some endpoints may return 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

function formatError(err: unknown): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  const message =
    err instanceof SatsgateApiError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
    isError: true as const,
  };
}

function formatResult(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

// ---------------------------------------------------------------------------
// Zod schemas for tool inputs
// ---------------------------------------------------------------------------

const SetPayeeSchema = {
  lightningAddress: z.string().min(1).describe('Lightning address to set as payee (e.g. user@wallet.com)'),
};

const PaywallChallengeSchema = {
  resource: z.string().min(1).describe('Unique resource identifier (URI or path)'),
  amountSats: z.number().int().positive().describe('Amount in satoshis required to access the resource'),
  memo: z.string().optional().describe('Optional human-readable memo for the invoice'),
};

const PaywallVerifySchema = {
  authorizationHeader: z.string().min(1).describe('The full L402 Authorization header value from the client'),
  expectedResource: z.string().optional().describe('Optional expected resource identifier to validate against'),
  costCredits: z.number().optional().describe('Optional credit cost to deduct upon successful verification'),
};

const SpendSchema = {
  idempotencyKey: z.string().min(1).describe('Unique key to prevent duplicate spends'),
  cost: z.number().optional().describe('Optional custom cost in credits (defaults to plan cost)'),
};

const LedgerSchema = {
  limit: z.number().int().positive().max(100).optional().describe('Maximum number of entries to return (default 20, max 100)'),
  beforeId: z.string().optional().describe('Cursor for pagination: return entries before this ID'),
};

const UsageSummarySchema = {
  sinceHours: z.number().positive().optional().describe('Number of hours to look back for usage (default 24)'),
};

const UsageDailySchema = {
  days: z.number().int().positive().optional().describe('Number of days of daily usage to retrieve (default 7)'),
};

const UsageForecastSchema = {
  lookbackHours: z.number().positive().optional().describe('Hours of historical data to analyze (default 168 = 7 days)'),
  bufferDays: z.number().optional().describe('Days of buffer to add to forecast (default 3)'),
  maxTopups: z.number().int().optional().describe('Maximum number of top-ups to include in forecast (default 5)'),
  triggerHours: z.number().positive().optional().describe('Hours threshold to trigger alert (default 24)'),
};

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerTools(server: McpServer): void {
  // 1. satsgate_balance
  server.tool(
    'satsgate_balance',
    'Get the current credit balance for the authenticated account',
    {},
    async () => {
      try {
        const data = await apiRequest('GET', '/v1/balance');
        return formatResult(data);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // 2. satsgate_client_info
  server.tool(
    'satsgate_client_info',
    'Get the client profile information for the authenticated account',
    {},
    async () => {
      try {
        const data = await apiRequest('GET', '/v1/client');
        return formatResult(data);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // 3. satsgate_set_payee
  server.tool(
    'satsgate_set_payee',
    'Set the payee Lightning address for receiving payments',
    SetPayeeSchema,
    async ({ lightningAddress }) => {
      try {
        const data = await apiRequest('PUT', '/v1/client/payee', {
          lightning_address: lightningAddress,
        });
        return formatResult(data);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // 4. satsgate_list_plans
  server.tool(
    'satsgate_list_plans',
    'List all available credit purchase plans',
    {},
    async () => {
      try {
        const data = await apiRequest('GET', '/v1/plans');
        return formatResult(data);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // 5. satsgate_paywall_challenge
  server.tool(
    'satsgate_paywall_challenge',
    'Create a new L402 paywall challenge for a protected resource',
    PaywallChallengeSchema,
    async ({ resource, amountSats, memo }) => {
      try {
        const data = await apiRequest('POST', '/v1/paywall/challenge', {
          resource,
          amount_sats: amountSats,
          ...(memo !== undefined && { memo }),
        });
        return formatResult(data);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // 6. satsgate_paywall_verify
  server.tool(
    'satsgate_paywall_verify',
    'Verify an L402 payment authorization header and optionally deduct credits',
    PaywallVerifySchema,
    async ({ authorizationHeader, expectedResource, costCredits }) => {
      try {
        const data = await apiRequest('POST', '/v1/paywall/verify', {
          authorization_header: authorizationHeader,
          ...(expectedResource !== undefined && { expected_resource: expectedResource }),
          ...(costCredits !== undefined && { cost_credits: costCredits }),
        });
        return formatResult(data);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // 7. satsgate_spend
  server.tool(
    'satsgate_spend',
    'Spend credits with an idempotency key to prevent duplicate charges',
    SpendSchema,
    async ({ idempotencyKey, cost }) => {
      try {
        const data = await apiRequest('POST', '/v1/spend', {
          idempotency_key: idempotencyKey,
          ...(cost !== undefined && { cost }),
        });
        return formatResult(data);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // 8. satsgate_ledger
  server.tool(
    'satsgate_ledger',
    'Get ledger entries showing credit transactions (debits and credits)',
    LedgerSchema,
    async ({ limit, beforeId }) => {
      try {
        const params = new URLSearchParams();
        if (limit !== undefined) params.set('limit', String(limit));
        if (beforeId !== undefined) params.set('before_id', beforeId);
        const query = params.toString();
        const path = `/v1/ledger${query ? `?${query}` : ''}`;
        const data = await apiRequest('GET', path);
        return formatResult(data);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // 9. satsgate_usage_summary
  server.tool(
    'satsgate_usage_summary',
    'Get a summary of credit usage over a specified time period',
    UsageSummarySchema,
    async ({ sinceHours }) => {
      try {
        const params = new URLSearchParams();
        if (sinceHours !== undefined) params.set('since_hours', String(sinceHours));
        const query = params.toString();
        const path = `/v1/usage/summary${query ? `?${query}` : ''}`;
        const data = await apiRequest('GET', path);
        return formatResult(data);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // 10. satsgate_usage_daily
  server.tool(
    'satsgate_usage_daily',
    'Get daily usage breakdown for the specified number of days',
    UsageDailySchema,
    async ({ days }) => {
      try {
        const params = new URLSearchParams();
        if (days !== undefined) params.set('days', String(days));
        const query = params.toString();
        const path = `/v1/usage/daily${query ? `?${query}` : ''}`;
        const data = await apiRequest('GET', path);
        return formatResult(data);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // 11. satsgate_usage_forecast
  server.tool(
    'satsgate_usage_forecast',
    'Get usage forecast based on historical data with configurable parameters',
    UsageForecastSchema,
    async ({ lookbackHours, bufferDays, maxTopups, triggerHours }) => {
      try {
        const body: Record<string, unknown> = {};
        if (lookbackHours !== undefined) body.lookback_hours = lookbackHours;
        if (bufferDays !== undefined) body.buffer_days = bufferDays;
        if (maxTopups !== undefined) body.max_topups = maxTopups;
        if (triggerHours !== undefined) body.trigger_hours = triggerHours;
        const data = await apiRequest('POST', '/v1/usage/forecast', body);
        return formatResult(data);
      } catch (err) {
        return formatError(err);
      }
    },
  );
}

// Export schemas for testing
export const toolSchemas = {
  SetPayeeSchema,
  PaywallChallengeSchema,
  PaywallVerifySchema,
  SpendSchema,
  LedgerSchema,
  UsageSummarySchema,
  UsageDailySchema,
  UsageForecastSchema,
};

export { SatsgateApiError, getConfig, formatError, formatResult };
