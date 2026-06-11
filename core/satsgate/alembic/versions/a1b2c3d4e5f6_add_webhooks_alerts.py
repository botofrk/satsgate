"""Add webhooks, webhook_deliveries, and alert_configs tables.

Revision ID: a1b2c3d4e5f6
Revises: 008c61134481
Create Date: 2026-06-10
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '008c61134481'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'webhooks',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('client_id', sa.Integer(), nullable=False, index=True),
        sa.Column('url', sa.String(500), nullable=False),
        sa.Column('secret', sa.String(100), nullable=False),
        sa.Column('events', sa.JSON(), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()')),
    )

    op.create_table(
        'webhook_deliveries',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('webhook_id', sa.Integer(), nullable=False, index=True),
        sa.Column('event', sa.String(50), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=False),
        sa.Column('status_code', sa.Integer(), nullable=True),
        sa.Column('success', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('error', sa.String(500), nullable=True),
        sa.Column('delivered_at', sa.DateTime(), server_default=sa.text('now()')),
    )

    op.create_table(
        'alert_configs',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('client_id', sa.Integer(), nullable=False, unique=True, index=True),
        sa.Column('balance_threshold_low', sa.Integer(), nullable=True),
        sa.Column('balance_threshold_critical', sa.Integer(), nullable=True),
        sa.Column('notify_webhook_url', sa.String(500), nullable=True),
        sa.Column('notify_email', sa.String(200), nullable=True),
        sa.Column('auto_topup_enabled', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('auto_topup_threshold', sa.Integer(), nullable=True),
        sa.Column('auto_topup_plan_id', sa.String(50), nullable=True),
        sa.Column('auto_topup_max_sats', sa.Integer(), nullable=True),
        sa.Column('usage_alert_daily_limit', sa.Integer(), nullable=True),
        sa.Column('usage_alert_enabled', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()')),
    )


def downgrade() -> None:
    op.drop_table('alert_configs')
    op.drop_table('webhook_deliveries')
    op.drop_table('webhooks')
