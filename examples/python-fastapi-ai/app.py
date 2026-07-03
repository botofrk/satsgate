import os
from fastapi import FastAPI, HTTPException, Header, Depends
from pydantic import BaseModel
from aipp import Aipp
import requests

app = FastAPI(title="AIPP AI Pay-per-Prompt Example")

# Initialize AIPP SDK (Merchant side)
# In production, use environment variables: os.getenv("AIPP_API_KEY")
AIPP_API_KEY = "aipp_merch_your_api_key_here"
aipp_client = Aipp(api_key=AIPP_API_KEY)

# Mock AI service (e.g. OpenAI)
def generate_ai_response(prompt: str) -> str:
    return f"AI says: This is a premium response to your prompt: '{prompt}'"

class PromptRequest(BaseModel):
    prompt: str
    payment_hash: str | None = None

@app.post("/api/chat")
async def chat_endpoint(request: PromptRequest):
    # If no payment hash is provided, the user needs to pay first!
    if not request.payment_hash:
        # Create a lightning invoice for 50 sats
        charge = aipp_client.create_charge(
            amount_sats=50, 
            memo="AI Prompt Generation Fee"
        )
        # Return HTTP 402 Payment Required (L402 Protocol Draft)
        raise HTTPException(
            status_code=402,
            detail={
                "error": "Payment Required",
                "payment_request": charge.payment_request,
                "payment_hash": charge.payment_hash,
                "amount_sats": charge.amount_sats,
                "message": "Please pay this Lightning invoice and resubmit your request with the payment_hash."
            }
        )
    
    # If payment_hash is provided, verify it with AIPP
    try:
        status = aipp_client.get_charge(request.payment_hash)
        if status.status != "settled":
            raise HTTPException(status_code=402, detail="Invoice not settled yet. Please pay the invoice.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Payment is verified! Generate AI response.
    # Note: In a real app, you must mark the payment_hash as "used" in your DB 
    # to prevent replay attacks (users reusing the same payment hash).
    
    ai_response = generate_ai_response(request.prompt)
    
    return {
        "success": True,
        "response": ai_response,
        "paid_sats": 50
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
