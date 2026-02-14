"""Authentication endpoints for Skyie Studio."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession

from db.base import get_session
from api.dependencies import get_current_user
from db.models import User
from services.auth_service import (
    AuthError,
    authenticate_user,
    create_access_token,
    create_refresh_token,
    decode_token,
    register_user,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


# ── Request / Response schemas ───────────────────────────────────────────────


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserProfileResponse(BaseModel):
    id: str
    email: str
    name: str
    avatar_url: str | None
    plan: str
    credits: int
    email_verified: bool
    is_admin: bool
    created_at: str


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/register", response_model=TokenResponse)
async def register(
    request: RegisterRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    """Register a new user account."""
    try:
        user = await register_user(session, request.email, request.password, request.name)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    access_token = create_access_token(str(user.id), user.email)
    refresh_token = create_refresh_token(str(user.id))

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user={
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "plan": user.plan,
            "credits": user.credits,
        },
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    """Authenticate with email and password."""
    try:
        user = await authenticate_user(session, request.email, request.password)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    access_token = create_access_token(str(user.id), user.email)
    refresh_token = create_refresh_token(str(user.id))

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user={
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "plan": user.plan,
            "credits": user.credits,
        },
    )


@router.post("/refresh", response_model=AccessTokenResponse)
async def refresh(request: RefreshRequest) -> AccessTokenResponse:
    """Get a new access token using a refresh token."""
    try:
        payload = decode_token(request.refresh_token)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    # Create new access token (email not stored in refresh token, use user_id only)
    access_token = create_access_token(user_id, "")

    return AccessTokenResponse(access_token=access_token)


@router.get("/me", response_model=UserProfileResponse)
async def get_me(user: User = Depends(get_current_user)) -> UserProfileResponse:
    """Get the current authenticated user's profile."""
    return UserProfileResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
        plan=user.plan,
        credits=user.credits,
        email_verified=user.email_verified,
        is_admin=user.is_admin,
        created_at=user.created_at.isoformat() if user.created_at else "",
    )
