"""Brand profiles table.

Revision ID: 005
Revises: 004
Create Date: 2026-04-14
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "brand_profiles",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("tagline", sa.String(500), nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("website_url", sa.String(1024), nullable=True),
        sa.Column("logo_path", sa.String(1024), nullable=True),
        sa.Column("primary_color", sa.String(16), nullable=True),
        sa.Column("secondary_color", sa.String(16), nullable=True),
        sa.Column("accent_color", sa.String(16), nullable=True),
        sa.Column("fonts", postgresql.JSONB, nullable=True),
        sa.Column("tone_of_voice", sa.Text, nullable=True),
        sa.Column("target_audience", sa.Text, nullable=True),
        sa.Column("industry", sa.String(255), nullable=True),
        sa.Column("guidelines", sa.Text, nullable=True),
        sa.Column("extra", postgresql.JSONB, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_brand_profiles_user_id_created", "brand_profiles", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_brand_profiles_user_id_created", table_name="brand_profiles")
    op.drop_table("brand_profiles")
