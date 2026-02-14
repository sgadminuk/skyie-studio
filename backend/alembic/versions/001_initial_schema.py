"""Initial schema — users, jobs, assets, usage tables.

Revision ID: 001
Revises: None
Create Date: 2026-02-14
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("avatar_url", sa.String(512)),
        sa.Column("plan", sa.String(50), server_default="free"),
        sa.Column("credits", sa.Integer, server_default="50"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("workflow", sa.String(50), nullable=False, index=True),
        sa.Column("status", sa.String(20), server_default="queued", nullable=False, index=True),
        sa.Column("progress", sa.Integer, server_default="0"),
        sa.Column("step", sa.String(255), server_default="Queued"),
        sa.Column("params", postgresql.JSONB),
        sa.Column("output_path", sa.String(512)),
        sa.Column("error", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
    )

    op.create_table(
        "assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("asset_type", sa.String(50), nullable=False, index=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("path", sa.String(512), nullable=False),
        sa.Column("size_bytes", sa.Integer, server_default="0"),
        sa.Column("metadata", postgresql.JSONB),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
    )

    op.create_table(
        "usage",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), nullable=True, unique=True),
        sa.Column("credits_used", sa.Integer, server_default="0"),
        sa.Column("gpu_seconds", sa.Float, server_default="0.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"], ondelete="SET NULL"),
    )


def downgrade() -> None:
    op.drop_table("usage")
    op.drop_table("assets")
    op.drop_table("jobs")
    op.drop_table("users")
