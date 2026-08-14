# AIPP Smart Tag skill for Hermes

This adapter lets a Hermes agent create AIPP Lightning/x402 charges and verify
their settlement before releasing a paid result.

## Setup

```bash
export AIPP_API_KEY='your merchant key'
export AIPP_BASE_URL='https://aipp.dev'
python examples/hermes_aipp_agent_tool.py
```

The example does not pay a real invoice unless an operator explicitly configures
a separate, approved payment adapter. It contains no server address, wallet key
or embedded merchant credential.

## Safety model

- Use idempotency for retried charge creation.
- Release output only after a settled response.
- Treat receipts as technical records, not compliance certificates.
- Never expose API keys, wallet secrets or cross-merchant data.
