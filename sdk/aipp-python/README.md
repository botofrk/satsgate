# AIPP Python SDK

Official Python client for AIPP Smart Tag & API micro-payments (Bitcoin Lightning L402 & Base USDC x402).

## Installation

```bash
pip install aipp-sdk
```

## Quickstart

```python
from aipp import Aipp

client = Aipp(api_key="your_api_key_here")
```

### 1. Automated Base USDC / x402 Settlement

Pay, submit proof, settle, and unlock content in **one logical call**:

```python
# Pass your web3 transaction dispatcher callback or existing tx_hash
result = client.pay_and_settle_usdc(
    payment_hash="x402_c18090f488fef2...",
    amount_usd=0.01,
    pay_to="0xGatewayAddress...",
    send_usdc_transaction=my_wallet_send_usdc,
    tag_id="p_9c48c15180a1",
    access_claim_secret="claim_secret_from_invoice",
    fetch_content=True
)

if result.paid:
    print(f"Settled! Access Token: {result.access_token}")
    print(f"Content: {result.content}")
```

#### Safe Recovery & Resume
If an on-chain transaction was sent but network settlement timed out or was interrupted, resume safely without double-paying:

```python
# Resume settlement using the existing on-chain tx_hash
result = client.pay_and_settle_usdc(
    payment_hash="x402_c18090f488fef2...",
    existing_tx_hash="0xYourOnChainTxHash..."
)
```

### 2. Bitcoin Lightning (L402) Charges

```python
# Create Lightning invoice
charge = client.create_charge(amount_sats=500, memo="AI Inference Query", protocol="L402")
print(f"Pay invoice: {charge.payment_request}")

# Check status
status = client.get_charge(charge.payment_hash)
print(f"Settled: {status.paid}")
```

