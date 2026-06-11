# @satsgate/vercel-ai

Vercel AI SDK integration for [satsgate](https://aipp.dev) -- add L402 Lightning paywall protection to your AI endpoints in minutes.

## Features

- **Paywall middleware** -- protect Next.js / Vercel AI SDK routes with L402 Lightning payments
- **Tool helpers** -- expose satsgate balance checks and challenge creation as Vercel AI SDK tools for tool-calling models
- **Edge-compatible** -- uses standard Web `Request` / `Response` API (works on Vercel Edge, Cloudflare Workers, Deno Deploy, etc.)
- **Zero runtime dependencies** -- `ai` is a peer dependency, so you only install what you use
- **Built-in verification cache** -- avoids redundant network calls for repeat requests

## Installation

```bash
npm install @satsgate/vercel-ai ai
```

> `ai` (the Vercel AI SDK) is a peer dependency and must be installed separately.

## Quick Start

### 1. Protect an API route with the paywall middleware

```typescript
// app/api/chat/route.ts  (Next.js App Router)
import { satsgatePaywallMiddleware } from '@satsgate/vercel-ai';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

const paywall = satsgatePaywallMiddleware({
  apiKey: process.env.SATSGATE_API_KEY!,
  resource: 'ai/chat',
  amountSats: 10,
  costCredits: 1,
});

export async function POST(request: Request) {
  // Run the paywall check
  const blocked = await paywall(request);
  if (blocked) return blocked; // 402 or error response

  // Request is paid -- proceed with AI logic
  const { messages } = await request.json();
  const result = streamText({
    model: openai('gpt-4o'),
    messages,
  });

  return result.toDataStreamResponse();
}
```

### 2. Use satsgate tools with tool-calling models

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createPaywallTool } from '@satsgate/vercel-ai';

const tools = createPaywallTool({
  apiKey: process.env.SATSGATE_API_KEY!,
});

const result = await generateText({
  model: openai('gpt-4o'),
  tools: {
    checkBalance: tools.checkBalance,
    createChallenge: tools.createChallenge,
    verifyPayment: tools.verifyPayment,
  },
  prompt: 'Check my satsgate balance',
});

console.log(result.text);
```

## API Reference

### `satsgatePaywallMiddleware(options)`

Creates a middleware handler function that enforces L402 payment on incoming requests.

**Options:**

| Option        | Type       | Default                  | Description                                  |
|---------------|------------|--------------------------|----------------------------------------------|
| `apiKey`      | `string`   | *(required)*             | Your satsgate API key                        |
| `baseUrl`     | `string`   | `https://api.aipp.dev`   | Satsgate API base URL                        |
| `resource`    | `string`   | `"ai/chat"`              | Resource identifier for the paywall          |
| `amountSats`  | `number`   | `10`                     | Challenge amount in satoshis                 |
| `costCredits` | `number`   | `1`                      | Credits charged per verification             |
| `paths`       | `string[]` | *(all paths)*            | Paths to protect (glob patterns)             |

**Returns:** `async (request: Request) => Response | null`

- Returns `null` when the request is authorized (let it proceed).
- Returns a `Response` (402 or error) when the request should be blocked.

### `createPaywallTool(config)`

Creates Vercel AI SDK tool definitions for satsgate operations.

**Config:**

| Option    | Type     | Default                | Description           |
|-----------|----------|------------------------|-----------------------|
| `apiKey`  | `string` | *(required)*           | Your satsgate API key |
| `baseUrl` | `string` | `https://api.aipp.dev` | Satsgate API base URL |

**Returns:** An object with three tools:

| Tool              | Description                                        |
|-------------------|----------------------------------------------------|
| `checkBalance`    | Query the current credit balance                   |
| `createChallenge` | Generate an L402 Lightning invoice challenge       |
| `verifyPayment`   | Verify an L402 authorization header                |

### `SatsgateClient`

Low-level HTTP client for direct satsgate API access.

```typescript
import { SatsgateClient } from '@satsgate/vercel-ai';

const client = new SatsgateClient('https://api.aipp.dev', 'sg_...');

const challenge = await client.paywallChallenge('ai/chat', 10);
const verification = await client.paywallVerify(authHeader, 'ai/chat');
const balance = await client.balance();
```

## How the L402 Flow Works

```
Client                          Your Server                    Satsgate API
  |                                 |                               |
  |  POST /api/chat (no auth)       |                               |
  |-------------------------------->|                               |
  |                                 |  POST /v1/paywall/challenge   |
  |                                 |------------------------------->|
  |                                 |  { invoice, macaroon, ... }   |
  |                                 |<-------------------------------|
  |  402 Payment Required           |                               |
  |  { invoice, macaroon, ... }     |                               |
  |<--------------------------------|                               |
  |                                                                 |
  |  [Client pays the Lightning invoice]                            |
  |  [Client receives the preimage]                                 |
  |                                                                 |
  |  POST /api/chat                 |                               |
  |  Authorization: L402 <mac>:<pre>|                               |
  |-------------------------------->|                               |
  |                                 |  POST /v1/paywall/verify      |
  |                                 |------------------------------->|
  |                                 |  { ok: true, ... }            |
  |                                 |<-------------------------------|
  |  200 OK (AI response)           |                               |
  |<--------------------------------|                               |
```

1. The client sends a request to your paywalled endpoint.
2. If no `Authorization` header is present, the middleware creates a challenge via satsgate and returns a `402` with a Lightning invoice.
3. The client pays the invoice off-chain and receives a preimage.
4. The client retries the request with `Authorization: L402 <macaroon>:<preimage>`.
5. The middleware verifies the token with satsgate. On success, the request proceeds to your handler.
6. Verified payment hashes are cached in-memory to avoid re-verification within the validity window.

## TypeScript

This package is written in TypeScript and ships with full type declarations.

```typescript
import type {
  SatsgateMiddlewareOptions,
  PaywallToolConfig,
  Challenge,
  VerifyResult,
  SatsgateError,
} from '@satsgate/vercel-ai';
```

## Requirements

- Node.js >= 18
- Vercel AI SDK (`ai`) >= 4.0.0 (optional, only if using tool helpers)

## License

MIT
