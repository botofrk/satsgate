/**
 * Challenge returned by the satsgate paywall challenge endpoint.
 */
export interface Challenge {
  resource: string;
  amount_sats: number;
  payee_lightning_address: string | null;
  macaroon: string;
  invoice: string;
  payment_hash: string;
  valid_until: number;
  www_authenticate: string;
}

/**
 * Result returned by the satsgate paywall verify endpoint.
 */
export interface VerifyResult {
  ok: boolean;
  client_id: number;
  resource: string | null;
  payment_hash: string;
  charged_credits: number;
  new_balance: number;
  valid_until: number;
}

/**
 * Generic satsgate error shape.
 */
export interface SatsgateError {
  message: string;
  statusCode?: number;
  data?: Record<string, unknown>;
}
