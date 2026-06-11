import time
import os
from typing import Any
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, Column, Integer, String, Boolean, DateTime, Float, JSON, text
from .models import Base

# ---------------------------------------------------------------------------
# Alert & Auto-Topup models
# ---------------------------------------------------------------------------

class AlertConfig(Base):
    __tablename__ = "alert_configs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    client_id = Column(Integer, nullable=False, unique=True, index=True)
    
    # Balance thresholds
    balance_threshold_low = Column(Integer, nullable=True)  # Send alert below this
    balance_threshold_critical = Column(Integer, nullable=True)  # Critical alert
    
    # Notification channels
    notify_webhook_url = Column(String(500), nullable=True)
    notify_email = Column(String(200), nullable=True)
    
    # Auto-topup settings
    auto_topup_enabled = Column(Boolean, nullable=False, default=False)
    auto_topup_threshold = Column(Integer, nullable=True)  # Trigger below this
    auto_topup_plan_id = Column(String(50), nullable=True)  # Which plan to buy
    auto_topup_max_sats = Column(Integer, nullable=True)  # Safety cap
    
    # Usage alerts
    usage_alert_daily_limit = Column(Integer, nullable=True)  # Alert if daily usage exceeds
    usage_alert_enabled = Column(Boolean, nullable=False, default=False)
    
    created_at = Column(DateTime, server_default=text("CURRENT_TIMESTAMP"))
    updated_at = Column(DateTime, server_default=text("CURRENT_TIMESTAMP"))


class AlertConfigIn(BaseModel):
    balance_threshold_low: int | None = Field(default=None, ge=0, le=10_000_000)
    balance_threshold_critical: int | None = Field(default=None, ge=0, le=10_000_000)
    notify_webhook_url: str | None = Field(default=None, max_length=500)
    notify_email: str | None = Field(default=None, max_length=200)
    auto_topup_enabled: bool = False
    auto_topup_threshold: int | None = Field(default=None, ge=0, le=10_000_000)
    auto_topup_plan_id: str | None = Field(default=None, max_length=50)
    auto_topup_max_sats: int | None = Field(default=None, ge=0, le=10_000_000)
    usage_alert_daily_limit: int | None = Field(default=None, ge=0)
    usage_alert_enabled: bool = False


class AlertConfigOut(BaseModel):
    id: int
    client_id: int
    balance_threshold_low: int | None
    balance_threshold_critical: int | None
    notify_webhook_url: str | None
    notify_email: str | None
    auto_topup_enabled: bool
    auto_topup_threshold: int | None
    auto_topup_plan_id: str | None
    auto_topup_max_sats: int | None
    usage_alert_daily_limit: int | None
    usage_alert_enabled: bool


async def get_or_create_alert_config(session: AsyncSession, client_id: int) -> AlertConfig:
    stmt = select(AlertConfig).where(AlertConfig.client_id == client_id)
    result = await session.execute(stmt)
    config = result.scalar_one_or_none()
    if not config:
        config = AlertConfig(client_id=client_id)
        session.add(config)
        await session.commit()
        await session.refresh(config)
    return config


async def update_alert_config(session: AsyncSession, client_id: int, data: AlertConfigIn) -> AlertConfig:
    config = await get_or_create_alert_config(session, client_id)
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(config, key, value)
    await session.commit()
    await session.refresh(config)
    return config


async def check_and_dispatch_alerts(
    session: AsyncSession,
    client_id: int,
    current_balance: int,
    daily_usage: int = 0,
) -> list[str]:
    """Check alert conditions and dispatch notifications. Returns list of triggered alert types."""
    from .webhooks import dispatch_webhook_event
    
    config = await get_or_create_alert_config(session, client_id)
    triggered = []
    
    # Balance alerts
    if config.balance_threshold_critical is not None and current_balance <= config.balance_threshold_critical:
        triggered.append("balance.critical")
        await dispatch_webhook_event(session, client_id, "balance.low", {
            "balance": current_balance,
            "threshold": config.balance_threshold_critical,
            "severity": "critical",
        })
    elif config.balance_threshold_low is not None and current_balance <= config.balance_threshold_low:
        triggered.append("balance.low")
        await dispatch_webhook_event(session, client_id, "balance.low", {
            "balance": current_balance,
            "threshold": config.balance_threshold_low,
            "severity": "warning",
        })
    
    # Zero balance
    if current_balance == 0:
        triggered.append("balance.zero")
        await dispatch_webhook_event(session, client_id, "balance.zero", {
            "balance": 0,
        })
    
    # Usage alerts
    if config.usage_alert_enabled and config.usage_alert_daily_limit:
        if daily_usage >= config.usage_alert_daily_limit:
            triggered.append("usage.limit_exceeded")
            await dispatch_webhook_event(session, client_id, "usage.limit_exceeded", {
                "daily_usage": daily_usage,
                "limit": config.usage_alert_daily_limit,
            })
    
    return triggered
