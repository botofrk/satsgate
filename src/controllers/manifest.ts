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

export const getAippAgentManifest = async (req: Request, res: Response) => {
  const host = req.get('host') || 'aipp.dev';
  const protocol = req.secure ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}`;

  const agentManifest = {
    spec_version: "1.1",
    name: "aipp Smart Tag Studio",
    description: "Open Tags: one priced capability for people, agents and automated workflows.",
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
      base_usdc: "1% with configured minimum",
      lightning_fee: "1% + 5 sats"
    }
  };

  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(agentManifest);
};
