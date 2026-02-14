"""API key management endpoints — create, list, and revoke API keys."""

import hashlib
import secrets
import uuid as uuid_mod

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.base import get_session
from db.models import ApiKey, User
from api.dependencies import get_current_user

router = APIRouter(prefix="/api/v1/api-keys", tags=["api-keys"])


# ── Request schemas ───────────────────────────────────────────────────────────


class CreateApiKeyRequest(BaseModel):
    name: str


# ── Helpers ───────────────────────────────────────────────────────────────────


def _hash_key(raw_key: str) -> str:
    """SHA-256 hash of a raw API key."""
    return hashlib.sha256(raw_key.encode()).hexdigest()


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/")
async def create_api_key(
    request: CreateApiKeyRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Generate a new API key. The full key is returned only once."""
    raw_key = secrets.token_urlsafe(32)
    key_prefix = raw_key[:8]
    key_hash = _hash_key(raw_key)

    api_key = ApiKey(
        user_id=user.id,
        name=request.name,
        key_hash=key_hash,
        key_prefix=key_prefix,
    )
    session.add(api_key)
    await session.commit()
    await session.refresh(api_key)

    return {
        "id": str(api_key.id),
        "name": api_key.name,
        "key": raw_key,
        "key_prefix": key_prefix,
        "created_at": api_key.created_at.isoformat() if api_key.created_at else None,
        "warning": "Store this key securely — it will not be shown again.",
    }


@router.get("/")
async def list_api_keys(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List all API keys for the current user (keys are masked)."""
    result = await session.execute(
        select(ApiKey)
        .where(ApiKey.user_id == user.id)
        .order_by(ApiKey.created_at.desc())
    )
    keys = result.scalars().all()

    return {
        "api_keys": [
            {
                "id": str(k.id),
                "name": k.name,
                "key_prefix": k.key_prefix,
                "is_active": k.is_active,
                "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
                "rate_limit_per_minute": k.rate_limit_per_minute,
                "created_at": k.created_at.isoformat() if k.created_at else None,
            }
            for k in keys
        ]
    }


@router.delete("/{key_id}")
async def revoke_api_key(
    key_id: uuid_mod.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Soft-delete an API key by setting is_active to False."""
    result = await session.execute(
        select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == user.id)
    )
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    if not api_key.is_active:
        return {"detail": "API key is already revoked"}

    api_key.is_active = False
    await session.commit()

    return {"detail": "API key revoked", "id": str(key_id)}
