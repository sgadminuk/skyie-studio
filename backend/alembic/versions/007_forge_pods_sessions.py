"""Forge on-demand pods + per-user UI sessions.

Backs the Connect/Disconnect lifecycle in Forge: one shared GPU pod per
account (forge_pods), one session row per "connected" user (forge_sessions).
A pod is terminated by the reaper once its last session has ended and the
post-disconnect idle grace window has passed.

Revision ID: 007
Revises: 006
Create Date: 2026-04-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "forge_pods",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("runpod_pod_id", sa.String(64), nullable=False, unique=True),
        sa.Column("gpu_type_id", sa.String(128), nullable=True),
        sa.Column("datacenter", sa.String(64), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="provisioning"),
        sa.Column("registered_url", sa.String(512), nullable=True),
        sa.Column("cost_per_hr", sa.Float, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("ready_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_job_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("terminated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_forge_pods_status", "forge_pods", ["status"])
    op.create_index("ix_forge_pods_created_at", "forge_pods", ["created_at"])
    op.create_index("ix_forge_pods_runpod_pod_id", "forge_pods", ["runpod_pod_id"], unique=True)

    op.create_table(
        "forge_sessions",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "pod_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("forge_pods.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_reason", sa.String(64), nullable=True),
    )
    op.create_index("ix_forge_sessions_user_id", "forge_sessions", ["user_id"])
    op.create_index("ix_forge_sessions_pod_id", "forge_sessions", ["pod_id"])
    op.create_index("ix_forge_sessions_status", "forge_sessions", ["status"])


def downgrade() -> None:
    op.drop_index("ix_forge_sessions_status", table_name="forge_sessions")
    op.drop_index("ix_forge_sessions_pod_id", table_name="forge_sessions")
    op.drop_index("ix_forge_sessions_user_id", table_name="forge_sessions")
    op.drop_table("forge_sessions")
    op.drop_index("ix_forge_pods_runpod_pod_id", table_name="forge_pods")
    op.drop_index("ix_forge_pods_created_at", table_name="forge_pods")
    op.drop_index("ix_forge_pods_status", table_name="forge_pods")
    op.drop_table("forge_pods")
