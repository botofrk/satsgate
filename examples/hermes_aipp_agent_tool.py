"""
================================================================================
⚡ AIPP PROTOCOL — OFFICIAL TOOL & SKILL FOR NOUS RESEARCH HERMES AGENT
================================================================================
Framework: Hermes Agent (Nous Research / Hermes 3)
Capabilities:
  1. issue_aipp_charge: Issues an L402 / X402 micro-payment challenge
  2. verify_aipp_settlement: Verifies settlement and returns a technical receipt
  3. pay_aipp_invoice: Explicitly disabled unless an operator supplies a safe adapter
================================================================================
"""

import os
import sys
from typing import Dict, Any, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'sdk', 'aipp-python')))
from aipp import Aipp

class HermesAippTool:
    """
    Official AIPP Micro-Payment Skill for Nous Research Hermes Agent.
    Enables Hermes instances to autonomously pay for external APIs and monetize
    their own reasoning tools. Credentials are supplied by the runtime.
    """

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None):
        self.api_key = api_key or os.environ.get("AIPP_API_KEY")
        if not self.api_key:
            raise ValueError("AIPP_API_KEY is required")
        self.base_url = (base_url or os.environ.get("AIPP_BASE_URL") or "https://aipp.dev").rstrip("/")
        self.client = Aipp(api_key=self.api_key, base_url=self.base_url)

    def get_hermes_function_definitions(self) -> list:
        """
        Returns JSON function definitions compatible with Hermes 3 / Nous Research
        Tool Calling Schema.
        """
        return [
            {
                "name": "issue_aipp_charge",
                "description": "Issue an L402 Bitcoin Lightning or Base USDC payment challenge before executing a premium tool or delivering private knowledge.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "amount_usd": {
                            "type": "number",
                            "description": "Amount to charge in USD (e.g. 0.01 for 16 sats, 0.05 for 80 sats)."
                        },
                        "memo": {
                            "type": "string",
                            "description": "Description of the work or inference being monetized."
                        },
                        "protocol": {
                            "type": "string",
                            "enum": ["L402", "X402", "DUAL"],
                            "description": "Payment protocol (L402 = Bitcoin Lightning, X402 = Base USDC, DUAL = Both)."
                        }
                    },
                    "required": ["amount_usd", "memo"]
                }
            },
            {
                "name": "verify_aipp_settlement",
                "description": "Verify whether an invoice settled and retrieve its technical transaction receipt.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "payment_hash": {
                            "type": "string",
                            "description": "The payment hash returned when the charge was created."
                        }
                    },
                    "required": ["payment_hash"]
                }
            },
            {
                "name": "pay_aipp_invoice",
                "description": "Pay a Lightning invoice only through an operator-configured and budget-limited adapter. Disabled by default.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "payment_request": {
                            "type": "string",
                            "description": "The BOLT11 Lightning invoice string starting with lnbc..."
                        }
                    },
                    "required": ["payment_request"]
                }
            }
        ]

    def issue_aipp_charge(self, amount_usd: float, memo: str, protocol: str = "L402") -> Dict[str, Any]:
        """Issue a micro-payment challenge."""
        try:
            charge = self.client.create_charge(amount_usd=amount_usd, protocol=protocol, memo=memo)
            return {
                "status": "PAYMENT_REQUIRED",
                "http_status": 402,
                "amount_sats": charge.amount_sats,
                "amount_usd": amount_usd,
                "payment_request": charge.payment_request,
                "payment_hash": charge.payment_hash,
                "instructions": f"Pay {charge.amount_sats} sats via Lightning to unlock execution."
            }
        except Exception as e:
            return {"error": str(e), "status": "FAILED"}

    def verify_aipp_settlement(self, payment_hash: str) -> Dict[str, Any]:
        """Verify cryptographic settlement and return compliance receipt."""
        try:
            receipt = self.client.get_receipt(payment_hash)
            if receipt.status == "settled":
                return {
                    "status": "SETTLED",
                    "paid": True,
                    "preimage": receipt.payment_details.proof,
                    "receipt_id": receipt.receipt_id,
                    "record_type": "technical payment receipt",
                    "total_amount_usd": receipt.financials.total_amount
                }
            return {
                "status": "PENDING",
                "paid": False,
                "message": "Payment not yet confirmed on network."
            }
        except Exception as e:
            return {"error": str(e), "status": "FAILED"}

    def pay_aipp_invoice(self, payment_request: str) -> Dict[str, Any]:
        """External payment is intentionally disabled in the portable skill.

        Payment needs a wallet-specific adapter that parses BOLT11 amounts,
        enforces an operator budget and invokes the wallet without a shell.
        """
        return {
            "status": "DISABLED",
            "error": "No approved Lightning payment adapter is configured."
        }

# Standalone Verification Test for Hermes
if __name__ == "__main__":
    print("=================================================================")
    print("[HERMES TEST] NOUS RESEARCH HERMES AGENT - AIPP TOOL VERIFICATION")
    print("=================================================================")
    
    hermes_tool = HermesAippTool()
    print("Configured Hermes function definitions:")
    for definition in hermes_tool.get_hermes_function_definitions():
        print(f"- {definition['name']}: {definition['description']}")
    print("No invoice was created and no real payment was attempted.")
