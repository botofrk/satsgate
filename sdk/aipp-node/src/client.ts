import { 
  AippConfig, 
  ChargeParams, 
  ChargeResponse, 
  ChargeStatus, 
  AippErrorResponse, 
  ReceiptResponse, 
  MarketplaceManifest,
  AccessTokenResponse,
  OpenTagContentResponse,
  PayAndSettleUsdcOptions,
  PayAndSettleUsdcResult,
  UsdcPaymentStage
} from './types';

export const BASE_USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const BASE_CHAIN_ID = 8453;

export class Aipp {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: AippConfig) {
    if (!config.apiKey) {
      throw new Error('AIPP: apiKey is required');
    }
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://aipp.dev';
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-Api-Key': this.apiKey,
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });
    
    if (!response.ok) {
      let errorData: AippErrorResponse;
      try {
        errorData = await response.json();
      } catch (err) {
        throw new Error(`AIPP API Error: ${response.status} ${response.statusText}`);
      }
      throw new Error(`AIPP API Error: ${errorData.error || response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Creates a new Invoice (either L402 or x402)
   */
  async createCharge(params: ChargeParams): Promise<ChargeResponse> {
    if (!params.amountSats && !params.amountUsd) {
      throw new Error('AIPP: Either amountSats or amountUsd is required');
    }
    
    const body: any = { memo: params.memo };
    if (params.amountSats) body.amount_sats = params.amountSats;
    if (params.amountUsd) body.amount_usd = params.amountUsd;
    if (params.protocol) body.protocol = params.protocol;

    return this.request<ChargeResponse>('/invoice/create', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Checks the status of an existing charge, optionally submitting proof tx_hash
   */
  async getCharge(paymentHash: string, txHash?: string): Promise<ChargeStatus> {
    if (!paymentHash) {
      throw new Error('AIPP: paymentHash is required');
    }
    const query = txHash ? `?tx_hash=${txHash}` : '';
    return this.request<ChargeStatus>(`/invoice/status/${paymentHash}${query}`, {
      method: 'GET',
    });
  }

  /**
   * Exchanges an access claim secret for a Bearer access token upon invoice settlement
   */
  async issueAccessToken(tagId: string, paymentHash: string, accessClaimSecret: string): Promise<AccessTokenResponse> {
    if (!tagId || !paymentHash || !accessClaimSecret) {
      throw new Error('AIPP: tagId, paymentHash, and accessClaimSecret are required');
    }
    return this.request<AccessTokenResponse>(`/t/${tagId}/access-token`, {
      method: 'POST',
      body: JSON.stringify({
        payment_hash: paymentHash,
        access_claim_secret: accessClaimSecret
      })
    });
  }

  /**
   * Retrieves protected content for a Smart Tag using an access token
   */
  async getContent(tagId: string, accessToken: string): Promise<OpenTagContentResponse> {
    if (!tagId || !accessToken) {
      throw new Error('AIPP: tagId and accessToken are required');
    }
    return this.request<OpenTagContentResponse>(`/t/${tagId}/content`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
  }

  /**
   * High-level automated helper for Base USDC / x402 payments.
   * Executes: PAY -> PROVE -> SETTLE -> AUTHORIZE -> ACCESS in a single resumable operation.
   */
  async payAndSettleUsdc(options: PayAndSettleUsdcOptions): Promise<PayAndSettleUsdcResult> {
    const {
      paymentHash,
      amountUsd,
      payTo,
      tagId,
      accessClaimSecret,
      sendUsdcTransaction,
      signer,
      existingTxHash,
      tokenContract = BASE_USDC_CONTRACT,
      fetchContent = false,
      pollIntervalMs = 1500,
      timeoutMs = 60000
    } = options;

    if (!paymentHash) {
      throw new Error('AIPP: paymentHash is required');
    }

    // Validate token contract if custom one specified
    if (tokenContract.toLowerCase() !== BASE_USDC_CONTRACT.toLowerCase()) {
      throw new Error(`AIPP: Invalid token contract "${tokenContract}". Expected native Base USDC (${BASE_USDC_CONTRACT}).`);
    }

    let txHash = existingTxHash;
    let stage: UsdcPaymentStage = existingTxHash ? 'PAYMENT_SENT_PROOF_PENDING' : 'CREATED';

    // 1. Execute on-chain transfer if tx_hash not already supplied
    if (!txHash) {
      if (!payTo || typeof payTo !== 'string' || !payTo.startsWith('0x')) {
        throw new Error('AIPP: Valid payTo gateway address (0x...) is required for USDC payment');
      }
      if (typeof amountUsd !== 'number' || amountUsd <= 0 || isNaN(amountUsd)) {
        throw new Error('AIPP: Valid positive amountUsd is required');
      }

      const amountUnits = BigInt(Math.round(amountUsd * 1_000_000));

      if (sendUsdcTransaction) {
        txHash = await sendUsdcTransaction({
          to: payTo,
          amountUnits,
          amountUsd,
          tokenContract,
          chainId: BASE_CHAIN_ID
        });
      } else if (signer) {
        const cleanTo = payTo.replace(/^0x/, '').toLowerCase().padStart(64, '0');
        const amountHex = amountUnits.toString(16).padStart(64, '0');
        const data = `0xa9059cbb${cleanTo}${amountHex}`;

        const txRes = await signer.sendTransaction({
          to: tokenContract,
          data,
          chainId: BASE_CHAIN_ID
        });
        txHash = typeof txRes === 'string' ? txRes : txRes.hash || (txRes as any).transactionHash;
      } else {
        throw new Error('AIPP: Either signer, sendUsdcTransaction callback, or existingTxHash must be provided');
      }

      if (!txHash) {
        throw new Error('AIPP: Failed to obtain transaction hash from payment provider');
      }
      stage = 'PAYMENT_SENT_PROOF_PENDING';
    }

    // 2. Submit Proof & Poll for Settlement
    let statusRes: ChargeStatus;
    try {
      statusRes = await this.getCharge(paymentHash, txHash);
      stage = 'PROOF_SUBMITTED';
    } catch (err: any) {
      // Payment sent on-chain, but proof request errored (e.g. network glitch)
      // DO NOT re-pay; return with txHash intact so caller can resume.
      return {
        stage: 'PAYMENT_SENT_PROOF_PENDING',
        paymentHash,
        txHash,
        paid: false,
        status: 'pending',
        error: `Payment sent on-chain (${txHash}), but initial proof submission failed: ${err.message}. Resume using existingTxHash.`
      };
    }

    const startTime = Date.now();
    while (!statusRes.paid && (Date.now() - startTime) < timeoutMs) {
      await new Promise(r => setTimeout(r, pollIntervalMs));
      try {
        statusRes = await this.getCharge(paymentHash, txHash);
      } catch (pollErr: any) {
        // Continue polling on transient network errors
      }
    }

    if (!statusRes.paid) {
      return {
        stage: 'PROOF_SUBMITTED',
        paymentHash,
        txHash,
        paid: false,
        status: 'pending',
        error: `Settlement polling timed out after ${timeoutMs}ms. Payment is on-chain (${txHash}); resume using existingTxHash.`
      };
    }

    stage = 'SETTLED';
    const result: PayAndSettleUsdcResult = {
      stage,
      paymentHash,
      txHash,
      paid: true,
      status: 'settled',
      preimage: statusRes.preimage || txHash
    };

    // 3. Optional Access Token Exchange
    if (tagId && accessClaimSecret) {
      try {
        const tokenData = await this.issueAccessToken(tagId, paymentHash, accessClaimSecret);
        result.accessToken = tokenData.access_token;
        result.tokenType = tokenData.token_type;
        result.expiresAt = tokenData.expires_at;
        result.stage = 'AUTHORIZED';

        // 4. Optional Protected Content Retrieval
        if (fetchContent) {
          result.content = await this.getContent(tagId, tokenData.access_token);
          result.stage = 'COMPLETED';
        }
      } catch (authErr: any) {
        result.error = `Payment settled, but access authorization failed: ${authErr.message}`;
      }
    }

    return result;
  }

  /**
   * Triggers automated payout processing for merchant earnings
   */
  async payout(): Promise<import('./types').PayoutResponse> {
    return this.request<import('./types').PayoutResponse>('/merchant/payout', {
      method: 'POST',
    });
  }

  /**
   * Retrieves a machine-readable receipt for a settled invoice.
   * Only available for invoices with status = 'settled'.
   */
  async getReceipt(paymentHash: string): Promise<ReceiptResponse> {
    if (!paymentHash) {
      throw new Error('AIPP: paymentHash is required');
    }
    return this.request<ReceiptResponse>(`/invoice/receipt/${paymentHash}`, {
      method: 'GET',
    });
  }

  /**
   * Creates a 3-second Smart Price Tag
   */
  async createTag(params: { title: string; price: number; redirectUrl?: string }): Promise<{ id: string; url: string; title: string; amount_usd: number }> {
    return this.request<{ id: string; url: string; title: string; amount_usd: number }>('/merchant/links/create', {
      method: 'POST',
      body: JSON.stringify({
        title: params.title,
        amount_usd: params.price,
        redirect_url: params.redirectUrl || 'https://aipp.dev'
      })
    });
  }
}

