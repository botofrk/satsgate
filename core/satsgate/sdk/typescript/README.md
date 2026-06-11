# @satsgate/sdk

TypeScript/Node.js SDK for **satsgate** — L402 Lightning paywall + prepaid payment verifications.

## Install

```bash
npm install @satsgate/sdk
```

## Quick Start

```typescript
import { SatsgateClient } from '@satsgate/sdk';

const sg = new SatsgateClient({ apiKey: 'sg_...' });

// 1. Set your payee Lightning Address (once)
await sg.setPayee('yourname@yourdomain.com');

// 2. Create a paywall challenge
const challenge = await sg.paywallChallenge({
  resource: 'api/premium',
  amountSats: 10,
  memo: 'Premium access',
});

// Return HTTP 402 with challenge.invoice and challenge.macaroon to your end user.

// 3. Verify payment when user retries with Authorization: L402 ...
const result = await sg.paywallVerify({
  authorizationHeader: 'L402 <macaroon>:<preimage>',
  expectedResource: 'api/premium',
});

console.log(result.chargedCredits); // 1 on first call, 0 on cache hits
console.log(result.newBalance);    // remaining credits
```

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `baseUrl` | `https://api.aipp.dev` | Satsgate API base URL |
| `apiKey` | *(required)* | Your satsgate API key (`sg_...`) |
| `timeoutMs` | `10000` | Request timeout in milliseconds |

## Cache

`paywallVerify` caches verified `payment_hash` entries (LRU, max 1000) until their `valid_until` timestamp expires. Set `useCache: false` to always call the server.

## Idempotency

Every `paywallVerify` call automatically sends an `Idempotency-Key` header derived from the `payment_hash`. Retries of the same payment are charged only once.

## API Methods

| Method | Description |
|--------|-------------|
| `listPlans()` | List available credit purchase plans |
| `balance()` | Get current credit balance |
| `getClient()` | Get client profile |
| `setPayee(address)` | Set payee Lightning Address |
| `paywallChallenge(opts)` | Create L402 challenge (invoice + macaroon) |
| `paywallVerify(opts)` | Verify L402 payment and spend credits |
| `spend(opts)` | Manual credit spend with idempotency key |
| `ledger(opts?)` | Paginated ledger entries |
| `usageSummary(opts?)` | Aggregated usage summary |
| `usageDaily(opts?)` | Daily usage time series |
| `usageForecast(opts?)` | Forecast + purchase recommendation |

## Helpers

```typescript
import { parseL402Authorization, decodeMacaroonPayload } from '@satsgate/sdk';

const [macaroon, preimage] = parseL402Authorization('L402 ...');
const payload = decodeMacaroonPayload(macaroon);
```

## Types

```typescript
import type { Challenge, VerifyResult, Plan, BalanceResponse, ClientInfo,
  LedgerResponse, UsageSummary, UsageDaily, UsageForecast } from '@satsgate/sdk';
```

## Requirements

- Node.js >= 18
- No runtime dependencies (uses native `fetch`)

## License

MIT
