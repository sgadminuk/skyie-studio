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
    "shots": 20,
    "v2v": 15,
    "extend": 10,
    "director": 30,
    # Gemini (Nano Banana) image — flat per call, quality-first
    "gemini_image": 8,
    "gemini_image_edit": 10,
    # Gemini (Veo 3.1) video — computed below from duration/resolution/audio
    "gemini_video": 0,
    # Veo 3.1 multi-shot — computed below as the sum of per-shot Veo costs
    "veo_multi_shot": 0,
    # Avatar pack — computed below as count × gemini_image base
    "avatar_pack": 0,
}

# ── Veo 3.1 per-second credit rates ─────────────────────────────────────────
# Tuned so 1 credit ≈ $0.01 USD of Google spend. Adjust together with
# gemini_service.VEO_3_1_PRICE_PER_SEC_* if Google revises pricing.
VEO_CREDITS_PER_SEC_AUDIO_720P = 40   # $0.40/sec @ 1× → 40 credits
VEO_CREDITS_PER_SEC_SILENT_720P = 20  # $0.20/sec @ 1× → 20 credits
VEO_RESOLUTION_MULT: dict[str, float] = {
    "720p": 1.0,
    "1080p": 1.5,
}


def _gemini_video_credits(params: dict) -> int:
    duration = float(params.get("duration_sec") or 8)
    resolution = str(params.get("resolution") or "1080p").lower()
    # Veo 3.1 always renders synchronized audio (API doesn't accept a mute
    # flag), so audio cost always applies regardless of the UI toggle.
    base_per_sec = VEO_CREDITS_PER_SEC_AUDIO_720P
    mult = VEO_RESOLUTION_MULT.get(resolution, 1.5)
    # Always round up — never under-charge.
    import math
    return int(math.ceil(duration * base_per_sec * mult))


def _avatar_pack_credits(params: dict) -> int:
    """Avatar pack cost: count × gemini_image base. Uses the existing single-image
    flat rate so the pack price is predictable from the count alone.
    """
    count = int(params.get("count") or 30)
    return CREDIT_COSTS["gemini_image"] * count


def _veo_multi_shot_credits(params: dict) -> int:
    """Sum per-shot Veo costs at the parent's resolution.

    Each shot inherits the parent aspect_ratio/resolution but carries its own
    duration_sec. We pre-resolve the per-shot params and reuse the single-shot
    cost function so the math stays in one place.
    """
    shots = params.get("shots") or []
    resolution = params.get("resolution") or "1080p"
    return sum(
        _gemini_video_credits({
            "duration_sec": shot.get("duration_sec") or 8,
            "resolution": resolution,
        })
        for shot in shots
    )


def get_credit_cost(workflow: str, params: dict | None = None) -> int:
    """Calculate the credit cost for a given workflow.

    The base cost comes from CREDIT_COSTS. Gemini video is computed from
    duration × resolution × audio so users pay for exactly what Veo renders.
    """
    base = CREDIT_COSTS.get(workflow, 10)

    if params:
        if workflow == "broll":
            scenes = params.get("scenes", [])
            if len(scenes) > 1:
                base += (len(scenes) - 1) * 5
        elif workflow == "gemini_video":
            return _gemini_video_credits(params)
        elif workflow == "veo_multi_shot":
            return _veo_multi_shot_credits(params)
        elif workflow == "avatar_pack":
            return _avatar_pack_credits(params)
        elif workflow == "gemini_image":
            refs = params.get("reference_image_paths") or []
            # Multi-image composition costs more tokens on Nano Banana
            if len(refs) > 1:
                base += (len(refs) - 1) * 2

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
    description: str = "Job generation",
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
        description=f"{description} ({amount} credits)",
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
