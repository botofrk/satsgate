import { SatsgateError } from './errors.js';
import { parseL402Authorization, decodeMacaroonPayload, sha256Hex } from './helpers.js';
import type {
  Challenge,
  VerifyResult,
  Plan,
  BalanceResponse,
  ClientInfo,
  LedgerResponse,
  UsageSummary,
  UsageDaily,
  UsageForecast,
} from './types.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface SatsgateClientOptions {
  /** Base URL for the satsgate API. Defaults to `https://api.aipp.dev`. */
  baseUrl?: string;
  /** Your satsgate API key (starts with `sg_live_` or `sg_test_`). */
  apiKey: string;
  /** Per-request timeout in milliseconds. Defaults to 10 000 (10 s). */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// LRU Cache (bounded, insertion-ordered eviction)
// ---------------------------------------------------------------------------

class LRUCache<K, V> {
  private map = new Map<K, V>();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const val = this.map.get(key);
    if (val !== undefined) {
      // Move to end (most-recently used)
      this.map.delete(key);
      this.map.set(key, val);
    }
    return val;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    // Evict oldest entries when over capacity
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  get size(): number {
    return this.map.size;
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class SatsgateClient {
  readonly baseUrl: string;
  readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly verified = new LRUCache<string, number>(1000);

  constructor(options: SatsgateClientOptions) {
    this.baseUrl = (options.baseUrl ?? 'https://api.aipp.dev').replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  // ---- internal helpers ---------------------------------------------------

  private headers(): Record<string, string> {
    return { 'X-Api-Key': this.apiKey };
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const resp = await fetch(url, { ...init, signal: controller.signal });

      let data: Record<string, unknown>;
      try {
        data = (await resp.json()) as Record<string, unknown>;
      } catch {
        throw new SatsgateError(
          `request failed (${resp.status}): non-json response`,
          { statusCode: resp.status },
        );
      }

      if (resp.status !== 200 || !data.ok) {
        throw new SatsgateError(
          `request failed (${resp.status}): ${JSON.stringify(data)}`,
          { statusCode: resp.status, data },
        );
      }

      return data as T;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- Plans & billing ----------------------------------------------------

  /** List available top-up plans. */
  async listPlans(): Promise<Plan[]> {
    const data = await this.request<{ ok: boolean; plans: Plan[] }>(
      `${this.baseUrl}/v1/plans`,
    );
    return data.plans;
  }

  /** Get current credit balance. */
  async balance(): Promise<BalanceResponse> {
    return this.request<BalanceResponse>(`${this.baseUrl}/v1/balance`, {
      headers: this.headers(),
    });
  }

  /** Get client info (id, credits, payee address). */
  async getClient(): Promise<ClientInfo> {
    return this.request<ClientInfo>(`${this.baseUrl}/v1/client`, {
      headers: this.headers(),
    });
  }

  /** Set the payee Lightning address for refund / revenue routing. */
  async setPayee(lightningAddress: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`${this.baseUrl}/v1/client/payee`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ payee_lightning_address: lightningAddress }),
    });
  }

  // ---- Paywall ------------------------------------------------------------

