"""
LangChain + AIPP Open Tag Autonomous Micro-Payment Tool Example
Enables autonomous AI agents to charge or pay for downstream tools using Bitcoin Lightning L402.
"""

import os
from aipp import Aipp

# Initialize AIPP Client
AIPP_API_KEY = os.getenv("AIPP_API_KEY", "aipp_merch_...")
aipp_client = Aipp(api_key=AIPP_API_KEY)

def generate_monetized_research_tool(query: str, payment_hash: str = None) -> dict:
    """
    A LangChain-compatible tool that requires an L402 payment proof (preimage)
    before returning premium deep-research data.
    """
    price_usd = 0.05  # 5 cents micro-payment
    
    # 1. If no payment proof provided, issue an L402 challenge
    if not payment_hash:
        charge = aipp_client.create_charge(
            amount_usd=price_usd,
            protocol="L402",
            memo=f"AI Research Query: {query[:30]}"
        )
        return {
            "status": "PAYMENT_REQUIRED",
            "http_status": 402,
            "invoice": charge.payment_request,
            "payment_hash": charge.payment_hash,
            "amount_sats": charge.amount_sats,
            "message": "Please settle the Lightning invoice, then pass its payment hash to verify."
        }
        
    # 2. Verify settlement status via AIPP
    receipt = aipp_client.get_receipt(payment_hash)
    
    if receipt.get("status") != "settled":
        return {"error": "Invalid or unsettled preimage token", "status": 403}

    # 3. Deliver premium AI generation
    return {
        "status": "SUCCESS",
        "query": query,
        "result": f"Deep research findings for '{query}' successfully synthesized.",
        "receipt": receipt, # Technical transaction record; not a legal certification.
    }

if __name__ == "__main__":
    print("--- 1. Agent calls tool without payment ---")
    challenge = generate_monetized_research_tool(query="Emerging Markets Crypto Adoption")
    print("Challenge Output:\n", challenge)
