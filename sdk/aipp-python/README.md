# AIPP Python SDK

Official Python client for the AIPP API (The Lightning Network Split-Payment Gateway).

## Installation

```bash
pip install aipp-sdk
```

## Usage

```python
from aipp import Aipp

client = Aipp(api_key="your_api_key_here")

# Create a charge
charge = client.create_charge(amount_sats=500, memo="Test payment")
print(f"Pay this invoice: {charge.payment_request}")

# Check status
status = client.get_charge(charge.payment_hash)
print(f"Status: {status.status}")
```
