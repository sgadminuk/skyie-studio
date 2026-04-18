"""Generation endpoints — create video generation jobs."""

from __future__ import annotations

import uuid as uuid_mod
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from config import settings
from db.base import get_session
from db.models import User
from api.dependencies import get_current_user
from services.job_queue import (
    create_job,
    find_job_by_idempotency_key,
    run_talking_head_task, run_broll_task, run_full_production_task,
    run_shots_task, run_v2v_task, run_extend_task, run_director_task,
    run_gemini_image_task, run_gemini_image_edit_task, run_gemini_video_task,
    run_veo_multi_shot_task,
)
from services.credit_service import get_credit_cost, check_credits, reserve_credits
from services.gemini_service import estimate_video_cost_usd

router = APIRouter(prefix="/api/v1/generate", tags=["generate"])


class TalkingHeadRequest(BaseModel):
    script: str
    avatar_path: str = ""
    voice_engine: str = "fish_speech"
    voice_reference: str | None = None
    language: str = "en"
    generate_background: bool = True
    background_prompt: str = "Professional studio background, soft lighting"


class BrollScene(BaseModel):
    prompt: str
    duration: float = 5.0


class BrollRequest(BaseModel):
    scenes: list[BrollScene]
    style: str = "cinematic, professional"
    generate_music: bool = True
    music_prompt: str = "Upbeat corporate background music"
    width: int = 1080
    height: int = 1920


class FullProductionRequest(BaseModel):
    script: str
    avatar_path: str = ""
    voice_engine: str = "fish_speech"
    voice_reference: str | None = None
    language: str = "en"
    generate_music: bool = True
    music_prompt: str = "Professional background music"
    background_prompt: str = "Professional studio background"


