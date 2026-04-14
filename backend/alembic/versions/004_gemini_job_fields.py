"""Gemini provider fields on jobs.

Adds provider, model, error_code, cost_usd, idempotency_key to jobs.

Revision ID: 004
Revises: 003
Create Date: 2026-04-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("jobs", sa.Column("provider", sa.String(30), nullable=False, server_default="gpu"))
    op.add_column("jobs", sa.Column("model", sa.String(100), nullable=True))
    op.add_column("jobs", sa.Column("error_code", sa.String(50), nullable=True))
    op.add_column("jobs", sa.Column("cost_usd", sa.Float, nullable=True))
    op.add_column("jobs", sa.Column("idempotency_key", sa.String(128), nullable=True))
    op.create_index("ix_jobs_provider", "jobs", ["provider"])
    op.create_index("ix_jobs_idempotency_key", "jobs", ["idempotency_key"])


def downgrade() -> None:
    op.drop_index("ix_jobs_idempotency_key", table_name="jobs")
    op.drop_index("ix_jobs_provider", table_name="jobs")
    op.drop_column("jobs", "idempotency_key")
    op.drop_column("jobs", "cost_usd")
    op.drop_column("jobs", "error_code")
    op.drop_column("jobs", "model")
    op.drop_column("jobs", "provider")
