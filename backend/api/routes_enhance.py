"""Prompt enhancement endpoint — uses LLM to improve user prompts."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.dependencies import get_current_user
from services.llm_service import PromptType, enhance_prompt

router = APIRouter(prefix="/api/v1/enhance", tags=["enhance"])


class EnhanceRequest(BaseModel):
    prompt: str
    type: PromptType = "video"


class EnhanceResponse(BaseModel):
    original: str
    enhanced: str


@router.post("", response_model=EnhanceResponse)
async def enhance_user_prompt(
    request: EnhanceRequest,
    _current_user=Depends(get_current_user),
):
    """Enhance a prompt using LLM for better generation results."""
    enhanced = await enhance_prompt(request.prompt, prompt_type=request.type)
    return EnhanceResponse(original=request.prompt, enhanced=enhanced)
