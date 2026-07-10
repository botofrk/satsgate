export interface AippConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface ChargeParams {
  amountSats?: number;
  amountUsd?: number;
  memo?: string;
  protocol?: 'L402' | 'x402';
}

export interface ChargeResponse {
  payment_hash: string;
  protocol: 'L402' | 'x402';
  amount_usd?: number;
  pay_to?: string;
  network?: string;
  token?: string;
  payment_request?: string; // For L402
  amount_sats?: number; // For L402
}

export interface ChargeStatus {
  paid: boolean;
  status: 'pending' | 'settled';
  preimage: string | null;
}

export interface AippErrorResponse {
  error: string;
  code?: string;
}

export interface PayoutResponse {
  message: string;
  amount_sats?: number;
  amount_usd?: number;
}
