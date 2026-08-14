export interface AippConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface ChargeParams {
  amountSats?: number;
  amountUsd?: number;
  memo?: string;
  protocol?: 'L402' | 'x402' | 'dual';
}

export interface ChargeResponse {
  payment_hash: string;
  protocol: 'L402' | 'x402' | 'dual';
  amount_usd?: number;
  pay_to?: string;
  network?: string;
  token?: string;
  payment_request?: string; // For L402
  amount_sats?: number; // For L402
  commission_sats?: number;
  merchant_amount_sats?: number;
}

export interface ChargeStatus {
  paid: boolean;
  status: 'pending' | 'settled';
  preimage: string | null;
  protocol?: string;
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

export interface ReceiptRecord {
  type: string;
  note: string;
}

export interface ReceiptFinancials {
  currency: string;
  total_amount: number;
  merchant_amount: number;
  platform_fee: number;
}

export interface ReceiptPaymentDetails {
  protocol: string;
  proof: string | null;
  merchant_destination: string | null;
}

/** Machine-readable receipt for a settled invoice. */
export interface ReceiptResponse {
  receipt_id: string;
  transaction_id: string;
  date: string;
  status: string;
  record: ReceiptRecord;
  payment_details: ReceiptPaymentDetails;
  financials: ReceiptFinancials;
}

export interface MarketplaceTool {
  name: string;
  description: string;
  priceUsdt: number;
}

/** PaidMCP.dev compatible manifest for listing on AI agent marketplaces */
export interface MarketplaceManifest {
  id: string;
  name: string;
  tagline: string;
  description: string;
  endpoint: string;
  chains: string[];
  tools: MarketplaceTool[];
  tags: string[];
}
