# 🤖 AIPP Micro-Payment Skill for Nous Research Hermes Agent

This skill gives **Hermes Agent (by Nous Research)** autonomous machine-to-machine payment capabilities using **Bitcoin Lightning (L402)** and **Base USDC (x402)** with **EU AI Act Article 26 compliance**.

---

## ⚡ Key Capabilities for Hermes Instances:
1. **Monetize Tool Output:** Require micro-payments ($0.01 / 16 Sats) before delivering deep research, code execution, or data synthesis.
2. **Autonomous API Consumption:** Hermes can pay external Lightning invoices autonomously to unlock paid APIs, databases, or paywalled articles.
3. **100% Non-Custodial:** Funds route directly to the developer's wallet (Phoenix, Wallet of Satoshi, Base EVM) with 0% platform custody.
4. **Verifiable Audit Trail:** Every transaction generates a cryptographic preimage receipt complying with EU AI Act Article 26.

---

## 🚀 Installation & Usage:

```bash
# 1. Clone or copy into your Hermes Agent skills directory
git clone https://github.com/botofrk/satsgate.git

# 2. Run the standalone verification test
python examples/hermes_aipp_agent_tool.py
```

### Python Hermes Tool Example:
```python
from examples.hermes_aipp_agent_tool import HermesAippTool

hermes = HermesAippTool(api_key="YOUR_AIPP_KEY")

# Issue a 16 sat ($0.01) charge
challenge = hermes.issue_aipp_charge(amount_usd=0.01, memo="Deep Analysis")
print("Invoice:", challenge["payment_request"])

# Verify payment proof
receipt = hermes.verify_aipp_settlement(challenge["payment_hash"])
if receipt["paid"]:
    print("Settlement Proof Preimage:", receipt["preimage"])
```

---

## 📦 Protocol Links:
- **Website & Docs:** [https://aipp.dev](https://aipp.dev)
- **GitHub Repository:** [https://github.com/botofrk/satsgate](https://github.com/botofrk/satsgate)
- **Live 1-Click Specimen:** [https://aipp.dev/#showcase](https://aipp.dev/#showcase)
