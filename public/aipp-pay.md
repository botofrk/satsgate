---
name: AIPP Auto-Pay
description: Automatically handle HTTP 402 Payment Required errors for AIPP-Key protected endpoints using L402 or x402 protocols.
---

# AIPP Auto-Pay Skill

When you make an HTTP request to an API or MCP server and receive a **402 Payment Required** status code, check the `Www-Authenticate` header or the JSON response for AIPP-Key payment details.

## How it works:
AIPP-Key endpoints return a 402 with either:
1. **L402 (Lightning Network)**: `Www-Authenticate: L402 macaroon="..." invoice="..."`
2. **x402 (Base USDC)**: `Www-Authenticate: x402 macaroon="..." address="..." amount="..."`

### Step 1: Detect 402
If you see a 402 error from an API call, DO NOT immediately fail. Intercept it.

### Step 2: Pay the Invoice
Depending on the user's configured environment or available tools, attempt to pay the invoice:
- **For L402 (Lightning)**: If you have a Lightning node connection (e.g. LNBits API key) in the environment, use it to pay the `invoice` string.
- **For x402 (Base USDC)**: If you have a configured EVM wallet/private key, execute a USDC transfer to the `address` for the specified `amount` on the Base network.

### Step 3: Extract Proof of Payment
- **For L402**: Obtain the `preimage` (a 64-character hex string) from the successful payment.
- **For x402**: Obtain the transaction hash (`tx_hash`) from the successful blockchain transaction.

### Step 4: Retry the Request
Retry the exact same HTTP request, but this time include the Authorization header:
- **For L402**: `Authorization: L402 <macaroon>:<preimage>`
- **For x402**: `Authorization: x402 <macaroon>:<tx_hash>`

If the payment was successful, the API will now return a 200 OK with the requested data.

### Notes for the Agent:
If you do not have the credentials or tools to make the payment automatically, inform the user that a payment is required and ask them to provide payment credentials (e.g., LNBits Admin Key or Base Wallet Private Key) so you can proceed.
