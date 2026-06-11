#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

const API_KEY = process.env.AIPP_API_KEY;
if (!API_KEY) {
  console.error("AIPP_API_KEY environment variable is required");
  process.exit(1);
}

const BASE_URL = process.env.AIPP_BASE_URL || "https://api.aipp.dev";

const client = axios.create({
  baseURL: BASE_URL,
  headers: { "X-Api-Key": API_KEY },
});

const server = new Server(
  {
    name: "aipp-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "aipp_balance",
        description: "Get the current credit balance for the AIPP API Key.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "aipp_charge",
        description: "Spend credits to perform a premium action.",
        inputSchema: {
          type: "object",
          properties: {
            amount: {
              type: "number",
              description: "Amount of credits to spend (default: 1)",
            },
            idempotencyKey: {
              type: "string",
              description: "Unique idempotency key to prevent double charging",
            },
          },
        },
      },
      {
        name: "aipp_topup",
        description: "Automatically top up AIPP credits using an L402 challenge. Pays via configured Alby/LNbits wallet.",
        inputSchema: {
          type: "object",
          properties: {
            planId: {
              type: "string",
              description: "The plan ID to top up (e.g. 'starter', 'pro')",
            },
            walletType: {
              type: "string",
              description: "Wallet type to use for payment ('alby' or 'lnbits')",
            }
          },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "aipp_balance") {
    try {
      const response = await client.get("/v1/balance");
      return {
        content: [{ type: "text", text: JSON.stringify(response.data) }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.response?.data?.error || error.message}` }],
        isError: true,
      };
    }
  } else if (request.params.name === "aipp_charge") {
    const { amount = 1, idempotencyKey } = request.params.arguments || {};
    try {
      const headers: Record<string, string> = {};
      if (idempotencyKey) {
        headers["Idempotency-Key"] = String(idempotencyKey);
      }
      const response = await client.post(`/v1/spend?cost=${amount}`, null, { headers });
      return {
        content: [{ type: "text", text: JSON.stringify(response.data) }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.response?.data?.error || error.message}` }],
        isError: true,
      };
    }
  } else if (request.params.name === "aipp_topup") {
    const { planId = "starter", walletType = "alby" } = request.params.arguments || {};
    try {
      // 1. Get Challenge
      let invoice: string | undefined;
      let macaroon: string | undefined;
      try {
        await client.get(`/v1/topup/${planId}`);
        return { content: [{ type: "text", text: "Error: No 402 challenge returned." }], isError: true };
      } catch (err: any) {
        if (err.response && err.response.status === 402) {
          const authHeader = err.response.headers['www-authenticate'];
          if (authHeader && authHeader.includes('L402')) {
            const parts = authHeader.replace('L402 ', '').split(', ');
            const data: Record<string, string> = {};
            parts.forEach((p: string) => {
              const [k, v] = p.split('=');
              data[k] = v.replace(/"/g, '');
            });
            invoice = data.invoice;
            macaroon = data.macaroon;
          }
        } else {
          throw err;
        }
      }

      if (!invoice || !macaroon) {
        return { content: [{ type: "text", text: "Failed to parse L402 challenge." }], isError: true };
      }

      // 2. Pay Invoice
      let preimage = "";
      if (walletType === "alby") {
        const token = process.env.ALBY_BEARER_TOKEN;
        if (!token) return { content: [{ type: "text", text: "ALBY_BEARER_TOKEN not set." }], isError: true };
        const res = await axios.post('https://api.getalby.com/payments/bolt11', { invoice }, { headers: { Authorization: `Bearer ${token}` } });
        preimage = res.data.preimage;
      } else if (walletType === "lnbits") {
        const token = process.env.LNBITS_ADMIN_KEY;
        const url = process.env.LNBITS_URL;
        if (!token || !url) return { content: [{ type: "text", text: "LNBITS_ADMIN_KEY/URL not set." }], isError: true };
        const res = await axios.post(`${url.replace(/\/$/, '')}/api/v1/payments`, { out: true, bolt11: invoice }, { headers: { 'X-Api-Key': token } });
        const paymentHash = res.data.payment_hash;
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const check = await axios.get(`${url.replace(/\/$/, '')}/api/v1/payments/${paymentHash}`, { headers: { 'X-Api-Key': token } });
          if (check.data.preimage) { preimage = check.data.preimage; break; }
        }
      } else {
        return { content: [{ type: "text", text: `Unsupported wallet type: ${walletType}` }], isError: true };
      }

      if (!preimage) return { content: [{ type: "text", text: "Failed to retrieve preimage." }], isError: true };

      // 3. Verify
      const verifyRes = await client.get(`/v1/topup/${planId}`, { headers: { Authorization: `L402 ${macaroon}:${preimage}` } });
      return { content: [{ type: "text", text: JSON.stringify(verifyRes.data) }] };

    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.response?.data?.error || error.message}` }],
        isError: true,
      };
    }
  }

  return {
    content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
    isError: true,
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AIPP MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main thread:", error);
  process.exit(1);
});
