import { AippConfig, ChargeParams, ChargeResponse, ChargeStatus, AippErrorResponse } from './types';

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
   * Creates a new Lightning Invoice
   */
  async createCharge(params: ChargeParams): Promise<ChargeResponse> {
    if (!params.amountSats && !params.amountUsd) {
      throw new Error('AIPP: Either amountSats or amountUsd is required');
    }
    
    const body: any = { memo: params.memo };
    if (params.amountSats) body.amount_sats = params.amountSats;
    if (params.amountUsd) body.amount_usd = params.amountUsd;

    return this.request<ChargeResponse>('/invoice/create', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Checks the status of an existing charge
   */
  async getCharge(paymentHash: string): Promise<ChargeStatus> {
    if (!paymentHash) {
      throw new Error('AIPP: paymentHash is required');
    }
    return this.request<ChargeStatus>(`/invoice/status/${paymentHash}`, {
      method: 'GET',
    });
  }

  /**
   * Triggers a manual withdrawal of your merchant balance
   */
  async payout(): Promise<import('./types').PayoutResponse> {
    return this.request<import('./types').PayoutResponse>('/merchant/payout', {
      method: 'POST',
    });
  }
}
