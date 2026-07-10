import urllib.request
import urllib.parse
import json
import time

class AippLNBitsWallet:
    def __init__(self, wallet_url: str, wallet_key: str):
        self.wallet_url = wallet_url.rstrip('/')
        self.wallet_key = wallet_key
        
    def pay_invoice(self, bolt11: str, max_sats: int) -> str:
        """
        Pays a Lightning Invoice using the LNBits sub-wallet.
        Returns the preimage if successful.
        """
        # Decode invoice to check amount
        req = urllib.request.Request(
            f"{self.wallet_url}/api/v1/payments/decode",
            data=json.dumps({"data": bolt11}).encode('utf-8'),
            headers={"X-Api-Key": self.wallet_key, "Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req) as response:
                decoded = json.loads(response.read().decode())
                # amount_msat / 1000 = sats
                amount_sats = decoded.get("amount_msat", 0) / 1000
                if amount_sats > max_sats:
                    raise Exception(f"Invoice amount ({amount_sats} sats) exceeds max_sats_per_tx ({max_sats} sats)")
        except urllib.error.HTTPError as e:
            raise Exception(f"Failed to decode invoice: {e.read().decode()}")
            
        # Pay invoice
        req = urllib.request.Request(
            f"{self.wallet_url}/api/v1/payments",
            data=json.dumps({"out": True, "bolt11": bolt11}).encode('utf-8'),
            headers={"X-Api-Key": self.wallet_key, "Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req) as response:
                payment_info = json.loads(response.read().decode())
                payment_hash = payment_info.get("payment_hash")
        except urllib.error.HTTPError as e:
            raise Exception(f"Payment failed: {e.read().decode()}")
            
        # Wait for payment to settle and get preimage
        for _ in range(10):
            req = urllib.request.Request(
                f"{self.wallet_url}/api/v1/payments/{payment_hash}",
                headers={"X-Api-Key": self.wallet_key}
            )
            with urllib.request.urlopen(req) as response:
                status = json.loads(response.read().decode())
                if status.get("paid"):
                    return status.get("preimage")
            time.sleep(1)
            
        raise Exception("Payment timeout, preimage not received")

def create_l402_payment_tool(wallet_url: str, wallet_key: str, max_sats_per_tx: int = 1000):
    """
    Creates a LangChain-compatible Tool for paying L402 Lightning invoices.
    Requirements: pip install langchain-core
    """
    try:
        from langchain_core.tools import tool
    except ImportError:
        raise ImportError("langchain-core is required to use this tool. Please install it using `pip install langchain-core`")

    wallet = AippLNBitsWallet(wallet_url, wallet_key)

    @tool
    def L402PaymentTool(invoice: str) -> str:
        """
        Use this tool to pay a Lightning Network invoice (bolt11) when you receive a 402 Payment Required error.
        It will pay the invoice using your allocated sub-wallet budget and return the cryptographic 'preimage'.
        You must then include this preimage along with the macaroon in your next request header:
        Authorization: L402 <macaroon>:<preimage>
        """
        try:
            return wallet.pay_invoice(invoice, max_sats=max_sats_per_tx)
        except Exception as e:
            return f"PAYMENT FAILED: {str(e)}. Do not retry with this invoice unless you are given a different budget."

    return L402PaymentTool
