"""Billing and credit management endpoints for Skyie Studio."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from db.base import get_session
from db.models import CreditPackage, CreditTransaction, User
from api.dependencies import get_current_user
from services.credit_service import CREDIT_COSTS, grant_credits
from services.stripe_service import (
    PLAN_CONFIG,
    construct_webhook_event,
    create_checkout_session,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])


# ── Request / Response schemas ───────────────────────────────────────────────


class PurchaseRequest(BaseModel):
    package_id: str
    success_url: str = "https://skyie.studio/billing/success"
    cancel_url: str = "https://skyie.studio/billing/cancel"


class CheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str


class CreditTransactionResponse(BaseModel):
    id: str
    amount: int
    balance_after: int
    type: str
    description: str | None
    job_id: str | None
    created_at: str


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/plans")
async def list_plans() -> dict:
    """List available subscription plans."""
    return {"plans": PLAN_CONFIG}


@router.get("/packages")
async def list_packages(
    session: AsyncSession = Depends(get_session),
) -> dict:
    """List available credit packages from the database."""
    result = await session.execute(
        select(CreditPackage).where(CreditPackage.is_active.is_(True))
    )
    packages = result.scalars().all()
    return {
        "packages": [
            {
                "id": str(pkg.id),
                "name": pkg.name,
                "credits": pkg.credits,
                "price_cents": pkg.price_cents,
                "stripe_price_id": pkg.stripe_price_id,
            }
            for pkg in packages
        ]
    }


@router.get("/credit-costs")
async def get_credit_costs() -> dict:
    """Return the credit cost for each workflow type."""
    return {"costs": CREDIT_COSTS}


@router.get("/history")
async def get_credit_history(
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Get credit transaction history for the authenticated user."""
    result = await session.execute(
        select(CreditTransaction)
        .where(CreditTransaction.user_id == user.id)
        .order_by(desc(CreditTransaction.created_at))
        .offset(offset)
        .limit(limit)
    )
    transactions = result.scalars().all()
    return {
        "transactions": [
            CreditTransactionResponse(
                id=str(txn.id),
                amount=txn.amount,
                balance_after=txn.balance_after,
                type=txn.type,
                description=txn.description,
                job_id=str(txn.job_id) if txn.job_id else None,
                created_at=txn.created_at.isoformat() if txn.created_at else "",
            ).model_dump()
            for txn in transactions
        ],
        "credits": user.credits,
    }


@router.post("/purchase", response_model=CheckoutResponse)
async def purchase_credits(
    request: PurchaseRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> CheckoutResponse:
    """Create a Stripe Checkout Session for purchasing a credit package."""
    # Look up the package
    try:
        package_uuid = uuid.UUID(request.package_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid package ID")

    result = await session.execute(
        select(CreditPackage).where(
            CreditPackage.id == package_uuid,
            CreditPackage.is_active.is_(True),
        )
    )
    package = result.scalar_one_or_none()
    if not package:
        raise HTTPException(status_code=404, detail="Credit package not found")

    try:
        checkout = create_checkout_session(
            user_id=str(user.id),
            user_email=user.email,
            package_credits=package.credits,
            price_cents=package.price_cents,
            success_url=request.success_url,
            cancel_url=request.cancel_url,
        )
    except Exception as exc:
        logger.exception("Failed to create Stripe checkout session")
        raise HTTPException(status_code=502, detail=f"Stripe error: {exc}")

    return CheckoutResponse(
        checkout_url=checkout.url,
        session_id=checkout.id,
    )


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Handle incoming Stripe webhook events.

    This endpoint does NOT require authentication — Stripe signs the
    payload, and we verify the signature.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = construct_webhook_event(payload, sig_header)
    except Exception as exc:
        logger.warning(f"Stripe webhook signature verification failed: {exc}")
        raise HTTPException(status_code=400, detail="Invalid signature")

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        await _handle_checkout_completed(session, data)
    elif event_type == "invoice.payment_succeeded":
        logger.info(f"Invoice payment succeeded: {data.get('id')}")
    elif event_type == "customer.subscription.deleted":
        logger.info(f"Subscription cancelled: {data.get('id')}")

    return {"status": "ok"}


# ── Webhook helpers ──────────────────────────────────────────────────────────


async def _handle_checkout_completed(session: AsyncSession, data: dict) -> None:
    """Process a completed checkout session — grant credits to the user."""
    metadata = data.get("metadata", {})
    purchase_type = metadata.get("type")

    if purchase_type != "credit_purchase":
        logger.info(f"Ignoring checkout type: {purchase_type}")
        return

    user_id_str = metadata.get("user_id")
    credits_str = metadata.get("credits")
    payment_intent = data.get("payment_intent")

    if not user_id_str or not credits_str:
        logger.error("Missing user_id or credits in checkout metadata")
        return

    try:
        user_id = uuid.UUID(user_id_str)
        credits_amount = int(credits_str)
    except (ValueError, TypeError) as exc:
        logger.error(f"Invalid metadata values: {exc}")
        return

    await grant_credits(
        session=session,
        user_id=user_id,
        amount=credits_amount,
        type="purchase",
        description=f"Purchased {credits_amount} credits via Stripe",
        stripe_payment_intent_id=payment_intent,
    )
    logger.info(f"Granted {credits_amount} credits to user {user_id}")
