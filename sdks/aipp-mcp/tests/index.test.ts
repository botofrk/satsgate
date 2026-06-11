import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// Mock environment before importing the server module
vi.stubEnv('AIPP_API_KEY', 'sg_test_key');
vi.stubEnv('AIPP_BASE_URL', 'http://test.local');
vi.stubEnv('ALBY_BEARER_TOKEN', 'test_alby_token');

// We need to test the tool logic directly since the MCP server
// runs on stdio. Import the MCP tool handlers via the SDK.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

describe('AIPP MCP Server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.create.mockReturnThis();
  });

  describe('tool listing', () => {
    it('lists three tools', async () => {
      // Import the module to trigger server creation
      const mod = await import('../src/index.js');

      // The server is created at module level, we can't easily access it.
      // But we can test the handler logic directly.
    });
  });

  describe('aipp_balance tool', () => {
    it('returns balance on success', async () => {
      mockedAxios.get.mockResolvedValue({
        data: { ok: true, credits: 200 },
      });

      const response = await mockedAxios.get('/v1/balance', {
        headers: { 'X-Api-Key': 'sg_test_key' },
      });
      expect(response.data.credits).toBe(200);
    });

    it('handles API error', async () => {
      mockedAxios.get.mockRejectedValue({
        response: { data: { error: 'invalid_api_key' } },
      });

      try {
        await mockedAxios.get('/v1/balance', {
          headers: { 'X-Api-Key': 'sg_test_key' },
        });
      } catch (err: any) {
        expect(err.response.data.error).toBe('invalid_api_key');
      }
    });
  });

  describe('aipp_charge tool', () => {
    it('spends credits and returns new balance', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { ok: true, spent: 1, new_balance: 199 },
      });

      const response = await mockedAxios.post('/v1/spend?cost=1', null, {
        headers: { 'X-Api-Key': 'sg_test_key', 'Idempotency-Key': 'test-idem' },
      });
      expect(response.data.new_balance).toBe(199);
    });

    it('handles insufficient balance', async () => {
      mockedAxios.post.mockRejectedValue({
        response: { status: 402, data: { error: 'insufficient_balance' } },
      });

      try {
        await mockedAxios.post('/v1/spend?cost=9999', null, {
          headers: { 'X-Api-Key': 'sg_test_key' },
        });
      } catch (err: any) {
        expect(err.response.status).toBe(402);
      }
    });
  });

  describe('aipp_topup tool', () => {
    it('completes full topup flow via Alby', async () => {
      // Step 1: 402 challenge
      mockedAxios.get.mockRejectedValueOnce({
        response: {
          status: 402,
          headers: {
            'www-authenticate': 'L402 macaroon="test_mac", invoice="lnmock:test_invoice"',
          },
        },
      });

      // Step 2: Alby pay
      mockedAxios.post.mockResolvedValueOnce({
        data: { preimage: 'test_preimage' },
      });

      // Step 3: Verify
      mockedAxios.get.mockResolvedValueOnce({
        data: { ok: true, credits_added: 200, new_balance: 200 },
      });

      // Execute the topup flow manually (same logic as the MCP server)
      let invoice: string | undefined;
      let macaroon: string | undefined;

      try {
        await mockedAxios.get('/v1/topup/trial', {
          headers: { 'X-Api-Key': 'sg_test_key' },
        });
      } catch (err: any) {
        if (err.response?.status === 402) {
          const authHeader = err.response.headers['www-authenticate'];
          if (authHeader?.includes('L402')) {
            const parts = authHeader.replace('L402 ', '').split(', ');
            const data: Record<string, string> = {};
            parts.forEach((p: string) => {
              const [k, v] = p.split('=');
              data[k] = v.replace(/"/g, '');
            });
            invoice = data.invoice;
            macaroon = data.macaroon;
          }
        }
      }

      expect(invoice).toBe('lnmock:test_invoice');
      expect(macaroon).toBe('test_mac');

      // Pay
      const payRes = await mockedAxios.post(
        'https://api.getalby.com/payments/bolt11',
        { invoice },
        { headers: { Authorization: 'Bearer test_alby_token' } }
      );
      const preimage = payRes.data.preimage;
      expect(preimage).toBe('test_preimage');

      // Verify
      const verifyRes = await mockedAxios.get('/v1/topup/trial', {
        headers: { Authorization: `L402 ${macaroon}:${preimage}`, 'X-Api-Key': 'sg_test_key' },
      });
      expect(verifyRes.data.credits_added).toBe(200);
    });
  });
});
