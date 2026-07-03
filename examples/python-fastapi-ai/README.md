# Python FastAPI + AIPP (Pay-per-Prompt AI)

This example demonstrates how to monetize an AI endpoint using the `aipp-sdk` and the **L402 Protocol (HTTP 402 Payment Required)**.

## How it works
1. The user sends a prompt to `/api/chat`.
2. The server intercepts it and returns a `402 Payment Required` with a Lightning Invoice (generated via AIPP) for 50 sats.
3. The user pays the invoice with their Lightning wallet.
4. The user resubmits the prompt along with the `payment_hash`.
5. The server checks the AIPP API to confirm the payment was settled, and then returns the AI generated response.

## Setup

1. Install dependencies:
```bash
pip install fastapi uvicorn aipp-sdk pydantic
```

2. Add your AIPP API Key inside `app.py`.

3. Run the server:
```bash
python app.py
```

## Testing (cURL)

**Step 1: Try to get a response (Will fail with 402)**
```bash
curl -X POST http://localhost:8000/api/chat \
-H "Content-Type: application/json" \
-d '{"prompt": "Hello AI!"}'
```

**Step 2: Pay the invoice returned by Step 1 using a wallet.**

**Step 3: Resubmit with the payment hash**
```bash
curl -X POST http://localhost:8000/api/chat \
-H "Content-Type: application/json" \
-d '{"prompt": "Hello AI!", "payment_hash": "the_hash_from_step_1"}'
```
