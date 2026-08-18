"""
AIPP Protocol — Hugging Face & Gradio AI Model Monetization Example
Allows AI creators on Hugging Face Spaces to monetize their model inference
using Bitcoin Lightning (L402) with 0% platform lock-in.
"""

import os
import sys

# Optional import for Gradio (if installed)
try:
    import gradio as gr
except ImportError:
    gr = None

sys.path.insert(0, os.path.abspath("sdk/aipp-python"))
from aipp import Aipp

AIPP_API_KEY = os.getenv("AIPP_API_KEY")
if not AIPP_API_KEY:
    raise RuntimeError("AIPP_API_KEY is required")
client = Aipp(api_key=AIPP_API_KEY, base_url="https://aipp.dev")

def generate_ai_artwork(prompt: str, payment_hash: str = None) -> dict:
    """
    Monetized AI model inference function.
    Requires 16 sats ($0.01) micro-payment per generation.
    """
    price_usd = 0.01  # $0.01 per run
    
    if not payment_hash:
        # Step 1: Issue L402 challenge
        charge = client.create_charge(amount_usd=price_usd, protocol="L402", memo=f"Gradio AI: {prompt[:25]}")
        return {
            "status": "PAYMENT_REQUIRED",
            "code": 402,
            "amount_sats": charge.amount_sats,
            "invoice": charge.payment_request,
            "payment_hash": charge.payment_hash,
            "instructions": f"Scan with Lightning Wallet (Phoenix/Wallet of Satoshi) to pay {charge.amount_sats} sats and paste the hash/preimage to generate."
        }
    
    # Step 2: Verify settlement
    receipt = client.get_receipt(payment_hash)
    if receipt.status != "settled":
        return {"status": "ERROR", "message": "Payment hash not yet confirmed on network."}

    # Step 3: Deliver premium AI generation output
    return {
        "status": "SUCCESS",
        "prompt": prompt,
        "artwork_url": f"https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800",
        "resolution": "4K Ultra-HD",
        "receipt_id": receipt.receipt_id,
        "preimage": receipt.payment_details.proof,
        "record_type": "technical payment receipt"
    }

if __name__ == "__main__":
    print("--- 1. User requests AI generation without payment ---")
    res1 = generate_ai_artwork(prompt="Cyberpunk Tokyo Neon Alley")
    print(res1)
