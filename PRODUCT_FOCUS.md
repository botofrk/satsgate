# AIPP compact product focus

Last updated: 2026-08-13

## The three pains AIPP solves

1. **Tiny sales are uneconomic on card rails.** Fixed per-transaction fees can
   consume a large part of a $0.10–$3 sale.
2. **Selling one digital thing requires too much machinery.** A creator should
   not need a storefront, subscription system and long onboarding merely to sell
   a file, link, prompt or booking.
3. **Software cannot repeatedly complete human checkout flows.** APIs and AI
   agents need a machine-readable price, payment proof and continuation within
   the request flow.

## Product sentence

> Put a price on a file, link, AI output or API call. Share one Smart Tag and get
> paid with Lightning or Base USDC.

## Compact information architecture

The homepage is the product, not a catalogue of protocols:

1. One promise.
2. One Smart Tag form.
3. Three optional tools: sell a link, tag a website, charge an API/agent.
4. Short explanation of the small-sale and agent-payment problems.
5. Docs, legal and dashboard links.

The creator uses progressive disclosure: Lightning is the default payout and
only its address is visible. Base USDC or dual-rail fields appear when chosen.
The public type picker stays limited to link/file, AI/prompt and API/agent.
The three-tool illustration comes before the compact Quick Tag creator. Product
understanding precedes setup and payout questions.

Protocol names, SDK matrices, comparisons, long reports and ecosystem showcases
belong in documentation rather than the first purchasing flow.

The three optional paths are rendered as an original AIPP Tag Multi-Tool with
three connected modules. The product stays compact, useful at the exact moment
it is needed, and never forces every tool on every user.

## Product boundaries

- Quick Link/post-payment fulfillment is the default human product.
- Chrome Element Picker is a visual embed publisher, not a secure secret store.
- HTTP 402 middleware is the server-side product for APIs and agents.
- No credits, subscriptions, merchant channels or additional chains in the MVP.
- One Lightning invoice; merchant price plus the disclosed AIPP fee.
