"""Stripe integration service for Skyie Studio."""

import logging

import stripe

from config import settings

logger = logging.getLogger(__name__)

# Configure Stripe API key (gracefully handle missing key in dev)
_stripe_key = getattr(settings, "STRIPE_SECRET_KEY", "")
if _stripe_key:
    stripe.api_key = _stripe_key

# ── Plan configuration ───────────────────────────────────────────────────────

PLAN_CONFIG: dict[str, dict] = {
    "free": {
        "name": "Free",
        "monthly_credits": 50,
        "price_cents": 0,
        "stripe_price_id": None,
        "features": ["50 credits/month", "720p export", "Community support"],
    },
    "starter": {
        "name": "Starter",
        "monthly_credits": 200,
        "price_cents": 1500,
        "stripe_price_id": None,
        "features": ["200 credits/month", "1080p export", "Email support"],
    },
    "pro": {
        "name": "Pro",
        "monthly_credits": 500,
        "price_cents": 3900,
        "stripe_price_id": None,
        "features": [
            "500 credits/month",
            "4K export",
            "Priority support",
            "Custom avatars",
        ],
    },
    "business": {
        "name": "Business",
        "monthly_credits": 2000,
        "price_cents": 9900,
        "stripe_price_id": None,
        "features": [
            "2000 credits/month",
            "4K export",
            "Dedicated support",
            "Custom branding",
            "API access",
        ],
    },
}


def create_checkout_session(
    user_id: str,
    user_email: str,
    package_credits: int,
    price_cents: int,
    success_url: str,
    cancel_url: str,
) -> stripe.checkout.Session:
    """Create a Stripe Checkout Session for a one-time credit purchase."""
    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[
            {
                "price_data": {
                    "currency": "usd",
                    "product_data": {
                        "name": f"{package_credits} Skyie Studio Credits",
                        "description": f"One-time purchase of {package_credits} video generation credits",
                    },
                    "unit_amount": price_cents,
                },
                "quantity": 1,
            }
        ],
        mode="payment",
        success_url=success_url,
        cancel_url=cancel_url,
        customer_email=user_email,
        metadata={
            "user_id": user_id,
            "credits": str(package_credits),
            "type": "credit_purchase",
        },
    )
    return session


def create_subscription_checkout(
    user_id: str,
    user_email: str,
    stripe_price_id: str,
    plan: str,
    success_url: str,
    cancel_url: str,
) -> stripe.checkout.Session:
    """Create a Stripe Checkout Session for a recurring subscription."""
    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[
            {
                "price": stripe_price_id,
                "quantity": 1,
            }
        ],
        mode="subscription",
        success_url=success_url,
        cancel_url=cancel_url,
        customer_email=user_email,
        metadata={
            "user_id": user_id,
            "plan": plan,
            "type": "subscription",
        },
    )
    return session


def construct_webhook_event(
    payload: bytes,
    sig_header: str,
) -> stripe.Event:
    """Verify and construct a Stripe webhook event from the raw payload.

    Raises stripe.error.SignatureVerificationError on invalid signature.
    """
    webhook_secret = getattr(settings, "STRIPE_WEBHOOK_SECRET", "")
    event = stripe.Webhook.construct_event(
        payload,
        sig_header,
        webhook_secret,
    )
    return event
