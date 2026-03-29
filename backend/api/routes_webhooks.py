"""Webhook endpoints for external service callbacks."""

from __future__ import annotations

import hashlib
import hmac
import logging

from fastapi import APIRouter, HTTPException, Request

from config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


@router.post("/maielr")
async def maielr_webhook(request: Request):
    """Handle Maielr email delivery event webhooks.

    Events: email.delivered, email.bounced, email.opened, email.clicked
    """
    body = await request.body()

    # Verify webhook signature if secret is configured
    if settings.MAIELR_WEBHOOK_SECRET:
        signature = request.headers.get("x-maielr-signature", "")
        expected = hmac.new(
            settings.MAIELR_WEBHOOK_SECRET.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise HTTPException(status_code=401, detail="Invalid signature")

    payload = await request.json()
    event_type = payload.get("type", "unknown")
    email_id = payload.get("id", "")

    logger.info("Maielr webhook: %s (id=%s)", event_type, email_id)

    if event_type == "email.bounced":
        logger.warning(
            "Email bounced: id=%s to=%s",
            email_id, payload.get("to", ""),
        )

    return {"status": "ok"}