  /** Generate an L402 challenge for a protected resource. */
  async paywallChallenge(opts: {
    resource: string;
    amountSats: number;
    memo?: string;
    ttlSeconds?: number;
  }): Promise<Challenge> {
    const body: Record<string, unknown> = {
      resource: opts.resource,
      amount_sats: opts.amountSats,
    };
    if (opts.memo !== undefined) body.memo = opts.memo;
    if (opts.ttlSeconds !== undefined) body.ttl_seconds = opts.ttlSeconds;

    return this.request<Challenge & { ok: boolean }>(
      `${this.baseUrl}/v1/paywall/challenge`,
      {
        method: 'POST',
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
  }

  /**
   * Verify an L402 Authorization header presented by a client.
   *
   * Performs local preimage-hash and expiry checks before calling the server.
   * Results are cached in a bounded LRU (max 1 000 entries) keyed by
   * `payment_hash` so that repeated requests for the same token are served
   * instantly without an extra round-trip.
   */
  async paywallVerify(opts: {
    authorizationHeader: string;
    expectedResource?: string;
    costCredits?: number;
    useCache?: boolean;
  }): Promise<VerifyResult> {
    // --- Parse & validate locally -----------------------------------------
    const [macaroonB64, preimageHex] = parseL402Authorization(
      opts.authorizationHeader,
    );
    const payload = decodeMacaroonPayload(macaroonB64);
    const paymentHash = String(payload.ph ?? '');
    const validUntil = Number(payload.exp ?? 0);

    // Preimage must hash to the declared payment_hash
    if (sha256Hex(preimageHex) !== paymentHash) {
      throw new SatsgateError('preimage does not match payment_hash');
    }

    // Expiry check
    const now = Math.floor(Date.now() / 1000);
    if (validUntil && now > validUntil) {
      throw new SatsgateError('token expired');
    }

    // --- Cache hit? -------------------------------------------------------
    const useCache = opts.useCache !== false;
    if (useCache) {
      const cachedUntil = this.verified.get(paymentHash);
      if (cachedUntil && now <= cachedUntil) {
        return {
          ok: true,
          client_id: -1,
          resource: String(payload.res ?? ''),
          payment_hash: paymentHash,
          charged_credits: 0,
          new_balance: -1,
          valid_until: cachedUntil,
        };
      }
    }

    // --- Server verification ----------------------------------------------
    const idempotencyKey = `sdk:${paymentHash}`;
    const data = await this.request<VerifyResult & { ok: boolean }>(
      `${this.baseUrl}/v1/paywall/verify`,
      {
        method: 'POST',
        headers: {
          ...this.headers(),
          'Content-Type': 'application/json',
          Authorization: opts.authorizationHeader,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          expected_resource: opts.expectedResource ?? null,
          cost_credits: opts.costCredits ?? 1,
        }),
      },
    );

    const vu = Number(data.valid_until ?? 0);
    if (vu) this.verified.set(paymentHash, vu);

    return {
      ok: true,
      client_id: Number(data.client_id),
      resource: data.resource ?? null,
      payment_hash: String(data.payment_hash),
      charged_credits: Number(data.charged_credits),
      new_balance: Number(data.new_balance),
      valid_until: vu,
    };
  }

  // ---- Reporting ----------------------------------------------------------

  /** Paginated credit ledger. */
  async ledger(opts?: { limit?: number; beforeId?: number }): Promise<LedgerResponse> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.beforeId) params.set('before_id', String(opts.beforeId));
    const qs = params.toString() ? `?${params}` : '';
    return this.request<LedgerResponse>(`${this.baseUrl}/v1/ledger${qs}`, {
      headers: this.headers(),
    });
  }

  /** Aggregated usage summary over a rolling window. */
  async usageSummary(opts?: { sinceHours?: number }): Promise<UsageSummary> {
    const params = opts?.sinceHours ? `?since_hours=${opts.sinceHours}` : '';
    return this.request<UsageSummary>(
      `${this.baseUrl}/v1/usage/summary${params}`,
      { headers: this.headers() },
    );
  }

  /** Daily usage breakdown. */
  async usageDaily(opts?: { days?: number }): Promise<UsageDaily> {
    const params = opts?.days ? `?days=${opts.days}` : '';
    return this.request<UsageDaily>(
      `${this.baseUrl}/v1/usage/daily${params}`,
      { headers: this.headers() },
    );
  }

  /** Usage forecast with top-up recommendation. */
  async usageForecast(opts?: {
    lookbackHours?: number;
    bufferDays?: number;
    maxTopups?: number;
    triggerHours?: number;
  }): Promise<UsageForecast> {
    const params = new URLSearchParams();
    if (opts?.lookbackHours) params.set('lookback_hours', String(opts.lookbackHours));
    if (opts?.bufferDays) params.set('buffer_days', String(opts.bufferDays));
    if (opts?.maxTopups) params.set('max_topups', String(opts.maxTopups));
    if (opts?.triggerHours) params.set('trigger_hours', String(opts.triggerHours));
    const qs = params.toString() ? `?${params}` : '';
    return this.request<UsageForecast>(
      `${this.baseUrl}/v1/usage/forecast${qs}`,
      { headers: this.headers() },
    );
  }

  // ---- Spend (prepaid deduction) ------------------------------------------

  /**
   * Deduct credits from the caller's prepaid balance.
   *
   * An `idempotencyKey` is **required** so that retries do not double-charge.
   */
  async spend(opts: {
    idempotencyKey: string;
    cost?: number;
  }): Promise<Record<string, unknown>> {
    const params = opts.cost ? `?cost=${opts.cost}` : '';
    return this.request<Record<string, unknown>>(
      `${this.baseUrl}/v1/spend${params}`,
      {
        method: 'POST',
        headers: {
          ...this.headers(),
          'Idempotency-Key': opts.idempotencyKey,
        },
      },
    );
  }
}
