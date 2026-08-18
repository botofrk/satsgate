"""
LangChain + AIPP Open Tag Autonomous Micro-Payment Tool Example
Enables autonomous AI agents to charge or pay for downstream tools using Bitcoin Lightning (L402) or Base USDC (x402).
"""

import os
from aipp import Aipp

# Initialize AIPP Client
AIPP_API_KEY = os.getenv("AIPP_API_KEY", "aipp_merch_testkey")
aipp_client = Aipp(api_key=AIPP_API_KEY)

def generate_monetized_research_tool(query: str, payment_hash: str = None) -> dict:
    """
    A LangChain-compatible tool that requires payment verification
    before returning premium deep-research data.
    """
    price_usd = 0.05  # 5 cents micro-payment
    
    # 1. If no payment proof provided, issue an L402 / x402 challenge
    if not payment_hash:
        charge = aipp_client.create_charge(
            amount_usd=price_usd,
            protocol="DUAL",
            memo=f"AI Research Query: {query[:30]}"
        )
        return {
            "status": "PAYMENT_REQUIRED",
            "http_status": 402,
            "invoice": charge.payment_request,
            "payment_hash": charge.payment_hash,
            "amount_sats": charge.amount_sats,
            "amount_usd": charge.amount_usd,
            "pay_to": charge.pay_to,
            "token": charge.token,
            "message": "Please settle via Lightning invoice or Base USDC, then pass payment_hash to verify."
        }
        
    # 2. Verify settlement status via AIPP
    receipt = aipp_client.get_receipt(payment_hash)
    
    if receipt.get("status") != "settled":
        return {"error": "Invalid or unsettled payment", "status": 403}

    # 3. Deliver premium AI generation
    return {
        "status": "SUCCESS",
        "query": query,
        "result": f"Deep research findings for '{query}' successfully synthesized.",
        "receipt": receipt,  # Technical transaction record; not a legal compliance certification.
    }

def agent_pay_and_execute_usdc(query: str, wallet_sender_func) -> dict:
    """
    Autonomous caller workflow for Base USDC:
    Requests challenge -> Pays & settles automatically via SDK -> Retrieves final data.
    """
    # Step 1: Request tool without payment to get challenge
    challenge = generate_monetized_research_tool(query=query)
    if challenge.get("http_status") != 402:
        return challenge
    
    # Step 2: Pay & settle automatically in 1 call (no manual ?tx_hash required)
    settle_result = aipp_client.pay_and_settle_usdc(
        payment_hash=challenge["payment_hash"],
        amount_usd=challenge["amount_usd"],
        pay_to=challenge["pay_to"],
        send_usdc_transaction=wallet_sender_func
    )

    if not settle_result.paid:
        return {"error": f"Settlement failed: {settle_result.error}", "status": 402}

    # Step 3: Call tool with settled payment_hash
    return generate_monetized_research_tool(query=query, payment_hash=challenge["payment_hash"])

if __name__ == "__main__":
    print("--- 1. Agent calls tool without payment ---")
    challenge = generate_monetized_research_tool(query="Emerging Markets Crypto Adoption")
    print("Challenge Output:\n", challenge)

