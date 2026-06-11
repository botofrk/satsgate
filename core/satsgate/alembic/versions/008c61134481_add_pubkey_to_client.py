"""Add pubkey to Client

Revision ID: 008c61134481
Revises: 1fe992244247
Create Date: 2026-06-10 00:20:55.324798

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '008c61134481'
down_revision: Union[str, Sequence[str], None] = '1fe992244247'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('clients', sa.Column('pubkey', sa.String(), nullable=True))
    op.create_unique_constraint('uq_clients_pubkey', 'clients', ['pubkey'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('uq_clients_pubkey', 'clients', type_='unique')
    op.drop_column('clients', 'pubkey')
