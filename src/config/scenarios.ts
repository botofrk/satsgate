export type ScenarioCategory = 
  | 'apis-developers' 
  | 'ai-agents' 
  | 'automation' 
  | 'data-research' 
  | 'content-digital-goods';

export type TruthLevel = 'VERIFIED' | 'SUPPORTED' | 'EXAMPLE';

export interface PaymentFlowStep {
  step: string;
  title: string;
  description: string;
}

export interface ScenarioFaq {
  question: string;
  answer: string;
}

export interface Scenario {
  slug: string;
  title: string;
  short_description: string;
  category: ScenarioCategory;
  category_label: string;
  problem: string;
  target_user: string;
  real_world_example: string;
  how_aipp_solves_it: string;
  payment_flow: PaymentFlowStep[];
  supported_rails: Array<'lightning' | 'usdc'>;
  supported_protocols: Array<'l402' | 'x402'>;
  truth_level: TruthLevel;
  truth_badge_text: 'Tested with AIPP' | 'Supported by AIPP architecture' | 'Example implementation';
  evidence: string;
  requirements: string[];
  limitations: string[];
  example_request: string;
  example_response: string;
  example_code: string;
  example_code_lang: string;
  what_aipp_does: string[];
  what_aipp_does_not_do: string[];
  faq: ScenarioFaq[];
  seo_title: string;
  seo_description: string;
  related_scenarios: string[];
}

export const CATEGORIES: Record<ScenarioCategory, { label: string; icon: string; description: string }> = {
  'apis-developers': {
    label: 'APIs & Developers',
    icon: '⚡',
    description: 'Monetize HTTP REST endpoints, serverless functions, and microservices per request.'
  },
  'ai-agents': {
    label: 'AI & Agents',
    icon: '🤖',
    description: 'Enable autonomous AI agents and LLM tool pipelines to pay for services programmatically.'
  },
  'automation': {
    label: 'Automation',
    icon: '🔄',
    description: 'Gate n8n, Make, or custom webhook workflow executions behind instant micro-payments.'
  },
  'data-research': {
    label: 'Data & Research',
    icon: '🔍',
    description: 'Sell specialized market data, web search queries, and AI research reports on demand.'
  },
  'content-digital-goods': {
    label: 'Content & Digital Goods',
    icon: '📦',
    description: 'Sell digital files, Obsidian notes, Notion templates, and premium web articles.'
  }
};

