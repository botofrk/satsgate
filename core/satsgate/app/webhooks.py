import os
import time
import json
import hashlib
import hmac
import asyncio
from typing import Any
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, Column, Integer, String, Boolean, DateTime, JSON, text
from .models import Base
import redis.asyncio as redis

# ---------------------------------------------------------------------------
# Webhook models and CRUD
# ---------------------------------------------------------------------------

class WebhookConfig(Base):
    __tablename__ = "webhooks"
    id = Column(Integer, primary_key=True, autoincrement=True)
    client_id = Column(Integer, nullable=False, index=True)
    url = Column(String(500), nullable=False)
    secret = Column(String(100), nullable=False)
    events = Column(JSON, nullable=False, default=list)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=text("CURRENT_TIMESTAMP"))


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"
    id = Column(Integer, primary_key=True, autoincrement=True)
    webhook_id = Column(Integer, nullable=False, index=True)
    event = Column(String(50), nullable=False)
    payload = Column(JSON, nullable=False)
    status_code = Column(Integer, nullable=True)
    success = Column(Boolean, nullable=False, default=False)
    error = Column(String(500), nullable=True)
    delivered_at = Column(DateTime, server_default=text("CURRENT_TIMESTAMP"))


# Pydantic schemas
class WebhookCreate(BaseModel):
    url: str = Field(..., min_length=5, max_length=500)
    events: list[str] = Field(..., min_length=1)


class WebhookOut(BaseModel):
    id: int
    url: str
    events: list[str]
    active: bool
    created_at: Any


# Available webhook events
WEBHOOK_EVENTS = [
    "payment.received",
    "payment.failed",
    "balance.low",
    "balance.zero",
    "topup.completed",
    "topup.failed",
    "client.created",
    "client.provisioned",
]


def _sign_payload(payload: dict, secret: str) -> str:
    """Create HMAC-SHA256 signature for webhook payload."""
    body = json.dumps(payload, sort_keys=True, default=str)
    return hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()


async def dispatch_webhook_event(
    session: AsyncSession,
    client_id: int,
    event: str,
    payload: dict,
) -> None:
    """Dispatch a webhook event to all active webhooks for a client."""
    from .rate_limit import redis_client
    
    # Get active webhooks for this client that subscribe to this event
    stmt = select(WebhookConfig).where(
        WebhookConfig.client_id == client_id,
        WebhookConfig.active == True,  # noqa: E712
    )
    result = await session.execute(stmt)
    webhooks = result.scalars().all()
    
    for wh in webhooks:
        if event not in (wh.events or []):
            continue
        
        # Queue delivery via Redis for async processing
        delivery = {
            "webhook_id": wh.id,
            "client_id": client_id,
            "event": event,
            "payload": payload,
            "url": wh.url,
            "secret": wh.secret,
            "attempts": 0,
            "created_at": time.time(),
        }
        await redis_client.lpush("webhook_queue", json.dumps(delivery))


async def process_webhook_queue():
    """Background worker that processes webhook deliveries."""
    from .rate_limit import redis_client
    import httpx
    
    while True:
        try:
            # Block-pop from queue with 5-second timeout
            result = await redis_client.brpop("webhook_queue", timeout=5)
            if not result:
                continue
            
            _, raw = result
            delivery = json.loads(raw)
            
            # Skip if too many attempts
            if delivery.get("attempts", 0) >= 3:
                continue
            
            payload = {
                "event": delivery["event"],
                "data": delivery["payload"],
                "timestamp": int(time.time()),
                "delivery_id": f"{delivery['webhook_id']}_{int(delivery.get('created_at', 0))}",
            }
            
            signature = _sign_payload(payload, delivery["secret"])
            headers = {
                "Content-Type": "application/json",
                "X-Satsgate-Signature": signature,
                "X-Satsgate-Event": delivery["event"],
                "User-Agent": "satsgate-webhook/1.0",
            }
            
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(delivery["url"], json=payload, headers=headers)
                    success = 200 <= resp.status_code < 300
                    error = None if success else f"HTTP {resp.status_code}"
            except Exception as e:
                success = False
                error = str(e)[:500]
            
            # Record delivery (fire-and-forget, don't block queue)
            delivery["attempts"] = delivery.get("attempts", 0) + 1
            if not success and delivery["attempts"] < 3:
                # Re-queue with exponential backoff
                delivery["created_at"] = time.time() + (30 * delivery["attempts"])
                await redis_client.lpush("webhook_queue", json.dumps(delivery))
            
        except asyncio.CancelledError:
            break
        except Exception:
            await asyncio.sleep(1)
