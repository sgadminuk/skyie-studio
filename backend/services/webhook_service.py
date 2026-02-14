"""Webhook delivery service — notify external endpoints of job events."""

import hashlib
import hmac
import json
import logging
import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import WebhookEndpoint

logger = logging.getLogger(__name__)

WEBHOOK_TIMEOUT = 10.0  # seconds


def _sign_payload(payload: bytes, secret: str) -> str:
    """Generate HMAC-SHA256 signature for a webhook payload."""
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


async def send_webhook(
    session: AsyncSession,
    user_id: uuid.UUID,
    event_type: str,
    payload: dict,
) -> list[dict]:
    """Find active webhook endpoints for a user and deliver the event.

    Returns a list of delivery results (one per endpoint).
    Does not raise on errors — failures are logged.
    """
    result = await session.execute(
        select(WebhookEndpoint).where(
            WebhookEndpoint.user_id == user_id,
            WebhookEndpoint.is_active.is_(True),
        )
    )
    endpoints = result.scalars().all()

    if not endpoints:
        return []

    delivery_results = []
    body = json.dumps({"event": event_type, "data": payload}, default=str)
    body_bytes = body.encode()

    async with httpx.AsyncClient(timeout=WEBHOOK_TIMEOUT) as client:
        for endpoint in endpoints:
            # Check if this endpoint subscribes to the event type
            if endpoint.events and event_type not in endpoint.events:
                continue

            signature = _sign_payload(body_bytes, endpoint.secret)

            delivery = {
                "endpoint_id": str(endpoint.id),
                "url": endpoint.url,
                "event": event_type,
                "success": False,
                "status_code": None,
                "error": None,
            }

            try:
                response = await client.post(
                    endpoint.url,
                    content=body_bytes,
                    headers={
                        "Content-Type": "application/json",
                        "X-Webhook-Signature": signature,
                        "X-Webhook-Event": event_type,
                    },
                )
                delivery["status_code"] = response.status_code
                delivery["success"] = 200 <= response.status_code < 300

                if not delivery["success"]:
                    logger.warning(
                        "Webhook delivery to %s returned %d for event %s",
                        endpoint.url,
                        response.status_code,
                        event_type,
                    )
            except httpx.TimeoutException:
                delivery["error"] = "Timeout"
                logger.warning(
                    "Webhook delivery to %s timed out for event %s",
                    endpoint.url,
                    event_type,
                )
            except httpx.RequestError as exc:
                delivery["error"] = str(exc)
                logger.warning(
                    "Webhook delivery to %s failed for event %s: %s",
                    endpoint.url,
                    event_type,
                    exc,
                )

            delivery_results.append(delivery)

    logger.info(
        "Webhook delivery for user %s, event %s: %d/%d successful",
        user_id,
        event_type,
        sum(1 for d in delivery_results if d["success"]),
        len(delivery_results),
    )

    return delivery_results
