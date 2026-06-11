# @satsgate/mcp

MCP (Model Context Protocol) server for [satsgate](https://aipp.dev) -- an L402 Lightning paywall that lets AI agents manage credits, create paywall challenges, verify payments, and track usage.

This server exposes satsgate API operations as MCP tools so that AI clients like Claude Desktop, Cursor, and other MCP-compatible agents can interact with the satsgate payment gateway.

## Installation

```bash
npm install @satsgate/mcp
```

Or run directly with npx:

```bash
npx @satsgate/mcp
```

## Configuration

The server is configured via environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `SATSGATE_API_KEY` | Yes | -- | Your satsgate API key |
| `SATSGATE_BASE_URL` | No | `https://api.aipp.dev` | Base URL of the satsgate API |

## Usage with MCP Clients

### Claude Desktop

Add to your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "satsgate": {
      "command": "npx",
      "args": ["@satsgate/mcp"],
      "env": {
        "SATSGATE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Cursor

Add to your Cursor MCP settings (Settings > MCP > Add new MCP server):

```json
{
  "mcpServers": {
    "satsgate": {
      "command": "npx",
      "args": ["@satsgate/mcp"],
      "env": {
        "SATSGATE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Other MCP Clients

Any MCP-compatible client can connect to this server via stdio transport. The general configuration pattern is:

```json
{
  "command": "npx",
  "args": ["@satsgate/mcp"],
  "env": {
    "SATSGATE_API_KEY": "your-api-key-here",
    "SATSGATE_BASE_URL": "https://api.aipp.dev"
  }
}
```

Or if installed globally:

```json
{
  "command": "satsgate-mcp",
  "env": {
    "SATSGATE_API_KEY": "your-api-key-here"
  }
}
```

## Available Tools

### Account

| Tool | Description |
|---|---|
| `satsgate_balance` | Get the current credit balance for the authenticated account |
| `satsgate_client_info` | Get the client profile information for the authenticated account |
| `satsgate_set_payee` | Set the payee Lightning address for receiving payments |
| `satsgate_list_plans` | List all available credit purchase plans |

### Paywall (L402)

| Tool | Description |
|---|---|
| `satsgate_paywall_challenge` | Create a new L402 paywall challenge for a protected resource |
| `satsgate_paywall_verify` | Verify an L402 payment authorization header and optionally deduct credits |

### Credits

| Tool | Description |
|---|---|
| `satsgate_spend` | Spend credits with an idempotency key to prevent duplicate charges |
| `satsgate_ledger` | Get ledger entries showing credit transactions (debits and credits) |

### Usage & Analytics

| Tool | Description |
|---|---|
| `satsgate_usage_summary` | Get a summary of credit usage over a specified time period |
| `satsgate_usage_daily` | Get daily usage breakdown for the specified number of days |
| `satsgate_usage_forecast` | Get usage forecast based on historical data with configurable parameters |

## Tool Reference

### satsgate_balance

No parameters required. Returns the current credit balance.

### satsgate_client_info

No parameters required. Returns the client profile.

### satsgate_set_payee

| Parameter | Type | Required | Description |
|---|---|---|---|
| `lightningAddress` | string | Yes | Lightning address (e.g. `user@wallet.com`) |

### satsgate_list_plans

No parameters required. Returns available credit purchase plans.

### satsgate_paywall_challenge

| Parameter | Type | Required | Description |
|---|---|---|---|
| `resource` | string | Yes | Unique resource identifier (URI or path) |
| `amountSats` | number | Yes | Amount in satoshis required to access the resource |
| `memo` | string | No | Human-readable memo for the invoice |

### satsgate_paywall_verify

| Parameter | Type | Required | Description |
|---|---|---|---|
| `authorizationHeader` | string | Yes | The full L402 Authorization header value |
| `expectedResource` | string | No | Expected resource identifier to validate against |
| `costCredits` | number | No | Credit cost to deduct upon successful verification |

### satsgate_spend

| Parameter | Type | Required | Description |
|---|---|---|---|
| `idempotencyKey` | string | Yes | Unique key to prevent duplicate spends |
| `cost` | number | No | Custom cost in credits (defaults to plan cost) |

### satsgate_ledger

| Parameter | Type | Required | Description |
|---|---|---|---|
| `limit` | number | No | Maximum entries to return (default 20, max 100) |
| `beforeId` | string | No | Cursor for pagination |

### satsgate_usage_summary

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sinceHours` | number | No | Hours to look back (default 24) |

### satsgate_usage_daily

| Parameter | Type | Required | Description |
|---|---|---|---|
| `days` | number | No | Number of days of daily usage (default 7) |

### satsgate_usage_forecast

| Parameter | Type | Required | Description |
|---|---|---|---|
| `lookbackHours` | number | No | Hours of historical data to analyze (default 168) |
| `bufferDays` | number | No | Days of buffer to add to forecast (default 3) |
| `maxTopups` | number | No | Maximum top-ups in forecast (default 5) |
| `triggerHours` | number | No | Hours threshold for alert (default 24) |

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Start the server manually (for debugging)
npm start
```

## Programmatic Usage

You can also use the server programmatically:

```typescript
import { createServer } from '@satsgate/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
```

## License

MIT
