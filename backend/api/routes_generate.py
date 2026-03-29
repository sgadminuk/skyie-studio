"""Generation endpoints — create video generation jobs."""

from __future__ import annotations

import uuid as uuid_mod
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from db.base import get_session
from db.models import User
from api.dependencies import get_current_user
from services.job_queue import (
    create_job,
    run_talking_head_task, run_broll_task, run_full_production_task,
    run_shots_task, run_v2v_task, run_extend_task, run_director_task,
)
from services.credit_service import get_credit_cost, check_credits, reserve_credits

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
    await reserve_credits(session, user.id, cost, job_id=uuid_mod.UUID(job_id), description="Full production generation")
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
