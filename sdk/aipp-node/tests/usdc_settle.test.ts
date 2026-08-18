import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Aipp, BASE_USDC_CONTRACT, BASE_CHAIN_ID } from '../src/client';

describe('AIPP Node SDK - payAndSettleUsdc', () => {
  const apiKey = 'aipp_test_apikey';
  const baseUrl = 'https://mock.aipp.dev';
  let aipp: Aipp;

  beforeEach(() => {
    aipp = new Aipp({ apiKey, baseUrl });
    vi.restoreAllMocks();
  });

  it('Happy path: executes transfer, submits proof, settles, and obtains access token & content', async () => {
    const mockTxHash = '0x111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000';
    const mockPaymentHash = 'x402_test123';
    const mockAccessToken = 'tok_access_123';
    const mockPayTo = '0xGatewayAddress123456789012345678901234';

    const sendTxMock = vi.fn().mockResolvedValue(mockTxHash);

    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      if (url.includes(`/invoice/status/${mockPaymentHash}`)) {
        expect(url).toContain(`tx_hash=${mockTxHash}`);
        return {
          ok: true,
          json: async () => ({
            paid: true,
            status: 'settled',
            preimage: mockTxHash
          })
        };
      }
      if (url.includes('/t/tag_abc/access-token')) {
        const body = JSON.parse(options.body);
        expect(body.payment_hash).toBe(mockPaymentHash);
        expect(body.access_claim_secret).toBe('secret_xyz');
        return {
          ok: true,
          json: async () => ({
            access_token: mockAccessToken,
            token_type: 'Bearer',
            expires_at: '2026-12-31T23:59:59.000Z'
          })
        };
      }
      if (url.includes('/t/tag_abc/content')) {
        expect(options.headers['Authorization']).toBe(`Bearer ${mockAccessToken}`);
        return {
          ok: true,
          json: async () => ({
            success: true,
            tag_id: 'tag_abc',
            title: 'Protected Article',
            message: 'AIPP autonomous payment completed.',
            content: { type: 'data', body: 'Super Secret AI Insight' }
          })
        };
      }
      return { ok: false, status: 404, statusText: 'Not Found' };
    });

    const result = await aipp.payAndSettleUsdc({
      paymentHash: mockPaymentHash,
      amountUsd: 0.01,
      payTo: mockPayTo,
      tagId: 'tag_abc',
      accessClaimSecret: 'secret_xyz',
      sendUsdcTransaction: sendTxMock,
      fetchContent: true,
      pollIntervalMs: 10,
      timeoutMs: 5000
    });

    expect(sendTxMock).toHaveBeenCalledTimes(1);
    expect(sendTxMock).toHaveBeenCalledWith({
      to: mockPayTo,
      amountUnits: 10000n, // 0.01 * 1,000,000
      amountUsd: 0.01,
      tokenContract: BASE_USDC_CONTRACT,
      chainId: BASE_CHAIN_ID
    });

    expect(result.paid).toBe(true);
    expect(result.status).toBe('settled');
    expect(result.stage).toBe('COMPLETED');
    expect(result.txHash).toBe(mockTxHash);
    expect(result.accessToken).toBe(mockAccessToken);
    expect(result.content?.content?.body).toBe('Super Secret AI Insight');
  });

  it('Resume with existingTxHash: skips on-chain transfer and resumes proof submission', async () => {
    const existingHash = '0xExistingTxHash999';
    const mockPaymentHash = 'x402_testResume';
    const sendTxMock = vi.fn();

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes(`/invoice/status/${mockPaymentHash}`)) {
        expect(url).toContain(`tx_hash=${existingHash}`);
        return {
          ok: true,
          json: async () => ({
            paid: true,
            status: 'settled',
            preimage: existingHash
          })
        };
      }
      return { ok: false, status: 404 };
    });

    const result = await aipp.payAndSettleUsdc({
      paymentHash: mockPaymentHash,
      amountUsd: 0.05,
      payTo: '0xGateway',
      existingTxHash: existingHash,
      sendUsdcTransaction: sendTxMock
    });

    expect(sendTxMock).not.toHaveBeenCalled();
    expect(result.paid).toBe(true);
    expect(result.stage).toBe('SETTLED');
    expect(result.txHash).toBe(existingHash);
  });

  it('Transfer succeeds but initial proof network fails: preserves txHash and returns PAYMENT_SENT_PROOF_PENDING without double-paying', async () => {
    const mockTxHash = '0xSentTxSuccess123';
    const mockPaymentHash = 'x402_proofFail';
    const sendTxMock = vi.fn().mockResolvedValue(mockTxHash);

    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: async () => ({ error: 'Bad Gateway' })
      };
    });

    const result = await aipp.payAndSettleUsdc({
      paymentHash: mockPaymentHash,
      amountUsd: 0.01,
      payTo: '0xGateway',
      sendUsdcTransaction: sendTxMock
    });

    expect(sendTxMock).toHaveBeenCalledTimes(1);
    expect(result.paid).toBe(false);
    expect(result.stage).toBe('PAYMENT_SENT_PROOF_PENDING');
    expect(result.txHash).toBe(mockTxHash);
    expect(result.error).toContain('initial proof submission failed');
    expect(result.error).toContain('Resume using existingTxHash');
  });

  it('Rejects invalid token contract client-side before any transfer', async () => {
    const sendTxMock = vi.fn();

    await expect(aipp.payAndSettleUsdc({
      paymentHash: 'x402_badContract',
      amountUsd: 0.01,
      payTo: '0xGateway',
      tokenContract: '0xWrongContractAddress123',
      sendUsdcTransaction: sendTxMock
    })).rejects.toThrow('Invalid token contract');

    expect(sendTxMock).not.toHaveBeenCalled();
  });

  it('Settlement polling timeout: preserves txHash and reports timeout safely', async () => {
    const mockTxHash = '0xTimeoutTxHash';
    const mockPaymentHash = 'x402_timeout';
    const sendTxMock = vi.fn().mockResolvedValue(mockTxHash);

    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({
          paid: false,
          status: 'pending'
        })
      };
    });

    const result = await aipp.payAndSettleUsdc({
      paymentHash: mockPaymentHash,
      amountUsd: 0.01,
      payTo: '0xGateway',
      sendUsdcTransaction: sendTxMock,
      pollIntervalMs: 10,
      timeoutMs: 50
    });

    expect(result.paid).toBe(false);
    expect(result.stage).toBe('PROOF_SUBMITTED');
    expect(result.txHash).toBe(mockTxHash);
    expect(result.error).toContain('Settlement polling timed out');
    expect(result.error).toContain('resume using existingTxHash');
  });
});