export const SCENARIOS: Scenario[] = [
  {
    slug: 'pay-per-api-call',
    title: 'Pay per API Call',
    short_description: 'Charge per HTTP request using L402 or Base USDC HTTP 402 challenge headers.',
    category: 'apis-developers',
    category_label: 'APIs & Developers',
    problem: 'Developers building high-value APIs or serverless functions are forced into monthly subscription billing (Stripe, SaaS tiers) or manual API key provisioning. Buyers who only need 5 requests per month cannot justify a $49/month plan, leading to churn and friction.',
    target_user: 'Backend developers, API providers, SaaS engineers, and microservice operators.',
    real_world_example: 'An AI translation or image-processing API that charges $0.02 per request instead of requiring a $29 monthly subscription.',
    how_aipp_solves_it: 'AIPP acts as a lightweight HTTP 402 gateway layer. When an unauthenticated request arrives without a valid payment proof header, your API responds with HTTP 402 Payment Required containing an invoice. Once paid via Lightning or USDC, the client retries with the payment proof and your API handler executes.',
    payment_flow: [
      { step: '01', title: 'HTTP Request', description: 'Client or script sends GET/POST request to your API endpoint.' },
      { step: '02', title: 'HTTP 402 Challenge', description: 'API responds HTTP 402 with invoice header (Lightning bolt11 or Base USDC).' },
      { step: '03', title: 'Micro-Payment', description: 'Client wallet pays $0.02 Lightning invoice or Base USDC transfer.' },
      { step: '04', title: 'Proof Check & Unlock', description: 'Client retries request with payment receipt; API executes and returns JSON payload.' }
    ],
    supported_rails: ['lightning', 'usdc'],
    supported_protocols: ['l402', 'x402'],
    truth_level: 'VERIFIED',
    truth_badge_text: 'Tested with AIPP',
    evidence: 'Tested with Express/FastAPI Node & Python middleware in production, verified with live test suits.',
    requirements: [
      'Node.js or Python backend server (or serverless function handler)',
      'AIPP API Key (registered in 5 seconds via /merchant/register)',
      'HTTP client capable of reading 402 headers'
    ],
    limitations: [
      'Requires client to handle 402 response headers or use AIPP SDK client',
      'In hosted Lightning flows, payments route through AIPP gateway before net proceeds are automatically forwarded'
    ],
    example_request: 'GET /api/v1/translate?text=Hello HTTP/1.1\nHost: api.example.com',
    example_response: 'HTTP/1.1 402 Payment Required\nWWW-Authenticate: L402 invoice="lnbc200n1...", macaroon="..."\nX-AIPP-Paywall: https://aipp.dev/t/p_demo123',
    example_code: `import { Aipp, l402Paywall } from 'aipp-sdk';
import express from 'express';

const app = express();
const aipp = new Aipp({ apiKey: process.env.AIPP_API_KEY });

// Protect API route with $0.02 paywall
app.post('/api/v1/translate', l402Paywall({
  client: aipp,
  amountUsd: 0.02
}), (req, res) => {
  res.json({ translation: "Bonjour le monde", status: "success" });
});`,
    example_code_lang: 'typescript',
    what_aipp_does: [
      'Generates Lightning (L402) and Base USDC (x402) invoice headers on demand',
      'Verifies settlement proof instantly without database locks',
      'Automatically forwards net merchant earnings to your configured wallet address'
    ],
    what_aipp_does_not_do: [
      'Does not host your API server logic or business application code',
      'Does not hold a user-controlled spendable merchant balance',
      'Does not enforce monthly recurring subscription logic'
    ],
    faq: [
      {
        question: 'How fast is payment verification?',
        answer: 'Settlement verification occurs in under 100 milliseconds via local preimage cryptography or instant node check.'
      },
      {
        question: 'How are merchant funds settled?',
        answer: 'Funds settle to your configured wallet. In hosted Lightning flows, funds pass through AIPP before net proceeds are automatically forwarded. Base USDC transfers settle on-chain to your EVM address.'
      }
    ],
    seo_title: 'Pay per API Call — Instant API Monetization with AIPP',
    seo_description: 'Monetize HTTP API endpoints per request with Lightning or Base USDC HTTP 402 challenge headers. No monthly subscriptions required.',
    related_scenarios: ['ai-agent-execution', 'paid-mcp-tool', 'webhook-triggered-service']
  },

  {
    slug: 'paid-n8n-workflow',
    title: 'Paid n8n Workflow',
    short_description: 'Gate n8n automation executions behind instant Lightning or USDC micro-payments.',
    category: 'automation',
    category_label: 'Automation',
    problem: 'n8n workflow creators and automation agencies want to charge users per workflow execution (e.g. $0.50 per report or data sync), but embedding complex Stripe checkout flows inside webhook triggers requires dozens of manual nodes, custom DB tables, and high fees.',
    target_user: 'Automation engineers, n8n agency builders, no-code creators, and workflow developers.',
    real_world_example: 'An n8n workflow that accepts a company domain, performs an automated enrichment search, and delivers a CSV report only after an HTTP 402 payment is verified.',
    how_aipp_solves_it: 'AIPP provides a pre-built n8n monetization workflow pattern. Your n8n webhook trigger receives an incoming payload, queries AIPP to check payment status (`/invoice/status/:hash`), and if unpaid, returns an HTTP 402 response with your Smart Tag link. When settled, execution proceeds seamlessly.',
    payment_flow: [
      { step: '01', title: 'Webhook Triggered', description: 'User or script posts data to n8n Webhook node.' },
      { step: '02', title: 'Payment Check', description: 'n8n HTTP Request node queries AIPP invoice status.' },
      { step: '03', title: 'HTTP 402 Challenge', description: 'If unpaid, n8n responds HTTP 402 with AIPP checkout link.' },
      { step: '04', title: 'Workflow Executes', description: 'Once payment status = settled, n8n runs automation and returns result.' }
    ],
    supported_rails: ['lightning', 'usdc'],
    supported_protocols: ['l402', 'x402'],
    truth_level: 'VERIFIED',
    truth_badge_text: 'Tested with AIPP',
    evidence: 'Verified with official blueprint in repo: examples/n8n_aipp_monetization_workflow.json.',
    requirements: [
      'Self-hosted or cloud n8n instance',
      'AIPP Smart Tag or API Key',
      'n8n HTTP Request node'
    ],
    limitations: [
      'AIPP does not host or execute n8n engine itself; it provides the payment verification layer',
      'n8n workflow must use the HTTP Response node to return 402 headers'
    ],
    example_request: 'POST /webhook/enrich-lead HTTP/1.1\nContent-Type: application/json\n\n{"domain": "stripe.com"}',
    example_response: 'HTTP/1.1 402 Payment Required\nContent-Type: application/json\n\n{"error": "Payment required", "paywall_url": "https://aipp.dev/t/p_n8n123"}',
    example_code: `{
  "nodes": [
    {
      "name": "Check AIPP Settlement",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "=https://aipp.dev/invoice/status/{{ $json.payment_hash }}",
        "method": "GET"
      }
    }
  ]
}`,
    example_code_lang: 'json',
    what_aipp_does: [
      'Provides machine-readable invoice verification endpoint for n8n nodes',
      'Generates instant mobile-friendly payment pages for human workflow triggers',
      'Auto-forwards net merchant proceeds to your specified wallet'
    ],
    what_aipp_does_not_do: [
      'Does not host your n8n server or store your n8n workflow credentials',
      'Does not require maintaining a manual withdrawal balance'
    ],
    faq: [
      {
        question: 'Where do I get the n8n workflow template?',
        answer: 'You can copy the ready-to-import JSON blueprint directly from the AIPP open-source repository (examples/n8n_aipp_monetization_workflow.json).'
      }
    ],
    seo_title: 'Paid n8n Workflow — Monetize n8n Automations with AIPP',
    seo_description: 'Monetize n8n automation workflows per execution with Lightning and Base USDC payment challenges.',
    related_scenarios: ['pay-per-api-call', 'webhook-triggered-service', 'ai-research-agent']
  },

  {
    slug: 'ai-agent-execution',
    title: 'AI Agent Execution',
    short_description: 'Enable autonomous AI agents and LLM tools to pay for services programmatically.',
    category: 'ai-agents',
    category_label: 'AI & Agents',
    problem: 'Autonomous AI agents (such as Hermes, AutoGPT, or LangChain agents) need to access paid tools, APIs, and data sources, but traditional paywalls require credit cards, human CAPTCHAs, and web forms that AI agents cannot pass.',
    target_user: 'AI developers, agentic framework authors, LLM tool creators, and autonomous software engineers.',
    real_world_example: 'An autonomous coding agent encounters a paid documentation endpoint, parses the HTTP 402 header, pays 22 sats via Lightning, and resumes code generation without human intervention.',
    how_aipp_solves_it: 'AIPP Smart Tags serve dual representations: a web checkout for humans and a machine-readable JSON manifest (`/t/:id/manifest`) for AI agents. When an AI agent hits a 402 challenge, it parses the manifest, executes the micro-payment, and submits the receipt automatically.',
    payment_flow: [
      { step: '01', title: 'Agent Request', description: 'AI Agent calls service URL or API tool.' },
      { step: '02', title: '402 + Manifest', description: 'AIPP returns HTTP 402 with link to machine manifest /t/:id/manifest.' },
      { step: '03', title: 'Agent Payment', description: 'Agent wallet pays Lightning invoice or Base USDC transfer.' },
      { step: '04', title: 'Task Execution', description: 'Agent presents preimage/tx hash proof; service executes autonomously.' }
    ],
    supported_rails: ['lightning', 'usdc'],
    supported_protocols: ['l402', 'x402'],
    truth_level: 'VERIFIED',
    truth_badge_text: 'Tested with AIPP',
    evidence: 'Validated with zero-context autonomous agent audit against live https://aipp.dev/t/demo (0 human interventions).',
    requirements: [
      'AI agent with Lightning wallet / LNURL capability or Base USDC wallet key',
      'Target endpoint wrapped with AIPP Smart Tag or SDK'
    ],
    limitations: [
      'Agent must support HTTP 402 response handling or use AIPP Python/TypeScript SDK',
      'In hosted Lightning flows, payments pass through AIPP gateway before automatic forwarding'
    ],
    example_request: 'GET /t/demo/manifest HTTP/1.1\nAccept: application/json',
    example_response: '{\n  "version": "1.0",\n  "title": "AIPP Live Agent Demo",\n  "amount_usd": 0.01,\n  "supported_rails": ["lightning", "usdc"],\n  "pricing": { "sats": 22 }\n}',
    example_code: `from aipp import AippClient

client = AippClient(api_key="aipp_merch_...")
result = client.call_paid_agent_tool(
    url="https://aipp.dev/t/demo",
    max_budget_usd=0.05
)
print("Agent Tool Output:", result)`,
    example_code_lang: 'python',
    what_aipp_does: [
      'Provides standardized, machine-readable manifests for zero-context agent discovery',
      'Supports dual human + agent flow on every single Smart Tag URL',
      'Verifies autonomous payment proofs in real-time'
    ],
    what_aipp_does_not_do: [
      'Does not act as a central agent registry or store agent private keys',
      'Does not mandate a single wallet vendor'
    ],
    faq: [
      {
        question: 'Does the agent need human approval to pay?',
        answer: 'No. AI agents can execute micro-payments autonomously up to a user-configured budget limit.'
      }
    ],
    seo_title: 'AI Agent Execution — Autonomous Agent Micropayments with AIPP',
    seo_description: 'Allow autonomous AI agents to discover, negotiate, and pay for services programmatically with HTTP 402 and L402/x402.',
    related_scenarios: ['paid-mcp-tool', 'pay-per-api-call', 'ai-research-agent']
  },

  {
    slug: 'paid-mcp-tool',
    title: 'Paid MCP Tool',
    short_description: 'Monetize Model Context Protocol (MCP) tool calls in Cursor, Anthropic Claude Desktop, and LLMs.',
    category: 'ai-agents',
    category_label: 'AI & Agents',
    problem: 'Developers creating custom Model Context Protocol (MCP) tools for Claude Desktop, Cursor, or AI sidecars have no standardized way to charge for specialized tool execution (e.g. database lookups, code analysis, image generation).',
    target_user: 'MCP server developers, Cursor extension creators, Claude Desktop tool authors, and AI engineers.',
    real_world_example: 'An MCP server offering deep code security audits charges $0.10 per tool invocation directly through the L402 protocol.',
    how_aipp_solves_it: 'When an LLM invokes an MCP tool, the server returns an L402 payment challenge. The agent client executes the payment via Lightning/USDC, attaches the proof to the tool call arguments, and the tool returns the high-value payload.',
    payment_flow: [
      { step: '01', title: 'MCP Tool Call', description: 'LLM client invokes tool via MCP protocol.' },
      { step: '02', title: '402 Payment Challenge', description: 'MCP server returns payment requirement details.' },
      { step: '03', title: 'Instant Settlement', description: 'Client pays 22 sats Lightning invoice.' },
      { step: '04', title: 'Tool Result Returned', description: 'MCP tool executes and returns rich context to the LLM.' }
    ],
    supported_rails: ['lightning', 'usdc'],
    supported_protocols: ['l402', 'x402'],
    truth_level: 'VERIFIED',
    truth_badge_text: 'Tested with AIPP',
    evidence: 'Verified via Python MCP tool handler in repo: skills/hermes_agent_skill/tool.py & examples/hermes_aipp_agent_tool.py.',
    requirements: [
      'MCP Server (Node.js or Python)',
      'AIPP API Key or Smart Tag',
      'LLM client with L402/MCP payment handler'
    ],
    limitations: [
      'The client MCP host must support 402 challenge negotiation or tool retry',
      'AIPP provides payment verification; developer hosts the MCP server'
    ],
    example_request: '{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "run_security_audit", "arguments": {"repo": "user/app"}}}',
    example_response: '{"jsonrpc": "2.0", "error": {"code": 402, "message": "Payment Required", "data": {"l402": "lnbc220n1..."}}}',
    example_code: `@app.call_tool()
async def run_security_audit(name: str, arguments: dict):
    payment_hash = arguments.get("payment_hash")
    if not is_settled(payment_hash):
        return {"error": "L402 Payment Required", "invoice": create_invoice(amount_usd=0.10)}
    return {"audit_results": "Zero critical vulnerabilities found."}`,
    example_code_lang: 'python',
    what_aipp_does: [
      'Enables native pay-per-use monetization for MCP tool servers',
      'Verifies preimages and transaction proofs instantly',
      'Auto-forwards net earnings to merchant wallet'
    ],
    what_aipp_does_not_do: [
      'Does not host the MCP server process',
      'Does not modify Anthropic or Cursor protocol core'
    ],
    faq: [
      {
        question: 'Does this work with Cursor and Claude Desktop?',
        answer: 'Yes, any MCP client capable of handling L402 402 challenges can pay and execute tools seamlessly.'
      }
    ],
    seo_title: 'Paid MCP Tool — Monetize Model Context Protocol Servers with AIPP',
    seo_description: 'Charge per tool invocation on Model Context Protocol (MCP) servers for Cursor, Claude Desktop, and AI agents.',
    related_scenarios: ['ai-agent-execution', 'pay-per-api-call', 'ai-research-agent']
  },

  {
    slug: 'digital-download',
    title: 'Digital File Download',
    short_description: 'Sell digital files, Notion templates, and Obsidian notes with $0.01 micro-payments.',
    category: 'content-digital-goods',
    category_label: 'Content & Digital Goods',
    problem: 'Creators selling small digital assets (PDFs, zip archives, Notion templates, code snippets) for $0.25 to $3.00 lose 15% to 50% of their revenue to credit card processors like Stripe or Gumroad ($0.30 fixed fee + 10%), making micropayments unfeasible.',
    target_user: 'Digital creators, template authors, designers, technical writers, and indie hackers.',
    real_world_example: 'A developer sells a curated 50-page cheatsheet PDF for $0.50. Credit card processors take $0.35 (70% fee). With AIPP, the 1% protocol fee takes $0.005, delivering $0.495 net earnings.',
    how_aipp_solves_it: 'Create a single AIPP Smart Tag with your target file redirect URL. Anyone opening the link sees a clean checkout page. Upon paying with Lightning or USDC, they are instantly redirected to the unlocked file download.',
    payment_flow: [
      { step: '01', title: 'Open Smart Tag', description: 'Customer clicks your AIPP link (e.g. aipp.dev/t/p_abc123).' },
      { step: '02', title: 'Instant Pay', description: 'Scans QR code or uses WebLN/USDC to pay.' },
      { step: '03', title: 'Proof Checked', description: 'AIPP verifies payment in <100ms.' },
      { step: '04', title: 'File Unlocked', description: 'Browser automatically opens or downloads the target digital asset.' }
    ],
    supported_rails: ['lightning', 'usdc'],
    supported_protocols: ['l402', 'x402'],
    truth_level: 'VERIFIED',
    truth_badge_text: 'Tested with AIPP',
    evidence: 'Verified via live Smart Tag redirect flow and examples/obsidian_aipp_paywall_note.md.',
    requirements: [
      'Target digital file URL (Google Drive, Dropbox, S3, or private server link)',
      'Lightning Address or Base USDC wallet'
    ],
    limitations: [
      'Redirect URL should be kept unlisted or dynamic for high-security files',
      'In hosted Lightning flows, funds pass through AIPP gateway before automatic forwarding'
    ],
    example_request: 'GET /t/p_abc123 HTTP/1.1\nHost: aipp.dev',
    example_response: 'HTTP/1.1 200 OK\nContent-Type: text/html\n\n<!-- AIPP Web Checkout Page with QR & Payment Verification -->',
    example_code: `// Create a Digital Download Smart Tag via cURL
curl -X POST https://aipp.dev/merchant/links/create \\
  -H "X-Api-Key: aipp_merch_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "React Performance Cheatsheet PDF",
    "amount_usd": 0.50,
    "redirect_url": "https://downloads.example.com/cheatsheet.pdf",
    "capability_type": "link"
  }'`,
    example_code_lang: 'bash',
    what_aipp_does: [
      'Creates permanent, non-expiring Smart Tag URLs for digital goods',
      'Handles web checkout for humans and manifest negotiation for agents',
      'Forwards net earnings automatically to your configured wallet'
    ],
    what_aipp_does_not_do: [
      'Does not host heavy DRM digital rights management servers',
      'Does not store customer credit card numbers'
    ],
    faq: [
      {
        question: 'Do buyers need an account to buy a file?',
        answer: 'No. Buyers simply scan the QR code with any Bitcoin Lightning wallet or pay with Base USDC. No password or registration needed.'
      }
    ],
    seo_title: 'Digital File Download — Sell Files for $0.05 with AIPP',
    seo_description: 'Sell PDFs, Notion templates, code scripts, and digital assets with instant Lightning or Base USDC micropayments.',
    related_scenarios: ['content-paywall', 'pay-per-api-call', 'paid-n8n-workflow']
  },

  {
    slug: 'content-paywall',
    title: 'Content & Article Paywall',
    short_description: 'Gate premium blog posts, research articles, or web pages behind instant $0.10 payments.',
    category: 'content-digital-goods',
    category_label: 'Content & Digital Goods',
    problem: 'Publishers and newsletter writers are trapped behind strict all-or-nothing monthly paywalls ($10/month). Casual readers who only want to read a single article bounce rather than subscribing.',
    target_user: 'Independent journalists, newsletter publishers, research analysts, and website owners.',
    real_world_example: 'A financial analyst publishes a 2,000-word market breakdown. Instead of requiring a $20/month subscription, readers pay $0.25 to unlock the full post.',
    how_aipp_solves_it: 'Embed the lightweight AIPP drop-in widget script (`public/aipp-widget.js`). The widget blurs the protected section of the page and overlays an instant payment card. Upon payment, the content reveals seamlessly.',
    payment_flow: [
      { step: '01', title: 'Visit Page', description: 'Reader visits article URL; intro is visible, body is blurred.' },
      { step: '02', title: 'Paywall Card', description: 'AIPP widget presents $0.25 QR code / WebLN button.' },
      { step: '03', title: 'Instant Verification', description: 'Payment settles in <100ms.' },
      { step: '04', title: 'Content Unlocked', description: 'Blur filter removed and full article renders.' }
    ],
    supported_rails: ['lightning', 'usdc'],
    supported_protocols: ['l402', 'x402'],
    truth_level: 'VERIFIED',
    truth_badge_text: 'Tested with AIPP',
    evidence: 'Verified via public/paywall.js and live demo page public/paywall-demo.html.',
    requirements: [
      'HTML website or CMS (WordPress, Ghost, Webflow, custom)',
      'AIPP widget script inclusion'
    ],
    limitations: [
      'Client-side JS paywalls can be bypassed by advanced users inspect element unless combined with server-side L402 gating',
      'Funds settle to configured wallet with automated forwarding'
    ],
    example_request: 'GET /article/market-breakdown HTTP/1.1',
    example_response: 'HTTP/1.1 200 OK\n<!-- HTML content with aipp-paywall container -->',
    example_code: `<!-- Include AIPP Paywall Widget in HTML -->
<link rel="stylesheet" href="https://aipp.dev/paywall.css">
<script src="https://aipp.dev/aipp-widget.js"></script>

<div class="aipp-paywall" data-tag="p_demo123" data-amount="0.25">
  <p>This is the premium unlocked report content...</p>
</div>`,
    example_code_lang: 'html',
    what_aipp_does: [
      'Provides zero-dependency CSS and JS paywall overlay components',
      'Supports instant WebLN one-click browser wallet payments',
      'Auto-forwards net earnings to your payout address'
    ],
    what_aipp_does_not_do: [
      'Does not require readers to create passwords or accounts',
      'Does not store user browsing history'
    ],
    faq: [
      {
        question: 'Can I use this on WordPress or Ghost?',
        answer: 'Yes. You can paste the script tag and container div directly into custom HTML blocks on WordPress, Ghost, or Webflow.'
      }
    ],
    seo_title: 'Content & Article Paywall — Micropayment Paywall with AIPP',
    seo_description: 'Monetize individual articles, reports, and blog posts with low-friction Lightning and Base USDC micropayments.',
    related_scenarios: ['digital-download', 'pay-per-api-call', 'ai-agent-execution']
  },

  {
    slug: 'ai-research-agent',
    title: 'AI Research Agent',
    short_description: 'Monetize specialized market research, company intelligence, and automated deep data synthesis.',
    category: 'data-research',
    category_label: 'Data & Research',
    problem: 'AI research pipelines incur significant token and API costs per search query (web scraping, vector DB retrieval, LLM summarization). Operating these tools publicly without upfront micro-payments leads to rapid API cost exhaustion.',
    target_user: 'Data scientists, AI researchers, financial intelligence providers, and web scraping engineers.',
    real_world_example: 'An AI research bot aggregates 15 web sources, compiles financial metrics, and generates a structured summary for $0.20 per query.',
    how_aipp_solves_it: 'Gate your research pipeline endpoint with an AIPP L402 header or Smart Tag. The user or requesting AI agent pays $0.20 per research task, covering infrastructure costs while yielding profit on every single run.',
    payment_flow: [
      { step: '01', title: 'Research Query', description: 'Client submits query (e.g. "Analyze Q3 earnings for AAPL").' },
      { step: '02', title: 'Payment Required', description: 'Endpoint issues 402 challenge for $0.20.' },
      { step: '03', title: 'Payment Executed', description: 'Client wallet settles Lightning or USDC payment.' },
      { step: '04', title: 'Deep Research Run', description: 'Pipeline executes web synthesis and returns full research report.' }
    ],
    supported_rails: ['lightning', 'usdc'],
    supported_protocols: ['l402', 'x402'],
    truth_level: 'SUPPORTED',
    truth_badge_text: 'Supported by AIPP architecture',
    evidence: 'Supported directly by existing HTTP 402 challenge layer and Python SDK verification.',
    requirements: [
      'AI Research pipeline backend (LangChain, LlamaIndex, or custom script)',
      'AIPP SDK or API key'
    ],
    limitations: [
      'Merchant operates the research models and data scraping nodes',
      'In hosted Lightning flows, funds pass through AIPP gateway before net proceeds forward'
    ],
    example_request: 'POST /api/research HTTP/1.1\n\n{"query": "Competitor pricing analysis"}',
    example_response: 'HTTP/1.1 402 Payment Required\nWWW-Authenticate: L402 invoice="..."',
    example_code: `from aipp import l402_decorator

@app.route("/api/research", methods=["POST"])
@l402_decorator(amount_usd=0.20)
def run_research():
    query = request.json.get("query")
    report = execute_deep_research(query)
    return jsonify({"report": report})`,
    example_code_lang: 'python',
    what_aipp_does: [
      'Ensures every research query is paid before resource execution',
      'Provides fast preimage verification',
      'Auto-forwards net earnings to merchant wallet'
    ],
    what_aipp_does_not_do: [
      'Does not execute the AI model or web scraping tasks',
      'Does not maintain a spendable merchant balance'
    ],
    faq: [
      {
        question: 'Can autonomous agents trigger this research tool?',
        answer: 'Yes. Autonomous agents can parse the 402 header, pay, and consume the research payload programmatically.'
      }
    ],
    seo_title: 'AI Research Agent — Monetize Data Synthesis with AIPP',
    seo_description: 'Monetize deep AI research tasks, market synthesis, and web intelligence per query with L402 micropayments.',
    related_scenarios: ['ai-agent-execution', 'paid-mcp-tool', 'pay-per-api-call']
  },

  {
    slug: 'webhook-triggered-service',
    title: 'Webhook-Triggered Service',
    short_description: 'Charge per incoming webhook event or serverless task trigger.',
    category: 'automation',
    category_label: 'Automation',
    problem: 'Serverless developers and background job workers want to charge third parties per incoming webhook event (e.g. per notification, data transformation, or SMS alert), but lack a zero-overhead payment verification mechanism.',
    target_user: 'Serverless developers, AWS Lambda / Vercel engineers, and event-driven architects.',
    real_world_example: 'A microservice processes incoming video transcodes or image optimizations for $0.05 per webhook event.',
    how_aipp_solves_it: 'Before executing heavy background jobs, the webhook receiver verifies payment status against AIPP. Unpaid requests are rejected with HTTP 402; paid events trigger background execution.',
    payment_flow: [
      { step: '01', title: 'Webhook Post', description: 'Sender posts event payload with payment receipt.' },
      { step: '02', title: 'Status Query', description: 'Receiver checks AIPP GET /invoice/status/:hash.' },
      { step: '03', title: 'Verification', description: 'AIPP confirms invoice status = settled.' },
      { step: '04', title: 'Job Dispatched', description: 'Serverless worker executes background event.' }
    ],
    supported_rails: ['lightning', 'usdc'],
    supported_protocols: ['l402', 'x402'],
    truth_level: 'SUPPORTED',
    truth_badge_text: 'Supported by AIPP architecture',
    evidence: 'Supported directly by AIPP `/invoice/status/:hash` verification endpoint and webhook worker.',
    requirements: [
      'Webhook listener server or serverless endpoint',
      'AIPP API Key'
    ],
    limitations: [
      'Webhook sender must include payment hash / preimage proof in header or payload',
      'Funds auto-forward to merchant wallet according to threshold settings'
    ],
    example_request: 'POST /webhooks/process-task HTTP/1.1\nX-Payment-Hash: 86ed668e63216969809d...',
    example_response: 'HTTP/1.1 200 OK\n\n{"status": "queued", "task_id": "task_123"}',
    example_code: `export async function handleWebhook(req, res) {
  const hash = req.headers['x-payment-hash'];
  const verify = await fetch(\`https://aipp.dev/invoice/status/\${hash}\`);
  const data = await verify.json();

  if (data.status !== 'settled') {
    return res.status(402).json({ error: 'Payment required for webhook event' });
  }
  // Dispatch background job...
  return res.json({ status: 'success' });
}`,
    example_code_lang: 'typescript',
    what_aipp_does: [
      'Provides instant REST invoice status verification for event handlers',
      'Supports automated payout forwarding',
      'Maintains clean audit trail of payment hashes'
    ],
    what_aipp_does_not_do: [
      'Does not queue or retry third-party business webhook jobs',
      'Does not store private application payloads'
    ],
    faq: [
      {
        question: 'What happens if a webhook event fails?',
        answer: 'AIPP verifies payment settlement independently of your internal job status.'
      }
    ],
    seo_title: 'Webhook-Triggered Service — Monetize Webhook Events with AIPP',
    seo_description: 'Monetize serverless tasks, event triggers, and background jobs per webhook execution with AIPP.',
    related_scenarios: ['paid-n8n-workflow', 'pay-per-api-call', 'ai-agent-execution']
  }
];

export function getScenarioBySlug(slug: string): Scenario | undefined {
  return SCENARIOS.find(s => s.slug === slug);
}

export function getScenariosByCategory(category: ScenarioCategory): Scenario[] {
  return SCENARIOS.filter(s => s.category === category);
}
