"""Brand profile management — CRUD + website scrape + logo upload."""
from __future__ import annotations

import shutil
import uuid as uuid_mod
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import delete as sa_delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_current_user
from config import settings
from db.base import get_session
from db.models import BrandProfile, User
from services.brand_scrape_service import (
    BrandScrapeError,
    scrape_brand_from_url,
)
from services.storage_service import get_asset_url

router = APIRouter(prefix="/api/v1/brand", tags=["brand"])


# ── Pydantic schemas ────────────────────────────────────────────────────────

class BrandProfileOut(BaseModel):
    id: str
    name: str
    tagline: str | None = None
    description: str | None = None
    website_url: str | None = None
    logo_url: str | None = None
    primary_color: str | None = None
    secondary_color: str | None = None
    accent_color: str | None = None
    fonts: Any = None
    tone_of_voice: str | None = None
    target_audience: str | None = None
    industry: str | None = None
    guidelines: str | None = None
    created_at: str
    updated_at: str


class BrandProfileIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    tagline: str | None = None
    description: str | None = None
    website_url: str | None = None
    primary_color: str | None = None
    secondary_color: str | None = None
    accent_color: str | None = None
    fonts: Any = None
    tone_of_voice: str | None = None
    target_audience: str | None = None
    industry: str | None = None
    guidelines: str | None = None
    # Path returned from /scrape — we'll move it into the brand's dir on save
    pending_logo_path: str | None = None


class ScrapeRequest(BaseModel):
    url: str = Field(..., min_length=1)


def _to_out(brand: BrandProfile) -> dict[str, Any]:
    return {
        "id": str(brand.id),
        "name": brand.name,
        "tagline": brand.tagline,
        "description": brand.description,
        "website_url": brand.website_url,
        "logo_url": get_asset_url(brand.logo_path) if brand.logo_path else None,
        "primary_color": brand.primary_color,
        "secondary_color": brand.secondary_color,
        "accent_color": brand.accent_color,
        "fonts": brand.fonts,
        "tone_of_voice": brand.tone_of_voice,
        "target_audience": brand.target_audience,
        "industry": brand.industry,
        "guidelines": brand.guidelines,
        "created_at": brand.created_at.isoformat() if brand.created_at else "",
        "updated_at": brand.updated_at.isoformat() if brand.updated_at else "",
    }


def _brand_dir(brand_id: str) -> Path:
    d = Path(settings.BRANDS_PATH) / brand_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _move_pending_logo(pending: str, brand_id: str) -> str | None:
    src = Path(pending)
    if not src.exists() or not src.is_file():
        return None
    dest_dir = _brand_dir(brand_id)
    dest = dest_dir / src.name
    shutil.move(str(src), str(dest))
    # Clean up the temp scrape directory if it's empty
    try:
        if src.parent.exists() and src.parent.name.startswith("_scrape_"):
            if not any(src.parent.iterdir()):
                src.parent.rmdir()
    except Exception:
        pass
    return str(dest)


# ── Routes ──────────────────────────────────────────────────────────────────

@router.get("")
async def list_brand_profiles(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(BrandProfile)
        .where(BrandProfile.user_id == user.id)
        .order_by(BrandProfile.updated_at.desc())
    )
    brands = result.scalars().all()
    return {"brands": [_to_out(b) for b in brands]}


