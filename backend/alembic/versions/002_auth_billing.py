"""Auth, billing, credits — add auth columns, subscriptions, credit tables.

Revision ID: 002
Revises: 001
Create Date: 2026-02-14
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Add auth / billing columns to users table ────────────────────────
    op.add_column("users", sa.Column("password_hash", sa.String(255), nullable=True))
    op.add_column(
        "users",
        sa.Column("email_verified", sa.Boolean, server_default=sa.text("false"), nullable=False),
    )
    op.add_column("users", sa.Column("verification_token", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("reset_token", sa.String(255), nullable=True))
    op.add_column(
        "users", sa.Column("reset_token_expires", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "users",
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true"), nullable=False),
    )
    op.add_column(
        "users",
        sa.Column("is_admin", sa.Boolean, server_default=sa.text("false"), nullable=False),
    )
    op.add_column("users", sa.Column("stripe_customer_id", sa.String(255), nullable=True))
    op.create_unique_constraint("uq_users_stripe_customer_id", "users", ["stripe_customer_id"])

    # ── Subscriptions table ──────────────────────────────────────────────
    op.create_table(
        "subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("stripe_subscription_id", sa.String(255), unique=True),
        sa.Column("plan", sa.String(50), nullable=False),
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("current_period_start", sa.DateTime(timezone=True)),
        sa.Column("current_period_end", sa.DateTime(timezone=True)),
        sa.Column("cancel_at_period_end", sa.Boolean, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )

    # ── Credit transactions table ────────────────────────────────────────
    op.create_table(
        "credit_transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("amount", sa.Integer, nullable=False),
        sa.Column("balance_after", sa.Integer, nullable=False),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("description", sa.String(500)),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("stripe_payment_intent_id", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            index=True,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"], ondelete="SET NULL"),
    )

    # ── Credit packages table ────────────────────────────────────────────
    op.create_table(
        "credit_packages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("credits", sa.Integer, nullable=False),
        sa.Column("price_cents", sa.Integer, nullable=False),
        sa.Column("stripe_price_id", sa.String(255), nullable=True),
        sa.Column(
            "is_active", sa.Boolean, server_default=sa.text("true"), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── Seed default credit packages ─────────────────────────────────────
    import uuid

    op.execute(
        sa.text(
            "INSERT INTO credit_packages (id, name, credits, price_cents) VALUES "
            "(:id1, 'Starter Pack', 100, 1000), "
            "(:id2, 'Creator Pack', 500, 4000), "
            "(:id3, 'Pro Pack', 1000, 7000)"
        ).bindparams(
            id1=str(uuid.uuid4()),
            id2=str(uuid.uuid4()),
            id3=str(uuid.uuid4()),
        )
    )


def downgrade() -> None:
    op.drop_table("credit_packages")
    op.drop_table("credit_transactions")
    op.drop_table("subscriptions")

    op.drop_constraint("uq_users_stripe_customer_id", "users", type_="unique")
    op.drop_column("users", "stripe_customer_id")
    op.drop_column("users", "is_admin")
    op.drop_column("users", "is_active")
    op.drop_column("users", "reset_token_expires")
    op.drop_column("users", "reset_token")
    op.drop_column("users", "verification_token")
    op.drop_column("users", "email_verified")
    op.drop_column("users", "password_hash")
