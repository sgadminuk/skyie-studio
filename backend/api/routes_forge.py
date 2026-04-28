"""Forge platform routes — gated open-weights generation.

Every route under this router requires `require_forge_user`, which rejects
401/403 unless the caller has `forge_enabled=true` on their user row. This
is the API-side gate; Cloudflare Access on forge.skyie.studio is the
front-side gate. Either alone is sufficient; both together is defence in
depth.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from api.dependencies import require_forge_user
from db.models import User

router = APIRouter(prefix="/api/v1/forge", tags=["forge"])


@router.get("/status")
async def forge_status(user: User = Depends(require_forge_user)) -> dict:
    """Cheap readiness probe — the request itself proves the gate is live."""
    return {
        "enabled": True,
        "user_id": str(user.id),
        "email": user.email,
        "credits": user.credits,
    }
