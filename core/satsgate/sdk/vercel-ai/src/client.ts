import type { Challenge, VerifyResult } from './types.js';

/**
 * Minimal embedded HTTP client for satsgate API calls.
 *
 * This client is self-contained to avoid cross-package dependencies with
 * @satsgate/sdk.  It implements the same core endpoints needed by the
 * Vercel AI SDK integration layer.
 */
export class SatsgateClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string = 'https://api.aipp.dev', apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private headers(): Record<string, string> {
    return { 'X-Api-Key': this.apiKey };
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const resp = await fetch(url, init);
    const data = (await resp.json()) as Record<string, unknown>;

    if (resp.status !== 200 || !data.ok) {
      const err: Error & { statusCode?: number; data?: Record<string, unknown> } =
        new Error(`satsgate error (${resp.status}): ${JSON.stringify(data)}`);
      err.statusCode = resp.status;
      err.data = data;
      throw err;
    }

    return data as T;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Create a paywall challenge for the given resource.
   *
   * @param resource    – resource identifier (e.g. "ai/chat")
   * @param amountSats  – amount in satoshis
   * @param memo        – optional Lightning invoice memo
   */
  async paywallChallenge(
    resource: string,
    amountSats: number,
    memo?: string,
  ): Promise<Challenge> {
    const body: Record<string, unknown> = {
      resource,
      amount_sats: amountSats,
    };
    if (memo) body.memo = memo;

    return this.request<Challenge>(
      `${this.baseUrl}/v1/paywall/challenge`,
      {
        method: 'POST',
        headers: {
          ...this.headers(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
  }

  /**
   * Verify an L402 Authorization header and debit credits.
   *
   * @param authorizationHeader – full header value, e.g. "L402 <macaroon>:<preimage>"
   * @param expectedResource    – optional expected resource to match
   * @param costCredits         – credits to charge (default 1)
   * @param idempotencyKey      – optional idempotency key (auto-generated if omitted)
   */
  async paywallVerify(
    authorizationHeader: string,
    expectedResource?: string,
    costCredits: number = 1,
    idempotencyKey?: string,
  ): Promise<VerifyResult> {
    const key = idempotencyKey ?? `vai:${Date.now()}`;

    return this.request<VerifyResult>(
      `${this.baseUrl}/v1/paywall/verify`,
      {
        method: 'POST',
        headers: {
          ...this.headers(),
          'Content-Type': 'application/json',
          'Authorization': authorizationHeader,
          'Idempotency-Key': key,
        },
        body: JSON.stringify({
          expected_resource: expectedResource ?? null,
          cost_credits: costCredits,
        }),
      },
    );
  }

  /**
   * Fetch the current credit balance for the API key's account.
   */
  async balance(): Promise<{ ok: boolean; client_id: number; credits: number }> {
    return this.request(`${this.baseUrl}/v1/balance`, {
      headers: this.headers(),
    });
  }
}
