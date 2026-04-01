"""Authentication endpoints for Skyie Studio."""

from __future__ import annotations

import uuid as uuid_mod
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.base import get_session
from api.dependencies import get_current_user
from db.models import User
from services.auth_service import (
    AuthError,
    authenticate_user,
    create_access_token,
    create_refresh_token,
    create_session,
    decode_token,
    register_user,
    revoke_session,
)
from services.otp_service import generate_otp, verify_otp, send_otp_email

logger = logging.getLogger(__name__)

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


class LogoutRequest(BaseModel):
    refresh_token: str = ""


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
        user = await register_user(
            session, request.email, request.password, request.name,
        )
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    sid = create_session(str(user.id))
    access_token = create_access_token(str(user.id), user.email, sid)
    refresh_token = create_refresh_token(str(user.id), sid)

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
        user = await authenticate_user(
            session, request.email, request.password,
        )
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    sid = create_session(str(user.id))
    access_token = create_access_token(str(user.id), user.email, sid)
    refresh_token = create_refresh_token(str(user.id), sid)

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
    session_id = payload.get("sid", "")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    access_token = create_access_token(user_id, "", session_id)
    return AccessTokenResponse(access_token=access_token)


@router.post("/logout")
async def logout(body: LogoutRequest):
    """Revoke the current session (server-side logout)."""
    if body.refresh_token:
        try:
            payload = decode_token(body.refresh_token)
            session_id = payload.get("sid", "")
            if session_id:
                revoke_session(session_id)
        except AuthError:
            pass  # Token already expired/invalid — still "logged out"
    return {"status": "ok"}


@router.get("/me", response_model=UserProfileResponse)
async def get_me(
    user: User = Depends(get_current_user),
) -> UserProfileResponse:
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


# ── Email OTP Authentication ───────────────────────────────────────────────


class OTPRequestBody(BaseModel):
    email: EmailStr


class OTPVerifyBody(BaseModel):
    email: EmailStr
    code: str


@router.post("/otp/request")
async def request_otp(body: OTPRequestBody):
    """Send a one-time login code to the owner email."""
    try:
        code = generate_otp(body.email)
        sent = send_otp_email(body.email, code)
        if not sent:
            raise HTTPException(
                status_code=500, detail="Failed to send email",
            )
        return {"status": "sent", "message": "Login code sent to your email"}
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=str(exc))


@router.post("/otp/verify", response_model=TokenResponse)
async def verify_otp_endpoint(
    body: OTPVerifyBody,
    session: AsyncSession = Depends(get_session),
):
    """Verify the OTP code and return auth tokens."""
    try:
        verify_otp(body.email, body.code)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    # Find or create the owner user
    result = await session.execute(
        select(User).where(User.email == body.email.lower()),
    )
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            id=uuid_mod.uuid4(),
            email=body.email.lower(),
            name=settings.OWNER_NAME,
            password_hash=None,
            email_verified=True,
            is_active=True,
            is_admin=True,
            credits=999999,
            plan="owner",
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        logger.info("Owner account created: %s", body.email)

    sid = create_session(str(user.id))
    access_token = create_access_token(str(user.id), user.email, sid)
    refresh_token = create_refresh_token(str(user.id), sid)

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
