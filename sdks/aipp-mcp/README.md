# @aipp/mcp

Model Context Protocol (MCP) server for AIPP. Lets Claude Desktop and other MCP clients check balances, spend credits, and top up automatically.

## Installation

```bash
npm install @aipp/mcp
```

Or run directly with npx (no install needed):

```bash
npx @aipp/mcp
```

## Quickstart

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "aipp": {
      "command": "npx",
      "args": ["-y", "@aipp/mcp"],
      "env": {
        "AIPP_API_KEY": "sg_YOUR_API_KEY",
        "ALBY_BEARER_TOKEN": "your_alby_token",
        "AIPP_BASE_URL": "https://api.aipp.dev"
      }
    }
  }
}
```

Then ask Claude: *"What's my AIPP balance?"* or *"Spend 5 credits for me."*

### Any MCP Client

```bash
export AIPP_API_KEY="sg_YOUR_KEY"
export ALBY_BEARER_TOKEN="your_alby_token"
npx @aipp/mcp
```

## Tools

### `aipp_balance`

Check your current credit balance.

**Parameters:** None

**Response:**
```json
{"ok": true, "client_id": 1, "credits": 200}
```

### `aipp_charge`

Spend credits for a premium action.

**Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `amount` | `number` | `1` | Credits to spend |
| `idempotencyKey` | `string` | — | Unique key to prevent double charging |

**Response:**
```json
{"ok": true, "spent": 1, "new_balance": 199}
```

### `aipp_topup`

Automatically top up credits when you run out. Pays the Lightning invoice using your configured wallet (Alby or LNbits).

**Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `planId` | `string` | `"starter"` | Plan to purchase (`trial`, `value`, `pro`) |
| `walletType` | `string` | `"alby"` | Wallet backend (`alby` or `lnbits`) |

**Response:**
```json
{"ok": true, "credits_added": 200, "new_balance": 200}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AIPP_API_KEY` | ✅ | Your AIPP API key |
| `AIPP_BASE_URL` | ❌ | Default: `https://api.aipp.dev` |
| `ALBY_BEARER_TOKEN` | ✅ (Alby) | Alby API token for paying invoices |
| `LNBITS_ADMIN_KEY` | ✅ (LNbits) | LNbits admin key |
| `LNBITS_URL` | ✅ (LNbits) | Your LNbits server URL |

## How It Works

1. MCP client calls `aipp_balance` → returns current credits
2. Agent calls `aipp_charge` → spends credits (prevented from double-charging via idempotency)
3. When low, agent calls `aipp_topup` → gets invoice, pays it via Alby/LNbits, claims credits

## Testing

```bash
cd sdks/aipp-mcp
npm install --save-dev vitest
npx vitest run
```

## Plans

| Plan | Price | Credits |
|------|-------|---------|
| Trial | 1,000 sats | 200 |
| Value | 25,000 sats | 10,000 |
| Pro | 250,000 sats | 150,000 |
