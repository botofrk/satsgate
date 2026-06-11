import os
import json
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Request, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import jwt
import ecdsa

from app.database import get_db
from app.models import Client
from app.rate_limit import redis_client
from app import db
from app.config import JWT_SECRET

# ---------------------------------------------------------------------------
# Minimal LNURL (bech32) encoder — avoids the heavy `lnurl` package and its
# problematic transitive dependencies (coincurve, bip32, pycryptodomex, etc.)
# LNURL encoding is simply bech32 encoding of the URL bytes with HRP "lnurl".
# Reference: BIP-173, LUD-01
# ---------------------------------------------------------------------------
_BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"

def _bech32_polymod(values):
    GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
    chk = 1
    for v in values:
        b = chk >> 25
        chk = ((chk & 0x1ffffff) << 5) ^ v
        for i in range(5):
            chk ^= GEN[i] if ((b >> i) & 1) else 0
    return chk

def _bech32_hrp_expand(hrp):
    return [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]

def _bech32_create_checksum(hrp, data):
    values = _bech32_hrp_expand(hrp) + data
    polymod = _bech32_polymod(values + [0, 0, 0, 0, 0, 0]) ^ 1
    return [(polymod >> 5 * (5 - i)) & 31 for i in range(6)]

def _convertbits(data, frombits, tobits, pad=True):
    acc = 0
    bits = 0
    ret = []
    maxv = (1 << tobits) - 1
    for value in data:
        acc = (acc << frombits) | value
        bits += frombits
        while bits >= tobits:
            bits -= tobits
            ret.append((acc >> bits) & maxv)
    if pad:
        if bits:
            ret.append((acc << (tobits - bits)) & maxv)
    elif bits >= frombits or ((acc << (tobits - bits)) & maxv):
        return None
    return ret

def lnurl_encode(url: str) -> str:
    """Encode a URL as an LNURL (bech32 with 'lnurl' HRP)."""
    data = _convertbits(list(url.encode("utf-8")), 8, 5)
    checksum = _bech32_create_checksum("lnurl", data)
    return "lnurl" + "1" + "".join([_BECH32_CHARSET[d] for d in data + checksum])

router = APIRouter(prefix="/v1/auth", tags=["auth"])


async def _get_client_by_pubkey(session: AsyncSession, pubkey: str) -> Client | None:
    stmt = select(Client).where(Client.pubkey == pubkey)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()

def verify_lnurl_sig(k1: str, sig: str, key: str) -> bool:
    try:
        key_bytes = bytes.fromhex(key)
        vk = ecdsa.VerifyingKey.from_string(key_bytes, curve=ecdsa.SECP256k1, valid_curve_encodings=(b'\x02', b'\x03', b'\x04'))
        return vk.verify_digest(bytes.fromhex(sig), bytes.fromhex(k1), sigdecode=ecdsa.util.sigdecode_der)
    except Exception as e:
        print(f"Sig verification error: {e}")
        return False

@router.get("/lnurl/generate")
async def lnurl_generate(request: Request):
    k1 = secrets.token_hex(32)
    # Store k1 in redis for 5 minutes
    await redis_client.setex(f"lnurl:{k1}", 300, json.dumps({"status": "pending"}))
    
    env_base = os.getenv("API_BASE_URL")
    if env_base:
        base_url = env_base.rstrip("/")
    else:
        base_url = str(request.base_url).rstrip("/").replace("http://", "https://")
    
    # Callback uses either the env variable or the actual server URL
    lnurl_callback_base = os.getenv("LNURL_CALLBACK_BASE", base_url)
    callback_url = f"{lnurl_callback_base}/v1/auth/lnurl/callback?k1={k1}&tag=login&action=login"
    encoded_lnurl = lnurl_encode(callback_url)
    
    return {"lnurl": encoded_lnurl, "k1": k1}

