import Navbar from '@/components/Navbar';
import Link from 'next/link';

export default function DocsPage() {
  return (
    <>
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="mb-16">
          <h1 className="font-logo text-5xl md:text-6xl mb-4">Docs</h1>
          <p className="text-xl text-[var(--text-secondary)] max-w-2xl">
            Everything you need to integrate satsgate L402 paywalls into your AI agents, APIs, and applications.
          </p>
        </div>

        {/* Quick Start */}
        <section className="mb-16">
          <h2 className="text-3xl font-extrabold mb-6">Quick Start</h2>
          <div className="brutal-card mb-6">
            <h3 className="text-xl font-bold mb-3">1. Get an API Key</h3>
            <p className="mb-4 text-[var(--text-secondary)]">
              Visit the <Link href="/login" className="font-bold underline underline-offset-4 decoration-[3px]">login page</Link> and authenticate with your Lightning wallet. You will receive an API key with 50 free trial credits.
            </p>
          </div>
          <div className="brutal-card mb-6">
            <h3 className="text-xl font-bold mb-3">2. Install the SDK</h3>
            <div className="bg-black text-[#c8f53c] font-mono rounded-xl p-5 overflow-x-auto text-sm">
              <p className="text-gray-500"># Python</p>
              <p>pip install satsgate-sdk</p>
              <p className="text-gray-500 mt-3"># Node.js / TypeScript</p>
              <p>npm install @satsgate/sdk</p>
            </div>
          </div>
          <div className="brutal-card mb-6">
            <h3 className="text-xl font-bold mb-3">3. Protect an Endpoint</h3>
            <div className="bg-black text-[#c8f53c] font-mono rounded-xl p-5 overflow-x-auto text-sm leading-relaxed">
              <p className="text-gray-500">{'// FastAPI + satsgate-sdk'}</p>
              <p>from satsgate_sdk import SatsgateClient</p>
              <p>&nbsp;</p>
              <p>sg = SatsgateClient(api_key=<span className="text-yellow-300">&quot;sg_...&quot;</span>)</p>
              <p>&nbsp;</p>
              <p className="text-gray-500">{'# No auth? -> Return 402 challenge'}</p>
              <p>ch = sg.paywall_challenge(resource=<span className="text-yellow-300">&quot;api/data&quot;</span>, amount_sats=10)</p>
              <p>&nbsp;</p>
              <p className="text-gray-500">{'# Has auth? -> Verify and serve'}</p>
              <p>vr = sg.paywall_verify(authorization_header=auth_header)</p>
            </div>
          </div>
        </section>

        {/* How L402 Works */}
        <section className="mb-16">
          <h2 className="text-3xl font-extrabold mb-6">How L402 Works</h2>
          <div className="brutal-card">
            <div className="space-y-6">
              <div className="flex gap-4">
                <span className="bg-black text-[#c8f53c] font-mono font-bold w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-lg">1</span>
                <div>
                  <h4 className="font-bold text-lg">Client requests a paywalled resource</h4>
                  <p className="text-[var(--text-secondary)]">Your API responds with HTTP 402 and a Lightning invoice + macaroon token.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <span className="bg-black text-[#c8f53c] font-mono font-bold w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-lg">2</span>
                <div>
                  <h4 className="font-bold text-lg">Client pays the Lightning invoice</h4>
                  <p className="text-[var(--text-secondary)]">The payment is settled instantly on the Lightning Network. The client receives a preimage (proof of payment).</p>
                </div>
              </div>
              <div className="flex gap-4">
                <span className="bg-black text-[#c8f53c] font-mono font-bold w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-lg">3</span>
                <div>
                  <h4 className="font-bold text-lg">Client retries with Authorization header</h4>
                  <p className="text-[var(--text-secondary)]"><code className="font-mono bg-gray-100 px-2 py-0.5 rounded">Authorization: L402 macaroon:preimage</code></p>
                </div>
              </div>
              <div className="flex gap-4">
                <span className="bg-black text-[#c8f53c] font-mono font-bold w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-lg">4</span>
                <div>
                  <h4 className="font-bold text-lg">Server verifies and serves the resource</h4>
                  <p className="text-[var(--text-secondary)]">Satsgate verifies the token, deducts 1 credit, and caches the result. Subsequent requests for the same payment_hash are served from cache.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* API Reference */}
        <section className="mb-16">
          <h2 className="text-3xl font-extrabold mb-6">API Reference</h2>
          <p className="text-[var(--text-secondary)] mb-6">Base URL: <code className="font-mono bg-white border-2 border-black px-2 py-0.5 rounded text-sm">https://api.aipp.dev</code></p>

          {/* Public Endpoints */}
          <div className="brutal-card mb-6">
            <h3 className="text-xl font-bold mb-4">Public Endpoints</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-black">
                    <th className="text-left py-2 pr-4 font-bold">Method</th>
                    <th className="text-left py-2 pr-4 font-bold">Path</th>
                    <th className="text-left py-2 font-bold">Description</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pr-4"><span className="bg-green-100 px-2 py-0.5 rounded font-bold text-green-800">GET</span></td>
                    <td className="py-2 pr-4">/health</td>
                    <td className="py-2 font-sans text-sm">Health check</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pr-4"><span className="bg-green-100 px-2 py-0.5 rounded font-bold text-green-800">GET</span></td>
                    <td className="py-2 pr-4">/v1/plans</td>
                    <td className="py-2 font-sans text-sm">List credit purchase plans</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Auth-required Endpoints */}
          <div className="brutal-card mb-6">
            <h3 className="text-xl font-bold mb-4">Client Endpoints <span className="text-sm font-normal text-[var(--text-secondary)]">(X-Api-Key required)</span></h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-black">
                    <th className="text-left py-2 pr-4 font-bold">Method</th>
                    <th className="text-left py-2 pr-4 font-bold">Path</th>
                    <th className="text-left py-2 font-bold">Description</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pr-4"><span className="bg-green-100 px-2 py-0.5 rounded font-bold text-green-800">GET</span></td>
                    <td className="py-2 pr-4">/v1/balance</td>
                    <td className="py-2 font-sans text-sm">Current credit balance</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pr-4"><span className="bg-green-100 px-2 py-0.5 rounded font-bold text-green-800">GET</span></td>
                    <td className="py-2 pr-4">/v1/client</td>
                    <td className="py-2 font-sans text-sm">Client profile</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pr-4"><span className="bg-blue-100 px-2 py-0.5 rounded font-bold text-blue-800">POST</span></td>
                    <td className="py-2 pr-4">/v1/client/payee</td>
                    <td className="py-2 font-sans text-sm">Set payee Lightning Address</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pr-4"><span className="bg-blue-100 px-2 py-0.5 rounded font-bold text-blue-800">POST</span></td>
                    <td className="py-2 pr-4">/v1/paywall/challenge</td>
                    <td className="py-2 font-sans text-sm">Create L402 challenge (invoice + macaroon)</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pr-4"><span className="bg-blue-100 px-2 py-0.5 rounded font-bold text-blue-800">POST</span></td>
                    <td className="py-2 pr-4">/v1/paywall/verify</td>
                    <td className="py-2 font-sans text-sm">Verify L402 payment, spend credits</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pr-4"><span className="bg-blue-100 px-2 py-0.5 rounded font-bold text-blue-800">POST</span></td>
                    <td className="py-2 pr-4">/v1/spend</td>
                    <td className="py-2 font-sans text-sm">Manual credit spend (idempotent)</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pr-4"><span className="bg-green-100 px-2 py-0.5 rounded font-bold text-green-800">GET</span></td>
                    <td className="py-2 pr-4">/v1/topup/{'{'}plan_id{'}'}</td>
                    <td className="py-2 font-sans text-sm">Purchase credits (L402 flow)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Reporting Endpoints */}
          <div className="brutal-card mb-6">
            <h3 className="text-xl font-bold mb-4">Reporting <span className="text-sm font-normal text-[var(--text-secondary)]">(X-Api-Key required)</span></h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-black">
                    <th className="text-left py-2 pr-4 font-bold">Method</th>
                    <th className="text-left py-2 pr-4 font-bold">Path</th>
                    <th className="text-left py-2 font-bold">Description</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pr-4"><span className="bg-green-100 px-2 py-0.5 rounded font-bold text-green-800">GET</span></td>
                    <td className="py-2 pr-4">/v1/ledger</td>
                    <td className="py-2 font-sans text-sm">Paginated ledger entries</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pr-4"><span className="bg-green-100 px-2 py-0.5 rounded font-bold text-green-800">GET</span></td>
                    <td className="py-2 pr-4">/v1/usage/summary</td>
                    <td className="py-2 font-sans text-sm">Aggregated usage summary</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pr-4"><span className="bg-green-100 px-2 py-0.5 rounded font-bold text-green-800">GET</span></td>
                    <td className="py-2 pr-4">/v1/usage/daily</td>
                    <td className="py-2 font-sans text-sm">Daily usage time series</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pr-4"><span className="bg-green-100 px-2 py-0.5 rounded font-bold text-green-800">GET</span></td>
                    <td className="py-2 pr-4">/v1/usage/forecast</td>
                    <td className="py-2 font-sans text-sm">Forecast + purchase recommendation</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* SDKs */}
        <section className="mb-16">
          <h2 className="text-3xl font-extrabold mb-6">SDKs & Integrations</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="brutal-card">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-blue-100 border-2 border-black rounded-lg px-3 py-1 font-mono text-sm font-bold">Python</span>
                <span className="text-sm text-[var(--text-secondary)]">PyPI</span>
              </div>
              <h3 className="font-bold text-lg mb-2">satsgate-sdk</h3>
              <p className="text-sm text-[var(--text-secondary)] mb-3">Sync + async client with LRU cache, idempotency, and full API coverage.</p>
              <code className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">pip install satsgate-sdk</code>
            </div>
            <div className="brutal-card">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-green-100 border-2 border-black rounded-lg px-3 py-1 font-mono text-sm font-bold">TypeScript</span>
                <span className="text-sm text-[var(--text-secondary)]">npm</span>
              </div>
              <h3 className="font-bold text-lg mb-2">@satsgate/sdk</h3>
              <p className="text-sm text-[var(--text-secondary)] mb-3">Native fetch, full type definitions, zero runtime dependencies.</p>
              <code className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">npm install @satsgate/sdk</code>
            </div>
            <div className="brutal-card">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-purple-100 border-2 border-black rounded-lg px-3 py-1 font-mono text-sm font-bold">MCP</span>
                <span className="text-sm text-[var(--text-secondary)]">npm</span>
              </div>
              <h3 className="font-bold text-lg mb-2">@satsgate/mcp</h3>
              <p className="text-sm text-[var(--text-secondary)] mb-3">MCP server for AI agents. 11 tools for Claude Desktop, Cursor, and more.</p>
              <code className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">npx satsgate-mcp</code>
            </div>
            <div className="brutal-card">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-orange-100 border-2 border-black rounded-lg px-3 py-1 font-mono text-sm font-bold">Vercel AI</span>
                <span className="text-sm text-[var(--text-secondary)]">npm</span>
              </div>
              <h3 className="font-bold text-lg mb-2">@satsgate/vercel-ai</h3>
              <p className="text-sm text-[var(--text-secondary)] mb-3">Paywall middleware + AI tools for Vercel AI SDK and Next.js.</p>
              <code className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">npm install @satsgate/vercel-ai</code>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="mb-16">
          <h2 className="text-3xl font-extrabold mb-6">Pricing</h2>
          <div className="brutal-card">
            <p className="text-[var(--text-secondary)] mb-6">Credits are purchased via Lightning Network. 1 credit = 1 paywall verification.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-black">
                    <th className="text-left py-2 pr-4 font-bold">Plan</th>
                    <th className="text-right py-2 pr-4 font-bold">Price</th>
                    <th className="text-right py-2 pr-4 font-bold">Credits</th>
                    <th className="text-right py-2 font-bold">Per Verification</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-200">
                    <td className="py-3 pr-4 font-bold">Trial</td>
                    <td className="py-3 pr-4 text-right font-mono">1,000 sats</td>
                    <td className="py-3 pr-4 text-right font-mono">200</td>
                    <td className="py-3 text-right font-mono">~5 sats</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-3 pr-4 font-bold">Starter</td>
                    <td className="py-3 pr-4 text-right font-mono">10,000 sats</td>
                    <td className="py-3 pr-4 text-right font-mono">2,500</td>
                    <td className="py-3 text-right font-mono">~4 sats</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-3 pr-4 font-bold">Growth</td>
                    <td className="py-3 pr-4 text-right font-mono">100,000 sats</td>
                    <td className="py-3 pr-4 text-right font-mono">30,000</td>
                    <td className="py-3 text-right font-mono">~3.3 sats</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-3 pr-4 font-bold">Scale</td>
                    <td className="py-3 pr-4 text-right font-mono">500,000 sats</td>
                    <td className="py-3 pr-4 text-right font-mono">200,000</td>
                    <td className="py-3 text-right font-mono">~2.5 sats</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-3 pr-4 font-bold">Hyper</td>
                    <td className="py-3 pr-4 text-right font-mono">1,000,000 sats</td>
                    <td className="py-3 pr-4 text-right font-mono">500,000</td>
                    <td className="py-3 text-right font-mono">~2 sats</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-bold">Mega</td>
                    <td className="py-3 pr-4 text-right font-mono">10,000,000 sats</td>
                    <td className="py-3 pr-4 text-right font-mono">10,000,000</td>
                    <td className="py-3 text-right font-mono">1 sat</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="text-center">
          <div className="brutal-card inline-block">
            <p className="text-lg font-bold mb-4">Ready to monetize your AI endpoints?</p>
            <Link href="/login" className="brutal-btn brutal-btn-primary">
              Get Started
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
