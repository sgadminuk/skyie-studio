"""Add users.forge_enabled flag for the gated Forge platform.

When false, the user can use Studio (Gemini-backed, filtered). When true,
they get access to Forge — self-hosted open-weights generation with no
provider-side filter. Set to false by default; flipped by the (future)
age-verification flow once that ships.

Revision ID: 006
Revises: 005
Create Date: 2026-04-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "forge_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "forge_enabled")
