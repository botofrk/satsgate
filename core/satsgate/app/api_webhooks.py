"""Webhook CRUD API endpoints."""
import secrets
from fastapi import APIRouter, Depends, Header
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import json

from .database import get_db
from .webhooks import WebhookConfig, WebhookDelivery, WEBHOOK_EVENTS
from . import db

router = APIRouter(prefix="/v1/webhooks", tags=["webhooks"])


async def _get_client(session: AsyncSession, x_api_key: str | None):
    if not x_api_key:
        return None
    return await db.get_client_by_api_key(session, x_api_key)


@router.get("")
async def list_webhooks(
    x_api_key: str | None = Header(default=None, alias="X-Api-Key"),
    session: AsyncSession = Depends(get_db),
):
    client = await _get_client(session, x_api_key)
    if not client:
        return JSONResponse(status_code=401, content={"ok": False, "error": "invalid_api_key"})

    stmt = select(WebhookConfig).where(WebhookConfig.client_id == client.id)
    result = await session.execute(stmt)
    webhooks = result.scalars().all()

    return {
        "ok": True,
        "webhooks": [
            {
                "id": wh.id,
                "url": wh.url,
                "events": wh.events or [],
                "active": wh.active,
                "created_at": str(wh.created_at) if wh.created_at else None,
            }
            for wh in webhooks
        ],
        "available_events": WEBHOOK_EVENTS,
    }


@router.post("")
async def create_webhook(
    body: dict,
    x_api_key: str | None = Header(default=None, alias="X-Api-Key"),
    session: AsyncSession = Depends(get_db),
):
    client = await _get_client(session, x_api_key)
    if not client:
        return JSONResponse(status_code=401, content={"ok": False, "error": "invalid_api_key"})

    url = body.get("url", "").strip()
    events = body.get("events", [])

    if not url:
        return JSONResponse(status_code=400, content={"ok": False, "error": "url_required"})
    if not events:
        return JSONResponse(status_code=400, content={"ok": False, "error": "events_required"})

    # Validate events
    invalid = [e for e in events if e not in WEBHOOK_EVENTS]
    if invalid:
        return JSONResponse(status_code=400, content={"ok": False, "error": f"invalid_events: {invalid}"})

    # Generate secret
    secret = f"whsec_{secrets.token_hex(32)}"

    wh = WebhookConfig(
        client_id=client.id,
        url=url,
        secret=secret,
        events=events,
        active=True,
    )
    session.add(wh)
    await session.commit()
    await session.refresh(wh)

    return {
        "ok": True,
        "webhook_id": wh.id,
        "secret": secret,
        "url": wh.url,
        "events": wh.events,
        "note": "Save this secret. It is used to verify webhook signatures and cannot be retrieved again.",
    }


@router.delete("/{webhook_id}")
async def delete_webhook(
    webhook_id: int,
    x_api_key: str | None = Header(default=None, alias="X-Api-Key"),
    session: AsyncSession = Depends(get_db),
):
    client = await _get_client(session, x_api_key)
    if not client:
        return JSONResponse(status_code=401, content={"ok": False, "error": "invalid_api_key"})

    stmt = select(WebhookConfig).where(
        WebhookConfig.id == webhook_id,
        WebhookConfig.client_id == client.id,
    )
    result = await session.execute(stmt)
    wh = result.scalar_one_or_none()

    if not wh:
        return JSONResponse(status_code=404, content={"ok": False, "error": "webhook_not_found"})

    await session.delete(wh)
    await session.commit()

    return {"ok": True, "message": "Webhook deleted"}
