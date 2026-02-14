"""Generation endpoints — create video generation jobs."""

from __future__ import annotations

import uuid as uuid_mod
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from db.base import get_session
from db.models import User
from api.dependencies import get_current_user
from services.job_queue import create_job, run_talking_head_task, run_broll_task, run_full_production_task
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
