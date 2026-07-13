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
