import { SatsgateClient } from './client.js';

/**
 * Configuration options for the satsgate paywall middleware.
 */
export interface SatsgateMiddlewareOptions {
  /** Satsgate API key */
  apiKey: string;

  /** Satsgate base URL (default: https://api.aipp.dev) */
  baseUrl?: string;

  /** Resource identifier for the paywall (default: "ai/chat") */
  resource?: string;

  /** Amount in sats for each challenge (default: 10) */
  amountSats?: number;

  /** Cost in credits per verification (default: 1) */
  costCredits?: number;

  /** Paths to protect (default: all). Glob patterns supported. */
  paths?: string[];
}

// ---------------------------------------------------------------------------
// In-memory verification cache
// ---------------------------------------------------------------------------

interface VerifyCacheEntry {
  validUntil: number;
  resource: string | null;
}

const verifyCache = new Map<string, VerifyCacheEntry>();
const CACHE_MAX = 500;

function cacheSet(key: string, entry: VerifyCacheEntry): void {
  // Evict the oldest entry when the cache is full.
  if (verifyCache.size >= CACHE_MAX) {
    const oldest = verifyCache.keys().next().value;
    if (oldest !== undefined) verifyCache.delete(oldest);
  }
  verifyCache.set(key, entry);
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Create a satsgate L402 paywall middleware handler.
 *
 * The returned handler intercepts incoming requests:
 *
 * 1. **No `Authorization` header** – returns a `402 Payment Required` response
 *    containing a Lightning invoice challenge.
 * 2. **`Authorization: L402 <macaroon>:<preimage>` present** – verifies the
 *    payment with satsgate and either lets the request through (`null`) or
 *    returns an error response.
 * 3. Verified payment hashes are cached in-memory so repeat requests within
 *    the validity window skip the network round-trip.
 *
 * The handler uses the standard Web `Request` / `Response` API, making it
 * compatible with Next.js App Router, Vercel Edge Functions, and any other
 * runtime that supports the Fetch API.
 *
 * @example
 * ```typescript
 * // app/api/chat/route.ts (Next.js App Router)
 * import { satsgatePaywallMiddleware } from '@satsgate/vercel-ai';
 *
 * const paywall = satsgatePaywallMiddleware({
 *   apiKey: process.env.SATSGATE_API_KEY!,
 *   resource: 'ai/chat',
 *   amountSats: 10,
 * });
 *
 * export async function POST(request: Request) {
 *   const blocked = await paywall(request);
 *   if (blocked) return blocked;
 *
 *   // ... run your AI logic here ...
 * }
 * ```
 */
export function satsgatePaywallMiddleware(options: SatsgateMiddlewareOptions) {
  const client = new SatsgateClient(options.baseUrl, options.apiKey);
  const resource = options.resource ?? 'ai/chat';
  const amountSats = options.amountSats ?? 10;
  const costCredits = options.costCredits ?? 1;

  return async function handler(request: Request): Promise<Response | null> {
    const authHeader = request.headers.get('authorization');

    // -----------------------------------------------------------------------
    // 1. No auth header → return a 402 challenge
    // -----------------------------------------------------------------------
    if (!authHeader) {
      try {
        const challenge = await client.paywallChallenge(resource, amountSats);

        return new Response(
          JSON.stringify({
            ok: false,
            error: 'payment_required',
            resource: challenge.resource,
            amount_sats: challenge.amount_sats,
            invoice: challenge.invoice,
            macaroon: challenge.macaroon,
            payment_hash: challenge.payment_hash,
            hint: 'Pay the invoice, then retry with Authorization: L402 <macaroon>:<preimage>',
          }),
          {
            status: 402,
            headers: {
              'Content-Type': 'application/json',
              'WWW-Authenticate': challenge.www_authenticate,
            },
          },
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return new Response(
          JSON.stringify({ ok: false, error: 'satsgate_error', details: message }),
          { status: 502, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    // -----------------------------------------------------------------------
    // 2. Auth present → verify (with cache fast-path)
    // -----------------------------------------------------------------------
    try {
      // Attempt a quick cache hit by extracting the payment hash from the
      // macaroon's base64url-encoded payload.
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0]!.toLowerCase() === 'l402') {
        const token = parts[1]!;
        const colonIdx = token.indexOf(':');
        if (colonIdx !== -1) {
          const macB64 = token.slice(0, colonIdx);
          try {
            const pad = '='.repeat((4 - (macB64.length % 4)) % 4);
            const decoded = Buffer.from(macB64 + pad, 'base64url');
            const dotIdx = decoded.lastIndexOf('.');
            const payload = JSON.parse(decoded.subarray(0, dotIdx).toString('utf-8'));
            const ph = String(payload.ph ?? '');

            const cached = verifyCache.get(ph);
            if (cached && Math.floor(Date.now() / 1000) <= cached.validUntil) {
              return null; // Cached and still valid → allow through
            }
          } catch {
            // Decoding failed – fall through to server-side verification.
          }
        }
      }

      // Full server-side verification
      const vr = await client.paywallVerify(authHeader, resource, costCredits);

      if (vr.valid_until) {
        cacheSet(vr.payment_hash, {
          validUntil: vr.valid_until,
          resource: vr.resource,
        });
      }

      return null; // Verified → allow request through
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number; data?: unknown };
      const status = error.statusCode ?? 401;

      return new Response(
        JSON.stringify({
          ok: false,
          error: 'verification_failed',
          details: error.message,
          satsgate: error.data,
        }),
        {
          status: Math.max(400, Math.min(599, status)),
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  };
}
