"""JWT authentication service for Skyie Studio."""

import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.models import User


class AuthError(Exception):
    """Authentication / authorization error."""

    def __init__(self, message: str, status_code: int = 401):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


# ── Password helpers ─────────────────────────────────────────────────────────


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


# ── JWT helpers ──────────────────────────────────────────────────────────────


def create_access_token(user_id: str, email: str) -> str:
    """Create a short-lived access token (30 min default)."""
    expire_minutes = getattr(settings, "JWT_ACCESS_TOKEN_EXPIRE_MINUTES", 30)
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=expire_minutes),
        "iat": datetime.now(timezone.utc),
    }
    algorithm = getattr(settings, "JWT_ALGORITHM", "HS256")
    secret = getattr(settings, "JWT_SECRET_KEY", "skyie-dev-secret-change-me")
    return jwt.encode(payload, secret, algorithm=algorithm)


def create_refresh_token(user_id: str) -> str:
    """Create a long-lived refresh token (7 day default)."""
    expire_days = getattr(settings, "JWT_REFRESH_TOKEN_EXPIRE_DAYS", 7)
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=expire_days),
        "iat": datetime.now(timezone.utc),
    }
    algorithm = getattr(settings, "JWT_ALGORITHM", "HS256")
    secret = getattr(settings, "JWT_SECRET_KEY", "skyie-dev-secret-change-me")
    return jwt.encode(payload, secret, algorithm=algorithm)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token. Returns the payload dict.

    Raises AuthError on invalid / expired tokens.
    """
    algorithm = getattr(settings, "JWT_ALGORITHM", "HS256")
    secret = getattr(settings, "JWT_SECRET_KEY", "skyie-dev-secret-change-me")
    try:
        payload = jwt.decode(token, secret, algorithms=[algorithm])
        return payload
    except jwt.ExpiredSignatureError:
        raise AuthError("Token has expired")
    except jwt.InvalidTokenError as exc:
        raise AuthError(f"Invalid token: {exc}")


# ── User operations ──────────────────────────────────────────────────────────


async def register_user(
    session: AsyncSession,
    email: str,
    password: str,
    name: str,
) -> User:
    """Register a new user with a hashed password.

    Raises AuthError if the email is already taken.
    """
    # Check for existing user
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
    """Validate credentials and return the user.

    Raises AuthError on invalid email / password or inactive account.
    """
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not user.password_hash:
        raise AuthError("Invalid email or password")

    if not verify_password(password, user.password_hash):
        raise AuthError("Invalid email or password")

    if not user.is_active:
        raise AuthError("Account is disabled", status_code=403)

    return user
