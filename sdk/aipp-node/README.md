# AIPP Node.js / TypeScript SDK

Official client for AIPP Smart Tag & API micro-payments (Bitcoin Lightning L402 & Base USDC x402).

## Installation

```bash
npm install aipp-sdk
```

## Quickstart

```typescript
import { Aipp } from 'aipp-sdk';

const client = new Aipp({ apiKey: 'your_api_key_here' });
```

### 1. Automated Base USDC / x402 Settlement

Pay, submit proof, settle, and unlock content in **one logical call**:

```typescript
// Using an ethers.js Signer or custom sendUsdcTransaction callback
const result = await client.payAndSettleUsdc({
  paymentHash: 'x402_c18090f488fef2...',
  amountUsd: 0.01,
  payTo: '0xGatewayAddress...',
  signer: ethersSigner, // or sendUsdcTransaction: async (details) => txHash
  tagId: 'p_9c48c15180a1',
  accessClaimSecret: 'claim_secret_from_invoice',
  fetchContent: true
});

if (result.paid) {
  console.log('Settled! Access Token:', result.accessToken);
  console.log('Unlocked Content:', result.content);
}
```

#### Safe Recovery & Resume
If an on-chain transaction was sent but network settlement timed out or was interrupted, resume safely without double-paying:

```typescript
// Resume settlement using the existing on-chain txHash
const result = await client.payAndSettleUsdc({
  paymentHash: 'x402_c18090f488fef2...',
  existingTxHash: '0xYourOnChainTxHash...'
});
```

### 2. Bitcoin Lightning (L402) Charges

```typescript
// Create Lightning invoice
const charge = await client.createCharge({
  amountSats: 500,
  memo: 'AI Inference Query',
  protocol: 'L402'
});
console.log('Pay invoice:', charge.payment_request);

// Check status
const status = await client.getCharge(charge.payment_hash);
console.log('Settled:', status.paid);
```
