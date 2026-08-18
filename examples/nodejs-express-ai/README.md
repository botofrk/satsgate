# Node.js Express + AIPP (Pay-per-Prompt AI)

This example shows how to build an L402-compliant paywall for an AI API using Node.js, Express, and the official `aipp-node` SDK.

## Features
- Generates a Lightning Invoice on the fly for API usage.
- Prevents replay attacks using an in-memory Set to track used payment hashes.
- Seamlessly integrates with AI SDKs (like Vercel AI SDK or OpenAI).

## Setup

1. Install dependencies:
```bash
npm install express aipp-node
```

2. Add your AIPP API Key to `index.js`.

3. Run the server:
```bash
node index.js
```

## Testing

**1. Request a prompt (Fails with 402)**
```bash
curl -X POST http://localhost:3000/api/generate \
-H "Content-Type: application/json" \
-d '{"prompt": "Write a poem"}'
```

**2. Pay the returned `payment_request` invoice.**

**3. Resubmit the request**
```bash
curl -X POST http://localhost:3000/api/generate \
-H "Content-Type: application/json" \
-d '{"prompt": "Write a poem", "payment_hash": "YOUR_HASH"}'
```