@router.get("/{brand_id}")
async def get_brand_profile(
    brand_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    brand = await session.get(BrandProfile, uuid_mod.UUID(brand_id))
    if not brand or brand.user_id != user.id:
        raise HTTPException(status_code=404, detail="Brand profile not found")
    return _to_out(brand)


@router.post("")
async def create_brand_profile(
    payload: BrandProfileIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    brand = BrandProfile(
        id=uuid_mod.uuid4(),
        user_id=user.id,
        name=payload.name,
        tagline=payload.tagline,
        description=payload.description,
        website_url=payload.website_url,
        primary_color=payload.primary_color,
        secondary_color=payload.secondary_color,
        accent_color=payload.accent_color,
        fonts=payload.fonts,
        tone_of_voice=payload.tone_of_voice,
        target_audience=payload.target_audience,
        industry=payload.industry,
        guidelines=payload.guidelines,
    )
    if payload.pending_logo_path:
        moved = _move_pending_logo(payload.pending_logo_path, str(brand.id))
        if moved:
            brand.logo_path = moved

    session.add(brand)
    await session.commit()
    await session.refresh(brand)
    return _to_out(brand)


@router.put("/{brand_id}")
async def update_brand_profile(
    brand_id: str,
    payload: BrandProfileIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    brand = await session.get(BrandProfile, uuid_mod.UUID(brand_id))
    if not brand or brand.user_id != user.id:
        raise HTTPException(status_code=404, detail="Brand profile not found")

    for field in (
        "name", "tagline", "description", "website_url",
        "primary_color", "secondary_color", "accent_color", "fonts",
        "tone_of_voice", "target_audience", "industry", "guidelines",
    ):
        setattr(brand, field, getattr(payload, field))

    if payload.pending_logo_path:
        moved = _move_pending_logo(payload.pending_logo_path, str(brand.id))
        if moved:
            brand.logo_path = moved

    await session.commit()
    await session.refresh(brand)
    return _to_out(brand)


@router.delete("/{brand_id}")
async def delete_brand_profile(
    brand_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    brand = await session.get(BrandProfile, uuid_mod.UUID(brand_id))
    if not brand or brand.user_id != user.id:
        raise HTTPException(status_code=404, detail="Brand profile not found")

    # Best-effort cleanup of the brand's asset directory
    try:
        d = Path(settings.BRANDS_PATH) / str(brand.id)
        if d.exists():
            shutil.rmtree(d)
    except Exception:
        pass

    await session.execute(sa_delete(BrandProfile).where(BrandProfile.id == brand.id))
    await session.commit()
    return {"deleted": True}


@router.post("/scrape")
async def scrape_brand_profile(
    payload: ScrapeRequest,
    user: User = Depends(get_current_user),
):
    """Scrape a website URL and return a prefilled brand profile.

    Does NOT persist anything — the frontend reviews the result and POSTs
    to /brand with pending_logo_path set to keep the downloaded logo.
    """
    try:
        scraped = await scrape_brand_from_url(payload.url, user_id=str(user.id))
    except BrandScrapeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scrape failed: {e}")

    # Expose the downloaded logo via a URL if possible
    if scraped.get("logo_path") and not scraped.get("logo_url"):
        scraped["logo_url"] = get_asset_url(scraped["logo_path"])
    return scraped


@router.post("/{brand_id}/logo")
async def upload_brand_logo(
    brand_id: str,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    brand = await session.get(BrandProfile, uuid_mod.UUID(brand_id))
    if not brand or brand.user_id != user.id:
        raise HTTPException(status_code=404, detail="Brand profile not found")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Logo must be an image")

    dest_dir = _brand_dir(str(brand.id))
    ext = Path(file.filename or "logo.png").suffix or ".png"
    dest = dest_dir / f"logo{ext}"
    content = await file.read()
    dest.write_bytes(content)

    brand.logo_path = str(dest)
    await session.commit()
    await session.refresh(brand)
    return _to_out(brand)


@router.post("/scrape/logo")
async def upload_scrape_logo(
    file: UploadFile = File(...),
    scrape_id: str = Form(...),
    user: User = Depends(get_current_user),
):
    """Upload a logo into a temporary scrape scope (before the brand is saved)."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Logo must be an image")

    # Sanitize scrape_id to avoid path traversal
    safe_id = "".join(c for c in scrape_id if c.isalnum() or c in "_-")[:64]
    if not safe_id:
        raise HTTPException(status_code=400, detail="Invalid scrape_id")
    dest_dir = Path(settings.BRANDS_PATH) / f"_scrape_{safe_id}"
    dest_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "logo.png").suffix or ".png"
    dest = dest_dir / f"logo{ext}"
    content = await file.read()
    dest.write_bytes(content)
    return {"pending_logo_path": str(dest), "logo_url": get_asset_url(str(dest))}
