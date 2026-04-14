"""Apply a brand profile to generation prompts and post-processed outputs.

Used by the Gemini workflows to:
  1. Prefix prompts with brand identity (name/tone/audience/colors/guidelines)
  2. Composite a brand logo onto generated images via Pillow
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from db.models import BrandProfile
from services.job_queue import _sync_engine  # reuse the worker's sync engine

logger = logging.getLogger(__name__)


LOGO_POSITIONS = {"bottom-right", "bottom-left", "top-right", "top-left", "center"}


def fetch_brand_profile(brand_id: str, user_id: str) -> Optional[BrandProfile]:
    """Look up a brand profile in the worker's sync session.

    Returns None if the brand doesn't exist or doesn't belong to the user.
    """
    import uuid as _uuid

    try:
        bid = _uuid.UUID(brand_id)
        uid = _uuid.UUID(user_id)
    except (TypeError, ValueError):
        return None

    with Session(_sync_engine) as session:
        brand = session.get(BrandProfile, bid)
        if not brand or brand.user_id != uid:
            return None
        # Detach before returning so caller can access attributes outside the session.
        session.expunge(brand)
        return brand


def build_brand_prefix(brand: BrandProfile, *, intent: str = "image") -> str:
    """Build a natural-language brand identity block to prepend to a prompt."""
    parts: list[str] = []

    if brand.name:
        parts.append(f"Brand name: {brand.name}")
    if brand.tagline:
        parts.append(f"Tagline: {brand.tagline}")
    if brand.industry:
        parts.append(f"Industry: {brand.industry}")
    if brand.target_audience:
        parts.append(f"Target audience: {brand.target_audience}")
    if brand.tone_of_voice:
        parts.append(f"Tone of voice: {brand.tone_of_voice}")

    colors = [
        c for c in (brand.primary_color, brand.secondary_color, brand.accent_color) if c
    ]
    if colors:
        parts.append(
            "Brand colors (incorporate these into lighting, wardrobe, background, or props): "
            + ", ".join(colors)
        )
    if brand.guidelines:
        parts.append("Brand guidelines:\n" + brand.guidelines.strip())

    if not parts:
        return ""

    header = (
        "Respect the following brand identity while creating the "
        f"{'video' if intent == 'video' else 'image'}:"
    )
    block = "\n".join(parts)
    return f"{header}\n{block}\n\nCreative brief:\n"


def compose_prompt_with_brand(prompt: str, brand: BrandProfile, *, intent: str = "image") -> str:
    prefix = build_brand_prefix(brand, intent=intent)
    return prefix + prompt if prefix else prompt


def apply_logo_overlay(
    image_path: str,
    logo_path: str,
    *,
    position: str = "bottom-right",
    scale: float = 0.15,
    opacity: float = 0.95,
    padding_ratio: float = 0.03,
) -> bool:
    """Composite `logo_path` onto `image_path` in place.

    Returns True on success, False if the logo format is unsupported (e.g. SVG)
    or anything else goes wrong — we never raise, since overlay is best-effort.
    """
    try:
        from PIL import Image
    except Exception:
        logger.warning("Pillow not available for logo overlay")
        return False

    logo_p = Path(logo_path)
    if logo_p.suffix.lower() == ".svg":
        logger.info("Skipping SVG logo overlay (not supported): %s", logo_path)
        return False
    if not Path(image_path).exists() or not logo_p.exists():
        return False

    position = position if position in LOGO_POSITIONS else "bottom-right"
    scale = max(0.05, min(scale, 0.4))
    opacity = max(0.1, min(opacity, 1.0))

    try:
        base = Image.open(image_path).convert("RGBA")
        logo = Image.open(logo_path).convert("RGBA")

        # Scale logo to `scale` fraction of base width, preserving aspect ratio.
        target_w = max(1, int(base.width * scale))
        ratio = target_w / logo.width
        target_h = max(1, int(logo.height * ratio))
        logo = logo.resize((target_w, target_h), Image.LANCZOS)

        # Apply opacity by multiplying the alpha channel.
        if opacity < 1.0:
            alpha = logo.split()[3]
            alpha = alpha.point(lambda p: int(p * opacity))
            logo.putalpha(alpha)

        padding = max(4, int(base.width * padding_ratio))
        positions = {
            "top-left": (padding, padding),
            "top-right": (base.width - logo.width - padding, padding),
            "bottom-left": (padding, base.height - logo.height - padding),
            "bottom-right": (
                base.width - logo.width - padding,
                base.height - logo.height - padding,
            ),
            "center": (
                (base.width - logo.width) // 2,
                (base.height - logo.height) // 2,
            ),
        }
        pos = positions[position]

        # Paste the logo using its own alpha as the mask.
        base.alpha_composite(logo, pos)

        ext = Path(image_path).suffix.lower()
        if ext in (".jpg", ".jpeg"):
            base.convert("RGB").save(image_path, "JPEG", quality=95)
        else:
            base.save(image_path, "PNG")
        return True
    except Exception as e:
        logger.exception("apply_logo_overlay failed: %s", e)
        return False
