# @aipp/vercel-ai

Vercel AI SDK integration for AIPP. Let your AI agents automatically top up credits when they run out.

## Installation

```bash
npm install @aipp/vercel-ai
```

## Quickstart

```typescript
import { aippTopupTool } from '@aipp/vercel-ai';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = await generateText({
  model: openai('gpt-4o'),
  tools: {
    aipp_topup: aippTopupTool({
      apiKey: process.env.AIPP_API_KEY!,
      walletType: 'alby',
      walletToken: process.env.ALBY_BEARER_TOKEN,
    }),
  },
  prompt: `My AIPP balance is low. Please top up using the trial plan.`,
});
```

## API Reference

### `aippTopupTool(config)`

Returns a Vercel AI SDK `tool` that can top up AIPP credits automatically.

```typescript
import { aippTopupTool } from '@aipp/vercel-ai';

const tool = aippTopupTool({
  apiKey: string;           // Your AIPP API key
  baseUrl?: string;         // Default: "https://api.aipp.dev"
  walletType?: 'alby' | 'lnbits';  // Default: 'alby'
  walletToken?: string;     // Alby bearer token or LNbits admin key
  walletUrl?: string;       // LNbits URL (required for lnbits wallet type)
});
```

### Config

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `apiKey` | `string` | — | Your AIPP API key (**required**) |
| `baseUrl` | `string` | `"https://api.aipp.dev"` | Your AIPP server URL |
| `walletType` | `"alby" \| "lnbits"` | `"alby"` | Wallet backend for paying invoices |
| `walletToken` | `string` | `process.env.ALBY_BEARER_TOKEN` or `process.env.LNBITS_ADMIN_KEY` | Wallet auth token |
| `walletUrl` | `string` | `process.env.LNBITS_URL` | LNbits URL (only for `lnbits` type) |

### Tool Parameters (AI calls this automatically)

```typescript
{
  planId: "trial" | "value" | "pro"  // Plan to purchase
}
```

### Return Value

On success:
```
"Success! Added 200 credits. New balance: 200."
```

On failure:
```
"AIPP Topup Error: insufficient_balance"
```

## How It Works

1. AI agent detects low balance
2. Calls `aipp_topup` tool with desired plan
3. Tool requests L402 challenge from AIPP server
4. Pays the Lightning invoice via Alby/LNbits
5. Verifies the preimage and claims credits
6. Returns success message with new balance

## Examples

### Basic setup with environment variables

```bash
export AIPP_API_KEY="sg_YOUR_KEY"
export ALBY_BEARER_TOKEN="your_alby_token"
```

```typescript
const tool = aippTopupTool({
  apiKey: process.env.AIPP_API_KEY!,
});
```

### LNbits wallet

```bash
export AIPP_API_KEY="sg_YOUR_KEY"
export LNBITS_ADMIN_KEY="your_lnbits_key"
export LNBITS_URL="https://lnbits.your-server.com"
```

```typescript
const tool = aippTopupTool({
  apiKey: process.env.AIPP_API_KEY!,
  walletType: 'lnbits',
});
```

## Testing

```bash
cd sdks/aipp-vercel-ai
npm install --save-dev vitest
npx vitest run
```

## Plans

| Plan | Price | Credits |
|------|-------|---------|
| Trial | 1,000 sats | 200 |
| Value | 25,000 sats | 10,000 |
| Pro | 250,000 sats | 150,000 |
