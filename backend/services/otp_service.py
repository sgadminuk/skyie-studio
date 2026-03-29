from __future__ import annotations
"""Email OTP service — generates, stores, verifies one-time codes.

OTPs are stored in Redis with a 10-minute TTL.
Only the owner email (OWNER_EMAIL) is permitted.
"""

import logging
import secrets
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config import settings
from services.job_queue import redis_client

logger = logging.getLogger(__name__)

OTP_PREFIX = "skyie:otp:"
OTP_TTL = 600  # 10 minutes
OTP_LENGTH = 6
MAX_ATTEMPTS = 5


def generate_otp(email: str) -> str:
    """Generate a 6-digit OTP and store in Redis.

    Raises ValueError if the email is not the owner.
    """
    if email.lower() != settings.OWNER_EMAIL.lower():
        raise ValueError("Access restricted to owner account only")

    code = "".join(secrets.choice("0123456789") for _ in range(OTP_LENGTH))
    key = f"{OTP_PREFIX}{email.lower()}"

    redis_client.set(key, code, ex=OTP_TTL)
    redis_client.set(f"{key}:attempts", "0", ex=OTP_TTL)

    logger.info("OTP generated for %s", email)
    return code


def verify_otp(email: str, code: str) -> bool:
    """Verify an OTP code. Returns True if valid.

    Rate-limited to MAX_ATTEMPTS. Deletes OTP on success.
    """
    key = f"{OTP_PREFIX}{email.lower()}"
    attempts_key = f"{key}:attempts"

    attempts = int(redis_client.get(attempts_key) or "0")
    if attempts >= MAX_ATTEMPTS:
        redis_client.delete(key, attempts_key)
        raise ValueError("Too many failed attempts. Request a new code.")

    stored = redis_client.get(key)
    if not stored:
        raise ValueError("No active OTP. Request a new code.")

    redis_client.incr(attempts_key)

    if stored != code:
        remaining = MAX_ATTEMPTS - attempts - 1
        raise ValueError(f"Invalid code. {remaining} attempts remaining.")

    # Valid — clean up
    redis_client.delete(key, attempts_key)
    logger.info("OTP verified for %s", email)
    return True


def send_otp_email(email: str, code: str) -> bool:
    """Send the OTP code via SMTP email."""
    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured — OTP code: %s (dev mode)", code)
        return True

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Skyie Studio — Your login code is {code}"
    msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
    msg["To"] = email

    text = (
        f"Your Skyie Studio login code is: {code}\n\n"
        "This code expires in 10 minutes.\n\n"
        "If you didn't request this, ignore this email."
    )

    html = f"""
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 24px; font-weight: 700; color: #111; margin: 0;">Skyie Studio</h1>
        </div>
        <div style="background: #f9f9f9; border-radius: 12px; padding: 32px; text-align: center;">
            <p style="color: #555; font-size: 14px; margin: 0 0 16px;">Your login code is:</p>
            <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #111; font-family: monospace;">
                {code}
            </div>
            <p style="color: #888; font-size: 12px; margin: 16px 0 0;">Expires in 10 minutes</p>
        </div>
        <p style="color: #999; font-size: 11px; text-align: center; margin-top: 24px;">
            If you didn't request this code, you can safely ignore this email.
        </p>
    </div>
    """

    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        if settings.SMTP_USE_TLS:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT)

        if settings.SMTP_USER:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)

        server.sendmail(settings.SMTP_FROM_EMAIL, email, msg.as_string())
        server.quit()
        logger.info("OTP email sent to %s", email)
        return True
    except Exception as e:
        logger.exception("Failed to send OTP email: %s", e)
        return False
