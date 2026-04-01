"""JWT authentication service with server-side session enforcement.

Sessions are tracked in Redis. Every access/refresh token contains a
session_id that must exist in Redis — revoking the session immediately
invalidates all tokens. Only one active session per user.
"""

import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.models import User

SESSION_PREFIX = "skyie:session:"
SESSION_TTL = 86400  # 24 hours — must re-authenticate via OTP daily


class AuthError(Exception):
    """Authentication / authorization error."""

    def __init__(self, message: str, status_code: int = 401):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


# ── Password helpers ─────────────────────────────────────────────────────────


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


# ── Session management (Redis-backed) ───────────────────────────────────────


def _redis():
    from services.job_queue import redis_client
    return redis_client


def create_session(user_id: str) -> str:
    """Create a new server-side session. Revokes any previous session."""
    r = _redis()

    # Revoke previous session for this user (single-session enforcement)
    old_session_id = r.get(f"{SESSION_PREFIX}user:{user_id}")
    if old_session_id:
        r.delete(f"{SESSION_PREFIX}{old_session_id}")

    session_id = uuid.uuid4().hex
    r.set(f"{SESSION_PREFIX}{session_id}", user_id, ex=SESSION_TTL)
    r.set(f"{SESSION_PREFIX}user:{user_id}", session_id, ex=SESSION_TTL)
    return session_id


def validate_session(session_id: str) -> str | None:
    """Check if a session is still valid. Returns user_id or None."""
    if not session_id:
        return None
    return _redis().get(f"{SESSION_PREFIX}{session_id}")


def revoke_session(session_id: str) -> None:
    """Revoke a session (logout)."""
    r = _redis()
    user_id = r.get(f"{SESSION_PREFIX}{session_id}")
    if user_id:
        r.delete(f"{SESSION_PREFIX}user:{user_id}")
    r.delete(f"{SESSION_PREFIX}{session_id}")


def revoke_all_sessions(user_id: str) -> None:
    """Revoke all sessions for a user."""
    r = _redis()
    session_id = r.get(f"{SESSION_PREFIX}user:{user_id}")
    if session_id:
        r.delete(f"{SESSION_PREFIX}{session_id}")
    r.delete(f"{SESSION_PREFIX}user:{user_id}")


# ── JWT helpers ──────────────────────────────────────────────────────────────


def create_access_token(user_id: str, email: str, session_id: str) -> str:
    """Create a short-lived access token (30 min default)."""
    expire_minutes = getattr(settings, "JWT_ACCESS_TOKEN_EXPIRE_MINUTES", 30)
    payload = {
        "sub": user_id,
        "email": email,
        "sid": session_id,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=expire_minutes),
        "iat": datetime.now(timezone.utc),
    }
    algorithm = getattr(settings, "JWT_ALGORITHM", "HS256")
    secret = getattr(settings, "JWT_SECRET_KEY", "skyie-dev-secret-change-me")
    return jwt.encode(payload, secret, algorithm=algorithm)


def create_refresh_token(user_id: str, session_id: str) -> str:
    """Create a refresh token (24h, tied to session)."""
    payload = {
        "sub": user_id,
        "sid": session_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
        "iat": datetime.now(timezone.utc),
    }
    algorithm = getattr(settings, "JWT_ALGORITHM", "HS256")
    secret = getattr(settings, "JWT_SECRET_KEY", "skyie-dev-secret-change-me")
    return jwt.encode(payload, secret, algorithm=algorithm)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token.

    Raises AuthError on invalid / expired tokens or revoked sessions.
    """
    algorithm = getattr(settings, "JWT_ALGORITHM", "HS256")
    secret = getattr(settings, "JWT_SECRET_KEY", "skyie-dev-secret-change-me")
    try:
        payload = jwt.decode(token, secret, algorithms=[algorithm])
    except jwt.ExpiredSignatureError:
        raise AuthError("Token has expired")
    except jwt.InvalidTokenError as exc:
        raise AuthError(f"Invalid token: {exc}")

    # Validate server-side session
    session_id = payload.get("sid")
    if session_id:
        if not validate_session(session_id):
            raise AuthError("Session expired — please sign in again")

    return payload


# ── User operations ──────────────────────────────────────────────────────────


async def register_user(
    session: AsyncSession,
    email: str,
    password: str,
    name: str,
) -> User:
    result = await session.execute(select(User).where(User.email == email))
    existing = result.scalar_one_or_none()
    if existing:
        raise AuthError("Email already registered", status_code=409)

    user = User(
        id=uuid.uuid4(),
        email=email,
        name=name,
        password_hash=hash_password(password),
        email_verified=False,
        is_active=True,
        is_admin=False,
        credits=50,
        plan="free",
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def authenticate_user(
    session: AsyncSession,
    email: str,
    password: str,
) -> User:
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not user.password_hash:
        raise AuthError("Invalid email or password")

    if not verify_password(password, user.password_hash):
        raise AuthError("Invalid email or password")

    if not user.is_active:
        raise AuthError("Account is disabled", status_code=403)

    return user