@router.post("/talking-head")
async def generate_talking_head(
    request: TalkingHeadRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a talking head video generation job."""
    cost = get_credit_cost("talking_head")
    if not await check_credits(session, user.id, cost):
        raise HTTPException(status_code=402, detail=f"Insufficient credits. Need {cost}, have {user.credits}")

    params = request.model_dump()
    job_id = create_job("talking_head", params, user_id=str(user.id))
    await reserve_credits(session, user.id, cost, job_id=uuid_mod.UUID(job_id), description="Talking head generation")
    run_talking_head_task.delay(job_id, params)
    return {"job_id": job_id, "workflow": "talking_head", "status": "queued", "credits_used": cost}


@router.post("/broll")
async def generate_broll(
    request: BrollRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a b-roll video generation job."""
    params = request.model_dump()
    params["scenes"] = [s.model_dump() for s in request.scenes]
    cost = get_credit_cost("broll", params)
    if not await check_credits(session, user.id, cost):
        raise HTTPException(status_code=402, detail=f"Insufficient credits. Need {cost}, have {user.credits}")

    job_id = create_job("broll", params, user_id=str(user.id))
    await reserve_credits(session, user.id, cost, job_id=uuid_mod.UUID(job_id), description="B-roll generation")
    run_broll_task.delay(job_id, params)
    return {"job_id": job_id, "workflow": "broll", "status": "queued", "credits_used": cost}


@router.post("/full-production")
async def generate_full_production(
    request: FullProductionRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a full production video generation job."""
    cost = get_credit_cost("full_production")
    if not await check_credits(session, user.id, cost):
        raise HTTPException(status_code=402, detail=f"Insufficient credits. Need {cost}, have {user.credits}")

    params = request.model_dump()
    job_id = create_job("full_production", params, user_id=str(user.id))
    await reserve_credits(
        session, user.id, cost, job_id=uuid_mod.UUID(job_id), description="Full production generation",
    )
    run_full_production_task.delay(job_id, params)
    return {"job_id": job_id, "workflow": "full_production", "status": "queued", "credits_used": cost}


# ── Phase 1: Shot Creator ──────────────────────────────────────────────────

class ShotImage(BaseModel):
    path: str
    prompt: str = ""

class ShotItem(BaseModel):
    images: list[str] = []
    prompts: list[str] = []
    duration: float = 5.0

class ShotsRequest(BaseModel):
    shots: list[ShotItem]
    aspect_ratio: str | None = None
    transition: str = "cut"
    remove_watermarks: bool = False
    auto_enhance: bool = False
    generate_music: bool = False
    music_prompt: str = "Cinematic background music"
    width: int = 1920
    height: int = 1080

@router.post("/shots")
async def generate_shots(
    request: ShotsRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a shot-based image-to-video generation job."""
    params = request.model_dump()
    params["shots"] = [s.model_dump() for s in request.shots]
    cost = get_credit_cost("shots", params)
    if not await check_credits(session, user.id, cost):
        raise HTTPException(status_code=402, detail=f"Insufficient credits. Need {cost}, have {user.credits}")

    job_id = create_job("shots", params, user_id=str(user.id))
    await reserve_credits(session, user.id, cost, job_id=uuid_mod.UUID(job_id), description="Shot creator generation")
    run_shots_task.delay(job_id, params)
    return {"job_id": job_id, "workflow": "shots", "status": "queued", "credits_used": cost}


# ── Phase 4: Video-to-Video ────────────────────────────────────────────────

class V2VRequest(BaseModel):
    source_video: str
    prompt: str
    strength: float = 0.7
    style: str = ""
    width: int = 1920
    height: int = 1080

class ExtendRequest(BaseModel):
    source_video: str
    prompt: str = ""
    extend_seconds: float = 5.0
    direction: str = "forward"

@router.post("/v2v")
async def generate_v2v(
    request: V2VRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a video-to-video transformation job."""
    params = request.model_dump()
    cost = get_credit_cost("v2v")
    if not await check_credits(session, user.id, cost):
        raise HTTPException(status_code=402, detail=f"Insufficient credits. Need {cost}, have {user.credits}")

    job_id = create_job("v2v", params, user_id=str(user.id))
    await reserve_credits(session, user.id, cost, job_id=uuid_mod.UUID(job_id), description="Video-to-video generation")
    run_v2v_task.delay(job_id, params)
    return {"job_id": job_id, "workflow": "v2v", "status": "queued", "credits_used": cost}

@router.post("/extend")
async def generate_extend(
    request: ExtendRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a video extend job."""
    params = request.model_dump()
    cost = get_credit_cost("extend")
    if not await check_credits(session, user.id, cost):
        raise HTTPException(status_code=402, detail=f"Insufficient credits. Need {cost}, have {user.credits}")

    job_id = create_job("extend", params, user_id=str(user.id))
    await reserve_credits(session, user.id, cost, job_id=uuid_mod.UUID(job_id), description="Video extend generation")
    run_extend_task.delay(job_id, params)
    return {"job_id": job_id, "workflow": "extend", "status": "queued", "credits_used": cost}


# ── Phase 8: AI Director ───────────────────────────────────────────────────

class DirectorRequest(BaseModel):
    idea: str
    style: str = "cinematic, professional"
    voice_engine: str = "fish_speech"
    language: str = "en"
    template: str = "general"
    duration_target: int = 45

@router.post("/director")
async def generate_director(
    request: DirectorRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create an AI Director video generation job — one prompt to full video."""
    params = request.model_dump()
    cost = get_credit_cost("director")
    if not await check_credits(session, user.id, cost):
        raise HTTPException(status_code=402, detail=f"Insufficient credits. Need {cost}, have {user.credits}")

    job_id = create_job("director", params, user_id=str(user.id))
    await reserve_credits(session, user.id, cost, job_id=uuid_mod.UUID(job_id), description="AI Director generation")
    run_director_task.delay(job_id, params)
    return {"job_id": job_id, "workflow": "director", "status": "queued", "credits_used": cost}


# ── Gemini (Veo 3.1 + Nano Banana) ─────────────────────────────────────────

class GeminiImageRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    reference_image_paths: list[str] = Field(default_factory=list, max_length=10)
    aspect_ratio: str = "1:1"
    brand_profile_id: str | None = None
    include_logo_overlay: bool = False
    logo_position: str = "bottom-right"
    logo_scale: float = Field(default=0.15, ge=0.05, le=0.4)
    logo_opacity: float = Field(default=0.95, ge=0.1, le=1.0)


class GeminiImageEditRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    source_image_path: str
    mask_image_path: str | None = None
    brand_profile_id: str | None = None
    include_logo_overlay: bool = False
    logo_position: str = "bottom-right"
    logo_scale: float = Field(default=0.15, ge=0.05, le=0.4)
    logo_opacity: float = Field(default=0.95, ge=0.1, le=1.0)


class GeminiVideoRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    source_image_path: str | None = None
    duration_sec: int = Field(default=8, ge=2, le=8)
    aspect_ratio: str = "16:9"
    resolution: str = "1080p"
    generate_audio: bool = True
    negative_prompt: str | None = None
    brand_profile_id: str | None = None


def _idempotent_response(existing: dict) -> dict:
    return {
        "job_id": existing["id"],
        "workflow": existing["workflow"],
        "provider": existing.get("provider", "gemini"),
        "model": existing.get("model", ""),
        "status": existing.get("status", "queued"),
        "idempotent_replay": True,
    }


@router.post("/gemini/image")
async def generate_gemini_image(
    request: GeminiImageRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Nano Banana image generation — text-to-image and multi-image composition."""
    if idempotency_key:
        existing = find_job_by_idempotency_key(str(user.id), idempotency_key)
        if existing:
            return _idempotent_response(existing)

    params = request.model_dump()
    params["_user_id"] = str(user.id)

    cost = get_credit_cost("gemini_image", params)
    if not await check_credits(session, user.id, cost):
        raise HTTPException(status_code=402, detail=f"Insufficient credits. Need {cost}, have {user.credits}")

    job_id = create_job(
        "gemini_image", params, user_id=str(user.id),
        provider="gemini", model=settings.GEMINI_IMAGE_MODEL,
        idempotency_key=idempotency_key,
    )
    await reserve_credits(
        session, user.id, cost, job_id=uuid_mod.UUID(job_id),
        description="Gemini image generation",
    )
    run_gemini_image_task.delay(job_id, params)
    return {
        "job_id": job_id,
        "workflow": "gemini_image",
        "provider": "gemini",
        "model": settings.GEMINI_IMAGE_MODEL,
        "status": "queued",
        "credits_used": cost,
    }


@router.post("/gemini/image/edit")
async def generate_gemini_image_edit(
    request: GeminiImageEditRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Nano Banana image edit / inpaint."""
    if idempotency_key:
        existing = find_job_by_idempotency_key(str(user.id), idempotency_key)
        if existing:
            return _idempotent_response(existing)

    params = request.model_dump()
    params["_user_id"] = str(user.id)

    cost = get_credit_cost("gemini_image_edit", params)
    if not await check_credits(session, user.id, cost):
        raise HTTPException(status_code=402, detail=f"Insufficient credits. Need {cost}, have {user.credits}")

    job_id = create_job(
        "gemini_image_edit", params, user_id=str(user.id),
        provider="gemini", model=settings.GEMINI_IMAGE_MODEL,
        idempotency_key=idempotency_key,
    )
    await reserve_credits(
        session, user.id, cost, job_id=uuid_mod.UUID(job_id),
        description="Gemini image edit",
    )
    run_gemini_image_edit_task.delay(job_id, params)
    return {
        "job_id": job_id,
        "workflow": "gemini_image_edit",
        "provider": "gemini",
        "model": settings.GEMINI_IMAGE_MODEL,
        "status": "queued",
        "credits_used": cost,
    }


@router.post("/gemini/video")
async def generate_gemini_video(
    request: GeminiVideoRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Veo 3.1 video generation — T2V or I2V with full quality defaults."""
    if idempotency_key:
        existing = find_job_by_idempotency_key(str(user.id), idempotency_key)
        if existing:
            return _idempotent_response(existing)

    params = request.model_dump()
    params["_user_id"] = str(user.id)

    cost = get_credit_cost("gemini_video", params)
    if not await check_credits(session, user.id, cost):
        raise HTTPException(status_code=402, detail=f"Insufficient credits. Need {cost}, have {user.credits}")

    job_id = create_job(
        "gemini_video", params, user_id=str(user.id),
        provider="gemini", model=settings.GEMINI_VEO_MODEL,
        idempotency_key=idempotency_key,
    )
    await reserve_credits(
        session, user.id, cost, job_id=uuid_mod.UUID(job_id),
        description=f"Veo 3.1 video ({request.duration_sec}s @ {request.resolution})",
    )
    run_gemini_video_task.delay(job_id, params)
    return {
        "job_id": job_id,
        "workflow": "gemini_video",
        "provider": "gemini",
        "model": settings.GEMINI_VEO_MODEL,
        "status": "queued",
        "credits_used": cost,
        "estimated_duration_seconds": 180,
    }


# ── Veo 3.1 multi-shot ─────────────────────────────────────────────────────


class MultiShotShot(BaseModel):
    prompt: str = Field(..., min_length=1)
    duration_sec: int = Field(default=8)
    reference_image_paths: list[str] = Field(default_factory=list, max_length=3)
    first_frame_image_path: str | None = None
    negative_prompt: str | None = None


class MultiShotStitch(BaseModel):
    mode: str = Field(default="hard_cut")  # "hard_cut" | "crossfade"
    crossfade_duration_sec: float = Field(default=0.5, ge=0.1, le=2.0)


class MultiShotMusic(BaseModel):
    enabled: bool = False
    prompt: str = "Cinematic background music"


class VeoMultiShotRequest(BaseModel):
    shots: list[MultiShotShot] = Field(..., min_length=1, max_length=10)
    aspect_ratio: str = "9:16"
    resolution: str = "1080p"
    stitch: MultiShotStitch = Field(default_factory=MultiShotStitch)
    music: MultiShotMusic = Field(default_factory=MultiShotMusic)
    enhance_prompts: bool = False
    brand_profile_id: str | None = None
    concurrency: int = Field(default=3, ge=1, le=3)


def _validate_multi_shot(req: VeoMultiShotRequest) -> None:
    """Boundary validation that Pydantic alone can't express."""
    allowed_durations = {4, 6, 8}
    if req.stitch.mode not in ("hard_cut", "crossfade"):
        raise HTTPException(
            status_code=422,
            detail="stitch.mode must be 'hard_cut' or 'crossfade'",
        )
    for i, shot in enumerate(req.shots):
        if shot.duration_sec not in allowed_durations:
            raise HTTPException(
                status_code=422,
                detail=f"shot {i + 1}: duration_sec must be one of {sorted(allowed_durations)}",
            )
        if shot.reference_image_paths and shot.first_frame_image_path:
            raise HTTPException(
                status_code=422,
                detail=f"shot {i + 1}: reference_image_paths and first_frame_image_path are mutually exclusive",
            )


@router.post("/veo/multi-shot/estimate")
async def estimate_veo_multi_shot(
    request: VeoMultiShotRequest,
    user: User = Depends(get_current_user),
):
    """Cost preflight — does not submit a job, does not reserve credits."""
    _validate_multi_shot(request)
    params = request.model_dump()
    credits = get_credit_cost("veo_multi_shot", params)
    total_duration = sum(shot.duration_sec for shot in request.shots)
    cost_usd = sum(
        estimate_video_cost_usd(shot.duration_sec, True) for shot in request.shots
    )
    return {
        "shot_count": len(request.shots),
        "total_duration_sec": total_duration,
        "estimated_cost_usd": round(cost_usd, 4),
        "credits_required": credits,
        "user_credits": user.credits,
        "sufficient": user.credits >= credits,
    }


@router.post("/veo/multi-shot")
async def generate_veo_multi_shot(
    request: VeoMultiShotRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Render N Veo 3.1 shots and stitch them into a single MP4."""
    if idempotency_key:
        existing = find_job_by_idempotency_key(str(user.id), idempotency_key)
        if existing:
            return _idempotent_response(existing)

    _validate_multi_shot(request)
    params = request.model_dump()
    params["_user_id"] = str(user.id)

    cost = get_credit_cost("veo_multi_shot", params)
    if not await check_credits(session, user.id, cost):
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient credits. Need {cost}, have {user.credits}",
        )

    job_id = create_job(
        "veo_multi_shot", params, user_id=str(user.id),
        provider="gemini", model=settings.GEMINI_VEO_MODEL,
        idempotency_key=idempotency_key,
    )
    await reserve_credits(
        session, user.id, cost, job_id=uuid_mod.UUID(job_id),
        description=f"Veo 3.1 multi-shot ({len(request.shots)} shots)",
    )
    run_veo_multi_shot_task.delay(job_id, params)
    return {
        "job_id": job_id,
        "workflow": "veo_multi_shot",
        "provider": "gemini",
        "model": settings.GEMINI_VEO_MODEL,
        "status": "queued",
        "credits_used": cost,
        "shot_count": len(request.shots),
    }
