import { Request, Response } from 'express';

export const getPaidMcpManifest = async (req: Request, res: Response) => {
  // In a real application, these values could come from the database (merchant settings)
  // For now, we derive them from our existing pricing endpoints to make it 100% compatible with PaidMCP
  
  const manifest = {
    id: "aipp-merchant-api",
    name: "AIPP Monetized API",
    tagline: "Pay-per-call Agentic Endpoints via AIPP-Key",
    description: "Premium API endpoints protected by L402/x402 protocols. Pay instantly per call using Base USDC or Lightning Network.",
    author: "aipp-merchant",
    github: "https://github.com/aippde/aipp-key",
    endpoint: `https://${req.get('host') || 'aipp.dev'}`,
    listingType: "live",
    trialSupported: false,
    chains: ["base", "base-sepolia"], // Since x402 currently supports Base and Base Sepolia
    tools: [
      { 
        name: "premium_article", 
        description: "Access premium article for AI Autonomy research", 
        priceUsdt: 0.005 
      },
      { 
        name: "chat", 
        description: "Submit request to OpenAI proxy chatbot endpoint", 
        priceUsdt: 0.005 
      }
    ],
    tags: ["aipp", "l402", "x402", "api", "ai-agents"],
    addedAt: new Date().toISOString().split('T')[0]
  };

  res.json(manifest);
};

export const getOpenTagSpec = async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({
    spec: 'https://aipp.dev/spec/open-tag/1.0',
    spec_version: '1.0',
    kind: 'aipp.open-tag',
    name: 'AIPP Smart Tag (Open Tag)',
    description: 'One priced capability for humans and agents. A human gets a checkout; an AI agent gets a machine-readable manifest and an HTTP 402 challenge.',
    object: {
      spec: 'URL of this specification',
      spec_version: 'version of the spec',
      id: 'Smart Tag id',
      kind: 'aipp.open-tag',
      capability_type: "'link' | 'ai' | 'api'",
      name: 'human-readable title',
      description: 'optional human-readable description',
      price: { amount_usd: 'USD string (e.g. "0.01")', currency: 'USD' },
      accepts: [
        { protocol: 'L402', network: 'bitcoin-lightning', fee_policy: '1% + 5 sats customer-side fee', address: 'Lightning Address' },
        { protocol: 'x402', network: 'base', chain_id: 8453, asset: 'USDC', contract: 'USDC token contract on Base', receiver: '0x... payout receiver', fee_policy: '1% merchant platform fee' }
      ],
      input_schema: 'optional JSON Schema describing expected agent input',
      output_schema: 'optional JSON Schema describing expected output',
      interfaces: {
        human: 'GET /t/:id (Accept: text/html) — web checkout / CLI paywall',
        manifest: 'GET /t/:id/manifest — this object',
        content: 'GET /t/:id/content — HTTP 402 challenge or unlocked content',
        create_payment: 'POST /t/:id/invoice — body { mode: "L402" } | { mode: "X402" } | { mode: "DUAL" } (alias: protocol)',
        verify_and_unlock: 'GET /t/:id/unlock/:payment_hash',
        receipt: 'GET /t/:id/receipt/:payment_hash'
      },
      payment_binding: { resource: '/t/:id', proof_scope: 'exact-tag', replay_policy: 'one-proof-one-invoice' }
    },
    address_semantics: {
      'manifest.accepts[].receiver': 'Merchant settlement destination — where AIPP forwards the merchant amount after the platform fee.',
      'invoice.pay_to': 'Payment destination for THIS transaction — where the buyer sends the funds (AIPP gateway). Funds are forwarded to receiver after verification.',
      'manifest.accepts[].address': 'Lightning Address — merchant settlement destination for L402 payouts.'
    },
    payment_flow: [
      '1. GET /t/:id (Accept: application/json) or GET /t/:id/manifest → manifest',
      '2. POST /t/:id/invoice {"mode":"L402"} → BOLT11 payment_request; {"mode":"X402"} → pay_to / network / token / payment_hash; {"mode":"DUAL"} → both rails',
      '3. Pay — Lightning: pay the BOLT11 invoice; USDC: transfer the price to pay_to on Base (chain_id 8453, token contract)',
      '4. Verify — GET /t/:id/content?payment_hash=... or GET /invoice/status/:hash → paid / settled',
      '5. Unlock — GET /t/:id/unlock/:payment_hash → protected resource / fulfillment',
      '6. Receipt — GET /t/:id/receipt/:payment_hash → signed portable receipt'
    ],
    http_status: {
      '402': 'Payment Required — challenge response; read WWW-Authenticate and the JSON body',
      '200': 'Manifest (JSON), settled content, or invoice created',
      '404': 'Smart Tag not found',
      '401': 'Missing or invalid API key (merchant endpoints)'
    },
    fees: {
      lightning: '1% + 5 sats, added customer-side and shown on checkout',
      base_usdc: '1% merchant platform fee (minimum $0.001)',
      custody: 'AIPP never stores merchant balances. Hosted flows may receive funds before forwarding to the merchant wallet.',
      settlement: 'Lightning: LNbits/phoenixd → merchant Lightning Address. USDC: Base gateway → merchant payout queue → merchant USDC address.'
    }
  });
};

export const getAippAgentManifest = async (req: Request, res: Response) => {
  const host = req.get('host') || 'aipp.dev';
  const protocol = req.secure ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}`;

  const agentManifest = {
    spec_version: "1.1",
    name: "aipp Smart Tag Studio",
    description: "Smart Tags: one priced capability for people, agents and automated workflows.",
    version: "1.3.0",
    endpoints: {
      create_invoice: `${baseUrl}/invoice/create`,
      invoice_status: `${baseUrl}/invoice/status/{hash}`,
      get_receipt: `${baseUrl}/invoice/receipt/{hash}`,
      pricing: `${baseUrl}/pricing.json`,
      paidmcp: `${baseUrl}/paidmcp.json`,
      open_tag: `${baseUrl}/t/{tag_id}`,
      open_tag_manifest: `${baseUrl}/t/{tag_id}/manifest`,
      open_tag_unlock: `${baseUrl}/t/{tag_id}/unlock/{payment_hash}`,
      open_tag_receipt: `${baseUrl}/t/{tag_id}/receipt/{payment_hash}`
    },
    protocols: {
      L402: {
        name: "Bitcoin Lightning L402",
        pricing_unit: "SATS",
        min_amount: 1,
        max_amount: 1000000,
        settlement: "verified then forwarded"
      },
      x402: {
        name: "USDC on Base (EVM)",
        pricing_unit: "USD",
        min_amount: 0.01,
        max_amount: 100.0,
        network: "base",
        settlement: "instant"
      },
      dual: {
        name: "Dual-Rail Hybrid",
        description: "Invoices can be paid via either Lightning (L402) or USDC (x402) dynamically."
      }
    },
    open_tag: {
      content_negotiation: true,
      human_media_type: "text/html",
      agent_media_type: "application/json",
      payment_proof_scope: "exact-tag"
    },
    fees: {
      base_usdc: "1% merchant platform fee (min $0.001)",
      lightning_fee: "1% + 5 sats"
    }
  };

  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(agentManifest);
};
