"""Generation endpoints — create video generation jobs."""

from fastapi import APIRouter
from pydantic import BaseModel
from services.job_queue import create_job, run_talking_head_task, run_broll_task, run_full_production_task

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
async def generate_talking_head(request: TalkingHeadRequest):
    """Create a talking head video generation job."""
    params = request.model_dump()
    job_id = create_job("talking_head", params)
    run_talking_head_task.delay(job_id, params)
    return {"job_id": job_id, "workflow": "talking_head", "status": "queued"}


@router.post("/broll")
async def generate_broll(request: BrollRequest):
    """Create a b-roll video generation job."""
    params = request.model_dump()
    # Convert scenes to plain dicts for JSON serialization
    params["scenes"] = [s.model_dump() for s in request.scenes]
    job_id = create_job("broll", params)
    run_broll_task.delay(job_id, params)
    return {"job_id": job_id, "workflow": "broll", "status": "queued"}


@router.post("/full-production")
async def generate_full_production(request: FullProductionRequest):
    """Create a full production video generation job."""
    params = request.model_dump()
    job_id = create_job("full_production", params)
    run_full_production_task.delay(job_id, params)
    return {"job_id": job_id, "workflow": "full_production", "status": "queued"}
