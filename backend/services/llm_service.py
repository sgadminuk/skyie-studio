"""LLM prompt enhancement service using OpenAI API."""

import logging
import os
from typing import Literal

import httpx

logger = logging.getLogger(__name__)

OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
OPENAI_MODEL = "gpt-4o-mini"

PromptType = Literal["video", "image", "music", "background"]

SYSTEM_PROMPTS: dict[str, str] = {
    "video": (
        "You are a cinematic video prompt engineer. Given a user's rough idea, "
        "enhance it into a detailed, vivid prompt for an AI video generation model. "
        "Focus on camera angles, lighting, mood, color palette, movement, and "
        "cinematic quality. Keep the enhanced prompt concise (2-4 sentences). "
        "Do NOT include any preamble or explanation — only return the enhanced prompt."
    ),
    "image": (
        "You are a professional image prompt engineer. Given a user's rough idea, "
        "enhance it into a detailed prompt for an AI image generation model. "
        "Focus on composition, lighting, color palette, style, and visual details. "
        "Keep the enhanced prompt concise (2-4 sentences). "
        "Do NOT include any preamble or explanation — only return the enhanced prompt."
    ),
    "music": (
        "You are a music prompt engineer. Given a user's rough idea, "
        "enhance it into a detailed prompt for an AI music generation model. "
        "Focus on genre, tempo, instruments, mood, energy level, and sonic texture. "
        "Keep the enhanced prompt concise (2-4 sentences). "
        "Do NOT include any preamble or explanation — only return the enhanced prompt."
    ),
    "background": (
        "You are a background scene prompt engineer. Given a user's rough idea, "
        "enhance it into a detailed prompt for an AI background image generator. "
        "Focus on environment, lighting, depth, atmosphere, and visual style. "
        "Keep the enhanced prompt concise (2-4 sentences). "
        "Do NOT include any preamble or explanation — only return the enhanced prompt."
    ),
}


async def enhance_prompt(user_prompt: str, prompt_type: PromptType = "video") -> str:
    """Enhance a user prompt using OpenAI GPT-4o-mini.

    Falls back to the original prompt if OPENAI_API_KEY is not set or if the
    API call fails for any reason.

    Args:
        user_prompt: The user's original prompt text.
        prompt_type: Type of content — video, image, music, or background.

    Returns:
        The enhanced prompt string, or the original prompt on failure.
    """
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        logger.warning("OPENAI_API_KEY not set — returning original prompt")
        return user_prompt

    system_prompt = SYSTEM_PROMPTS.get(prompt_type, SYSTEM_PROMPTS["video"])

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                OPENAI_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": OPENAI_MODEL,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": 300,
                    "temperature": 0.7,
                },
            )
            response.raise_for_status()
            data = response.json()
            enhanced = data["choices"][0]["message"]["content"].strip()
            logger.info(
                "Prompt enhanced (%s): %r -> %r",
                prompt_type,
                user_prompt[:80],
                enhanced[:80],
            )
            return enhanced

    except httpx.HTTPStatusError as exc:
        logger.error("OpenAI API error %s: %s", exc.response.status_code, exc.response.text)
        return user_prompt
    except Exception as exc:
        logger.error("Prompt enhancement failed: %s", exc)
        return user_prompt
