import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { aippTopupTool } from '../src/index';

vi.mock('axios');

const mockedAxios = vi.mocked(axios);

describe('aippTopupTool', () => {
  const mockConfig = {
    apiKey: 'sg_test_key',
    baseUrl: 'http://test.local',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('topup tool definition', () => {
    it('returns a tool with correct description', () => {
      const tool = aippTopupTool({ ...mockConfig, walletToken: 'test_token' });
      expect(tool.description).toContain('Automatically top up');
      expect(tool.description).toContain('AIPP');
    });

    it('requires wallet token or throws', () => {
      delete process.env.ALBY_BEARER_TOKEN;
      delete process.env.LNBITS_ADMIN_KEY;
      expect(() => aippTopupTool({ apiKey: 'sg_test' })).toThrow('walletToken');
    });
  });

  describe('execute with Alby wallet', () => {
    beforeEach(() => {
      process.env.ALBY_BEARER_TOKEN = 'test_alby_token';
    });

    it('handles 402 challenge and pays invoice', async () => {
      // Step 1: First call returns 402
      mockedAxios.create.mockReturnThis();
      mockedAxios.get.mockRejectedValueOnce({
        response: {
          status: 402,
          headers: {
            'www-authenticate': 'L402 macaroon="test_mac", invoice="lnmock:test_invoice"',
          },
        },
      });

      // Step 2: Alby payment
      mockedAxios.post.mockResolvedValueOnce({
        data: { preimage: 'test_preimage' },
      });

      // Step 3: Verify topup
      mockedAxios.get.mockResolvedValueOnce({
        data: { credits_added: 200, new_balance: 200 },
      });

      const tool = aippTopupTool(mockConfig);
      const result = await tool.execute({ planId: 'trial' });

      expect(result).toContain('Success');
      expect(result).toContain('200');
    });

    it('handles payment failure', async () => {
      mockedAxios.create.mockReturnThis();
      mockedAxios.get.mockRejectedValueOnce({
        response: {
          status: 402,
          headers: {
            'www-authenticate': 'L402 macaroon="test_mac", invoice="lnmock:test_invoice"',
          },
        },
      });

      // Alby payment fails
      mockedAxios.post.mockRejectedValueOnce(new Error('Payment failed'));

      const tool = aippTopupTool(mockConfig);
      const result = await tool.execute({ planId: 'trial' });

      expect(result).toContain('Error');
    });
  });

  describe('execute with LNbits wallet', () => {
    beforeEach(() => {
      process.env.LNBITS_ADMIN_KEY = 'test_lnbits_key';
      process.env.LNBITS_URL = 'https://lnbits.example.com';
    });

    it('handles LNbits payment flow', async () => {
      mockedAxios.create.mockReturnThis();
      mockedAxios.get.mockRejectedValueOnce({
        response: {
          status: 402,
          headers: {
            'www-authenticate': 'L402 macaroon="test_mac", invoice="lnmock:test_invoice"',
          },
        },
      });

      // LNbits payment
      mockedAxios.post.mockResolvedValueOnce({
        data: { payment_hash: 'test_ph' },
      });

      // Polling for preimage
      mockedAxios.get.mockResolvedValueOnce({
        data: { preimage: 'test_preimage' },
      });

      // Verify topup
      mockedAxios.get.mockResolvedValueOnce({
        data: { credits_added: 200, new_balance: 200 },
      });

      const tool = aippTopupTool({ ...mockConfig, walletType: 'lnbits' });
      const result = await tool.execute({ planId: 'trial' });

      expect(result).toContain('Success');
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      process.env.ALBY_BEARER_TOKEN = 'test_alby_token';
    });

    it('handles non-402 response', async () => {
      mockedAxios.create.mockReturnThis();
      mockedAxios.get.mockRejectedValueOnce({
        response: { status: 500, data: { error: 'server_error' } },
      });

      const tool = aippTopupTool(mockConfig);
      const result = await tool.execute({ planId: 'trial' });

      expect(result).toContain('AIPP Topup Error');
    });

    it('handles missing L402 auth header', async () => {
      mockedAxios.create.mockReturnThis();
      mockedAxios.get.mockRejectedValueOnce({
        response: {
          status: 402,
          headers: {},
        },
      });

      const tool = aippTopupTool(mockConfig);
      const result = await tool.execute({ planId: 'trial' });

      expect(result).toBe('Failed to parse L402 challenge from AIPP.');
    });
  });
});
