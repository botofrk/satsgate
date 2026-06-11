"""Alert configuration API endpoints."""
from fastapi import APIRouter, Depends, Header
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from .database import get_db
from .alerts import AlertConfigIn, get_or_create_alert_config, update_alert_config
from . import db

router = APIRouter(prefix="/v1/alerts", tags=["alerts"])


async def _get_client(session: AsyncSession, x_api_key: str | None):
    if not x_api_key:
        return None
    return await db.get_client_by_api_key(session, x_api_key)


@router.get("")
async def get_alert_config(
    x_api_key: str | None = Header(default=None, alias="X-Api-Key"),
    session: AsyncSession = Depends(get_db),
):
    client = await _get_client(session, x_api_key)
    if not client:
        return JSONResponse(status_code=401, content={"ok": False, "error": "invalid_api_key"})

    config = await get_or_create_alert_config(session, client.id)

    return {
        "ok": True,
        "config": {
            "id": config.id,
            "client_id": config.client_id,
            "balance_threshold_low": config.balance_threshold_low,
            "balance_threshold_critical": config.balance_threshold_critical,
            "notify_webhook_url": config.notify_webhook_url,
            "notify_email": config.notify_email,
            "auto_topup_enabled": config.auto_topup_enabled,
            "auto_topup_threshold": config.auto_topup_threshold,
            "auto_topup_plan_id": config.auto_topup_plan_id,
            "auto_topup_max_sats": config.auto_topup_max_sats,
            "usage_alert_daily_limit": config.usage_alert_daily_limit,
            "usage_alert_enabled": config.usage_alert_enabled,
        },
    }


@router.post("")
async def update_alert_config_endpoint(
    body: AlertConfigIn,
    x_api_key: str | None = Header(default=None, alias="X-Api-Key"),
    session: AsyncSession = Depends(get_db),
):
    client = await _get_client(session, x_api_key)
    if not client:
        return JSONResponse(status_code=401, content={"ok": False, "error": "invalid_api_key"})

    config = await update_alert_config(session, client.id, body)

    return {
        "ok": True,
        "config": {
            "id": config.id,
            "client_id": config.client_id,
            "balance_threshold_low": config.balance_threshold_low,
            "balance_threshold_critical": config.balance_threshold_critical,
            "notify_webhook_url": config.notify_webhook_url,
            "notify_email": config.notify_email,
            "auto_topup_enabled": config.auto_topup_enabled,
            "auto_topup_threshold": config.auto_topup_threshold,
            "auto_topup_plan_id": config.auto_topup_plan_id,
            "auto_topup_max_sats": config.auto_topup_max_sats,
            "usage_alert_daily_limit": config.usage_alert_daily_limit,
            "usage_alert_enabled": config.usage_alert_enabled,
        },
        "message": "Alert settings updated",
    }
