# AIPP LangChain Tools

LangChain integration for AIPP. Give your AI agents the ability to top up credits automatically via Lightning Network.

## Installation

```bash
pip install aipp-langchain
```

Or from source:

```bash
cd sdks/aipp-langchain
pip install -e .
```

## Quickstart

```python
import os
from aipp_langchain import AIPPTopupTool
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI

# Create the topup tool
topup_tool = AIPPTopupTool(
    aipp_api_key=os.environ["AIPP_API_KEY"],
    aipp_base_url="https://api.aipp.dev",
    wallet_type="alby",
    wallet_token=os.environ["ALBY_BEARER_TOKEN"],
)

# Use with LangChain agent
llm = ChatOpenAI(model="gpt-4o")
agent = create_openai_functions_agent(llm, [topup_tool], ...)
agent_executor = AgentExecutor(agent=agent, tools=[topup_tool], ...)

result = agent_executor.invoke({
    "input": "My AIPP balance is low. Please top up with the value plan."
})
```

## API Reference

### `AIPPTopupTool`

A LangChain tool that automatically tops up AIPP credits. It:
1. Requests a Lightning invoice from AIPP
2. Pays it using your configured wallet (Alby or LNbits)
3. Verifies the L402 preimage and claims credits

#### Constructor

```python
AIPPTopupTool(
    aipp_api_key: str,                          # Your AIPP API key
    aipp_base_url: str = "https://api.aipp.dev", # Server URL
    wallet_type: str = "alby",                   # "alby" or "lnbits"
    wallet_token: str | None = None,             # Auth token for wallet
    wallet_url: str | None = None,               # LNbits URL (required for lnbits)
)
```

If `wallet_token` is not provided, it reads from environment:
- Alby: `ALBY_BEARER_TOKEN`
- LNbits: `LNBITS_ADMIN_KEY`

#### Parameters

The tool takes one parameter:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `plan_id` | `string` | `"starter"` | Plan to purchase (`trial`, `value`, `pro`) |

#### Return Value

On success:
```
"Success! Added 200 credits. New balance: 200."
```

On failure:
```
"Error during topup process: ..."
```

## Environment Variables

| Variable | Required For | Description |
|----------|-------------|-------------|
| `AIPP_API_KEY` | ✅ Always | Your AIPP API key |
| `ALBY_BEARER_TOKEN` | Alby wallet | Alby API token |
| `LNBITS_ADMIN_KEY` | LNbits wallet | LNbits admin key |
| `LNBITS_URL` | LNbits wallet | Your LNbits server URL |

## Examples

### Alby Wallet

```python
tool = AIPPTopupTool(
    aipp_api_key="sg_YOUR_KEY",
    wallet_type="alby",
    wallet_token="alby_token_here",
)
result = tool._run(plan_id="value")
print(result)  # "Success! Added 10000 credits. New balance: 10000."
```

### LNbits Wallet

```python
tool = AIPPTopupTool(
    aipp_api_key="sg_YOUR_KEY",
    wallet_type="lnbits",
    wallet_token="lnbits_admin_key",
    wallet_url="https://lnbits.your-server.com",
)
result = tool._run(plan_id="pro")
```

### With Environment Variables

```bash
export AIPP_API_KEY="sg_YOUR_KEY"
export ALBY_BEARER_TOKEN="your_token"
```

```python
tool = AIPPTopupTool(aipp_api_key=os.environ["AIPP_API_KEY"])
```

## How It Works

```
Agent calls tool("value")
  → aipp.client.topup("value")      # Get L402 challenge (402)
  → _pay_with_alby(invoice)          # Pay Lightning invoice
  → aipp.client.verify_topup(...)    # Verify preimage, claim credits
  → "Success! Added 10000 credits."  # Return result to agent
```

## Testing

```bash
cd sdks/aipp-langchain
pip install pytest httpx respx
python -m pytest tests/ -v
```

## Plans

| Plan | Price | Credits |
|------|-------|---------|
| Trial | 1,000 sats | 200 |
| Value | 25,000 sats | 10,000 |
| Pro | 250,000 sats | 150,000 |

Credits never expire. No subscription. No credit card.
