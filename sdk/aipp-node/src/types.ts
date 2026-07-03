export interface AippConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface ChargeParams {
  amountSats: number;
  memo?: string;
}

export interface ChargeResponse {
  payment_request: string;
  payment_hash: string;
  amount_sats: number;
}

export interface ChargeStatus {
  status: 'pending' | 'settled';
  payment_hash: string;
  amount_sats: number;
}

export interface AippErrorResponse {
  error: string;
  code?: string;
}

export interface PayoutResponse {
  message: string;
  amount_sats?: number;
}
