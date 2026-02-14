"""FastAPI dependency injection for authentication."""

from __future__ import annotations

import uuid

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.base import get_session
from db.models import User
from services.auth_service import AuthError, decode_token


async def get_current_user(
    authorization: str = Header(..., description="Bearer <token>"),
    session: AsyncSession = Depends(get_session),
) -> User:
    """Extract and validate the JWT from the Authorization header.

    Returns the authenticated User or raises 401.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header format")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")

    try:
        payload = decode_token(token)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid user ID in token")

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    return user


async def get_current_user_optional(
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> User | None:
    """Same as get_current_user but returns None when no token is provided."""
    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        return None

    try:
        payload = decode_token(token)
    except AuthError:
        return None

    if payload.get("type") != "access":
        return None

    user_id_str = payload.get("sub")
    if not user_id_str:
        return None

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        return None

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user and not user.is_active:
        return None

    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency that requires the current user to be an admin."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