@router.get("/lnurl/callback")
async def lnurl_callback(request: Request, k1: str, sig: str = None, key: str = None):
    state_str = await redis_client.get(f"lnurl:{k1}")
    if not state_str:
        return {"status": "ERROR", "reason": "k1 expired or invalid"}
        
    # LUD-01 fallback
    if not sig or not key:
        env_base = os.getenv("API_BASE_URL")
        base_url = env_base.rstrip("/") if env_base else str(request.base_url).rstrip("/").replace("http://", "https://")
        lnurl_callback_base = os.getenv("LNURL_CALLBACK_BASE", base_url)
        callback_url = f"{lnurl_callback_base}/v1/auth/lnurl/callback"
        return {
            "tag": "login",
            "k1": k1,
            "callback": callback_url
        }
        
    if not verify_lnurl_sig(k1, sig, key):
        return {"status": "ERROR", "reason": "Invalid signature"}
        
    await redis_client.setex(f"lnurl:{k1}", 300, json.dumps({"status": "authenticated", "pubkey": key}))
    return {"status": "OK"}

@router.get("/lnurl/status")
async def lnurl_status(k1: str):
    state_str = await redis_client.get(f"lnurl:{k1}")
    if not state_str:
        raise HTTPException(status_code=400, detail="Invalid session")
        
    state = json.loads(state_str)
    if state["status"] == "authenticated":
        pubkey = state["pubkey"]
        
        payload = {
            "sub": pubkey,
            "exp": datetime.utcnow() + timedelta(days=7)
        }
        token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
        
        await redis_client.delete(f"lnurl:{k1}")
        return {"status": "authenticated", "token": token}
        
    return {"status": "pending"}

async def get_current_user(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authentication Token")
        
    token = auth_header.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload["sub"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token Expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid Token")


@router.get("/session")
async def get_session(
    session: AsyncSession = Depends(get_db),
    current_user_pubkey: str = Depends(get_current_user),
):
    existing_client = await _get_client_by_pubkey(session, current_user_pubkey)
    return {
        "ok": True,
        "authenticated": True,
        "pubkey": current_user_pubkey,
        "account": {
            "exists": existing_client is not None,
            "client_id": existing_client.id if existing_client else None,
            "credits": existing_client.credits if existing_client else None,
            "payee_lightning_address": (
                existing_client.payee_lightning_address if existing_client else None
            ),
        },
    }

@router.post("/provision")
async def provision_api_key(session: AsyncSession = Depends(get_db), current_user_pubkey: str = Depends(get_current_user)):
    """
    Creates an API key for the dashboard user, binds it to their Lightning pubkey,
    and grants them 50 trial credits if it's a new account.
    """
    # Check if a client already exists for this pubkey
    existing_client = await _get_client_by_pubkey(session, current_user_pubkey)
    
    if existing_client:
        # Generate a new API key and overwrite the old hash (old key is revoked)
        api_key = db.new_api_key()
        api_key_hash = db.hash_api_key(api_key)
        existing_client.api_key_hash = api_key_hash
        await session.commit()
        return {
            "api_key": api_key,
            "client_id": existing_client.id,
            "is_new_account": False,
            "free_credits_granted": 0,
            "node_ip": f"192.168.1.{secrets.randbelow(200)+20}",
            "message": "Generated a new API key. Old key is revoked."
        }
    else:
        # Create new client and give free credits
        api_key, client_info = await db.create_client(session)
        
        # Update with pubkey and 50 free credits
        stmt = select(Client).where(Client.id == client_info.id)
        res = await session.execute(stmt)
        new_client = res.scalar_one()
        
        new_client.pubkey = current_user_pubkey
        
        # Grant free trial credits (configurable via FREE_CREDITS env var, default 10)
        free_credits = int(os.environ.get("FREE_CREDITS", "10"))
        ph = f"trial_{secrets.token_hex(8)}"
        await db.add_topup(
            session,
            payment_hash=ph,
            invoice="trial_invoice",
            sats=0,
            credits=free_credits,
            client_id=new_client.id
        )
        await db.settle_topup_and_credit(
            session,
            payment_hash=ph,
            client_id=new_client.id
        )
        
        return {
            "api_key": api_key,
            "client_id": new_client.id,
            "is_new_account": True,
            "free_credits_granted": free_credits,
            "node_ip": f"192.168.1.{secrets.randbelow(200)+20}",
            "message": f"Welcome! {free_credits} free credits granted."
        }
