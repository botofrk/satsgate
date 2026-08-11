---
name: aipp-micropayments
description: Autonomous Bitcoin Lightning (L402) and Base USDC (x402) micro-payment tool for Nous Research Hermes Agent. Enables Hermes to monetize tool execution, pay external APIs, and generate EU AI Act Art. 26 verifiable receipts.
---

# AIPP Micro-Payment Skill for Hermes Agent

This skill equips the **Nous Research Hermes Agent** with non-custodial micro-payment rails ($0.001 - $100) using Bitcoin Lightning (L402) and Base USDC (x402).

## Tools Provided to Hermes:
1. `issue_aipp_charge(amount_usd, memo)`: Issues a payment challenge to lock premium outputs.
2. `verify_aipp_settlement(payment_hash_or_preimage)`: Verifies cryptographic settlement preimages.
3. `pay_aipp_invoice(payment_request)`: Autonomously pays Lightning invoices to consume external paid APIs.

## Operating Rules:
- When a caller requests premium execution or private data, call `issue_aipp_charge` and provide the invoice.
- When payment proof is supplied, call `verify_aipp_settlement` to ensure cryptographic settlement.
- Always include the resulting `preimage` and `receipt_id` as verifiable proof under EU AI Act Article 26.
