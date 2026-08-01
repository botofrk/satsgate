# AIPP — Developer Monetization Platform

> **Mission:** Make software monetization as easy as adding a middleware.  
> **Vision:** Every API, AI Agent, MCP Server, and SaaS should be able to start accepting payments with one SDK.  
> **Philosophy:** Install once. Configure once. Get paid forever.

---

## ⚡ What is AIPP?

AIPP is a **Set & Forget Monetization Platform** for developers. It eliminates the thousands of lines of boilerplate code required to charge for APIs, AI Agent tools (MCP), premium content, and digital downloads.

Unlike traditional payment gateways, AIPP is **100% Non-Custodial**. Revenue settles instantly to your own Lightning address or EVM wallet—no bank accounts, no merchant approvals, no percentage cuts, and no holding of funds.

---

## 🚀 60-Second Quickstart

### 1. Install the SDK
```bash
npm install @aipp/sdk
# or
pip install aipp
```

### 2. Add Middleware to Your App

#### Express.js / Node.js
```typescript
import express from 'express';
import { aipp, protectApi } from '@aipp/sdk';

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

## 🔒 Non-Custodial & Dual-Rail Settlement

AIPP supports dual-rail micro-settlements:
- ⚡ **Bitcoin Lightning Network** (via L402 / WebLN)
- 🔵 **Base USDC** (via x402 / EVM Wallet)

Funds settle **instantly** to your merchant wallet address.

---

## 📄 License

MIT License. Built for developers, indie hackers, and AI startups.
