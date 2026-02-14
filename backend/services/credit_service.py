"""Credit management service for Skyie Studio."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import CreditTransaction, User

# Credits required per workflow type
CREDIT_COSTS: dict[str, int] = {
    "talking_head": 10,
    "broll": 15,
    "full_production": 25,
}


def get_credit_cost(workflow: str, params: dict | None = None) -> int:
    """Calculate the credit cost for a given workflow.

    The base cost comes from CREDIT_COSTS. Additional params may adjust
    the price in the future (e.g. resolution, duration multipliers).
    """
    base = CREDIT_COSTS.get(workflow, 10)

    if params:
        # B-roll cost scales with scene count beyond the first
        if workflow == "broll":
            scenes = params.get("scenes", [])
            if len(scenes) > 1:
                base += (len(scenes) - 1) * 5

    return base


async def check_credits(session: AsyncSession, user_id: uuid.UUID, required: int) -> bool:
    """Return True if the user has at least `required` credits."""
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return False
    return user.credits >= required


async def reserve_credits(
    session: AsyncSession,
    user_id: uuid.UUID,
    amount: int,
    job_id: uuid.UUID | None = None,
) -> CreditTransaction:
    """Deduct credits from user balance and create a debit transaction.

    Raises ValueError if insufficient credits.
    """
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise ValueError("User not found")

    if user.credits < amount:
        raise ValueError(
            f"Insufficient credits: have {user.credits}, need {amount}"
        )

    user.credits -= amount

    txn = CreditTransaction(
        id=uuid.uuid4(),
        user_id=user_id,
        amount=-amount,
        balance_after=user.credits,
        type="debit",
        description=f"Job generation ({amount} credits)",
        job_id=job_id,
        created_at=datetime.now(timezone.utc),
    )
    session.add(txn)
    await session.commit()
    await session.refresh(txn)
    return txn


async def refund_credits(
    session: AsyncSession,
    user_id: uuid.UUID,
    amount: int,
    job_id: uuid.UUID | None = None,
) -> CreditTransaction:
    """Refund credits back to user balance on job failure."""
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise ValueError("User not found")

    user.credits += amount

    txn = CreditTransaction(
        id=uuid.uuid4(),
        user_id=user_id,
        amount=amount,
        balance_after=user.credits,
        type="refund",
        description=f"Refund for failed job ({amount} credits)",
        job_id=job_id,
        created_at=datetime.now(timezone.utc),
    )
    session.add(txn)
    await session.commit()
    await session.refresh(txn)
    return txn


async def grant_credits(
    session: AsyncSession,
    user_id: uuid.UUID,
    amount: int,
    type: str = "purchase",
    description: str = "Credit purchase",
    stripe_payment_intent_id: str | None = None,
) -> CreditTransaction:
    """Add credits to user balance (purchase, bonus, admin grant, etc.)."""
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise ValueError("User not found")

    user.credits += amount

    txn = CreditTransaction(
        id=uuid.uuid4(),
        user_id=user_id,
        amount=amount,
        balance_after=user.credits,
        type=type,
        description=description,
        stripe_payment_intent_id=stripe_payment_intent_id,
        created_at=datetime.now(timezone.utc),
    )
    session.add(txn)
    await session.commit()
    await session.refresh(txn)
    return txn
