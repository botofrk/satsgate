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

export interface AccessTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_at: string;
}

export interface OpenTagContentResponse {
  success: boolean;
  tag_id: string;
  title: string;
  message: string;
  content: {
    type: 'redirect' | 'data';
    url?: string;
    [key: string]: unknown;
  };
}

export type UsdcPaymentStage = 
  | 'CREATED'
  | 'PAYMENT_SENT_PROOF_PENDING'
  | 'PROOF_SUBMITTED'
  | 'SETTLED'
  | 'AUTHORIZED'
  | 'COMPLETED';

export interface PayAndSettleUsdcOptions {
  /** The AIPP payment hash to settle (e.g. x402_...) */
  paymentHash: string;
  /** The expected USD amount to pay (e.g. 0.01) */
  amountUsd: number;
  /** The recipient Gateway address on Base */
  payTo: string;
  /** Optional Smart Tag ID if settling a Smart Tag */
  tagId?: string;
  /** Optional access claim secret returned upon tag invoice creation */
  accessClaimSecret?: string;
  /** Custom on-chain transaction dispatcher callback returning txHash */
  sendUsdcTransaction?: (details: {
    to: string;
    amountUnits: bigint;
    amountUsd: number;
    tokenContract: string;
    chainId: number;
  }) => Promise<string>;
  /** Ethers.js or Web3-compatible signer with sendTransaction */
  signer?: {
    sendTransaction: (tx: { to: string; data: string; [key: string]: any }) => Promise<{ hash?: string } | string>;
    [key: string]: any;
  };
  /** If already paid on-chain, provide existing txHash to resume proof submission/settlement without re-paying */
  existingTxHash?: string;
  /** Target token contract address (default: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) */
  tokenContract?: string;
  /** If true, automatically fetches the protected content after obtaining access token */
  fetchContent?: boolean;
  /** Polling interval in ms (default: 1500ms) */
  pollIntervalMs?: number;
  /** Timeout in ms (default: 60000ms) */
  timeoutMs?: number;
}

export interface PayAndSettleUsdcResult {
  stage: UsdcPaymentStage;
  paymentHash: string;
  txHash?: string;
  paid: boolean;
  status: 'pending' | 'settled';
  preimage?: string | null;
  accessToken?: string;
  tokenType?: string;
  expiresAt?: string;
  content?: OpenTagContentResponse;
  error?: string;
}

