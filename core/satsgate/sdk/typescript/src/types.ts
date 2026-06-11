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

export interface VerifyResult {
  ok: boolean;
  client_id: number;
  resource: string | null;
  payment_hash: string;
  charged_credits: number;
  new_balance: number;
  valid_until: number;
}

export interface Plan {
  id: string;
  title: string;
  price_sats: number;
  credits: number;
  note: string;
}

export interface BalanceResponse {
  ok: boolean;
  client_id: number;
  credits: number;
}

export interface ClientInfo {
  ok: boolean;
  client_id: number;
  credits: number;
  payee_lightning_address: string | null;
}

export interface LedgerEntry {
  id: number;
  delta_credits: number;
  reason: string;
  ref: string | null;
  created_at: number;
  created_at_iso: string;
}

export interface LedgerResponse {
  ok: boolean;
  client_id: number;
  balance: number;
  entries: LedgerEntry[];
  next_before_id: number | null;
}

export interface UsageSummary {
  ok: boolean;
  client_id: number;
  balance: number;
  window_hours: number;
  summary: {
    since_ts: number;
    since_iso: string;
    credits_in: number;
    credits_out: number;
    net_credits: number;
    verify_events: number;
    topup_events: number;
    by_reason: Array<{
      reason: string;
      events: number;
      net_credits: number;
      credits_in: number;
      credits_out: number;
    }>;
  };
}

export interface UsageDaily {
  ok: boolean;
  client_id: number;
  balance: number;
  daily: {
    tz: string;
    days: number;
    start_ts: number;
    start_iso: string;
    end_ts: number;
    end_iso: string;
    series: Array<{
      day: string;
      day_start_ts: number;
      day_start_iso: string;
      day_end_ts: number;
      credits_in: number;
      credits_out: number;
      net_credits: number;
      verify_events: number;
      topup_events: number;
    }>;
  };
}

export interface ForecastData {
  status: 'insufficient_data' | 'low_sample' | 'ok';
  current_balance_credits: number;
  verify_rate_credits_per_day: number;
  estimated_days_remaining: number | null;
  estimated_depletion_iso: string | null;
}

export interface Recommendation {
  buffer_days: number;
  should_topup_now: boolean | null;
  credits_to_buy_recommended: number;
  recommended_purchase: {
    plan_id: string;
    quantity: number;
    sats_total: number;
    credits_total: number;
    plan: Plan;
  } | null;
  reason: string;
  note: string;
}

export interface UsageForecast {
  ok: boolean;
  client_id: number;
  balance: number;
  forecast: ForecastData;
  recommendation: Recommendation;
}
