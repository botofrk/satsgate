import { AippConfig, ChargeParams, ChargeResponse, ChargeStatus, AippErrorResponse, ReceiptResponse, MarketplaceManifest } from './types';

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
   * Checks the status of an existing charge
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
   * Returns the PaidMCP.dev compatible marketplace manifest for this merchant.
   * Use this JSON to list your AIPP-protected endpoints on AI agent directories.
   */
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
