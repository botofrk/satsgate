# AIPP — Open Smart Tags

> **Price it once. Anyone can use it — human or agent.**

An AIPP Open Tag is one URL that renders a compact checkout for a person and a
machine-readable priced capability for an agent. Lightning and Base USDC share
the same tag, exact-resource payment binding and fulfillment flow.

> **Mission:** Make software monetization as easy as adding a middleware.  
> **Vision:** Every API, AI Agent, MCP Server, and SaaS should be able to start accepting payments with one SDK.  
> **Philosophy:** Install once. Configure once. Get paid forever.

---

## ⚡ What is AIPP?

AIPP is an **Open Tag publishing layer** for creators and developers. One priced
URL can sell a link to a person, describe a callable tool to an agent, and bind
the resulting payment proof to the exact resource being unlocked.

**Revenue Model:** AIPP charges a disclosed per-payment fee. Lightning payments are received by the AIPP gateway and the merchant amount is forwarded automatically to the configured wallet. AIPP does not provide prepaid credits or a spendable merchant balance.

- **Automatic payout.** Merchant proceeds are forwarded to the configured wallet.
- **Transparent fees.** Lightning costs 1% + 5 sats per successful payment.
- **No subscription or prepaid credit.** Revenue comes from successful transactions.

---

## 🚀 60-Second Quickstart

### 1. Install the SDK
```bash
npm install aipp-sdk
# or
pip install aipp
```

### 2. Add Middleware to Your App

#### Express.js / Node.js
```typescript
import express from 'express';
import { protectApi } from 'aipp-sdk';

const app = express();

// Protect your API route for $0.01 per call
app.post('/api/v1/generate', protectApi({ price: 0.01 }), (req, res) => {
  res.json({ result: "Data generated successfully!" });
});

app.listen(3000);
```

#### Python / MCP Server (AI Agents)
```python
from mcp.server.fastmcp import FastMCP
from aipp import protect_agent

mcp = FastMCP("My MCP Server")

@mcp.tool()
@protect_agent(price=0.01)
def search_database(query: str) -> str:
    """Searches the database. Cost: $0.01 per call."""
    return f"Results for: {query}"
```

---

## 🛠️ Key Features (Plugins)

- **`protectApi()`** — Charge per API request (Sub-cent micro-payments supported).
- **`protectAgent()`** — Native HTTP 402 monetization for MCP Servers and AI Agents.
- **`protectContent()`** — Paywall premium articles, videos, and UI elements.
- **`protectDownload()`** — Monetize file downloads and dataset exports.

---

## 🔒 Lightning & Base USDC

AIPP supports dual-rail micro-settlements:
- ⚡ **Bitcoin Lightning Network** (via L402 / WebLN)
- 🔵 **Base USDC** (via x402 / EVM Wallet)

Successful payments trigger an automatic payout workflow to the merchant wallet. Failed or uncertain payouts are queued for reconciliation rather than exposed as spendable account credit.

---

## 📄 License

MIT License. Built for developers, indie hackers, and AI startups.
