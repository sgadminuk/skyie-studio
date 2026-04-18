"""Veo 3.1 prompt enhancement via Gemini 2.5 Flash.

Mirrors what the Gemini app does silently before submitting to Veo: take a
brief user prompt and rewrite it to the 5-element Veo template
(Camera + Subject + Action + Setting + Style & Audio), preserving the
caller's intent — including any quoted dialogue and language hints.

Best-effort: if enhancement fails for any reason, return the original prompt.
The caller's generation must never be blocked by this layer.
"""

from __future__ import annotations

import logging

from services.gemini_service import GeminiError, get_gemini_service

logger = logging.getLogger(__name__)

_SCHEMA = {
    "type": "object",
    "properties": {"prompt": {"type": "string"}},
    "required": ["prompt"],
}

_SYSTEM = (
    "You are a Veo 3.1 prompt engineer. Rewrite the user's brief into a single "
    "cinematic prompt using these elements in order: Camera, Subject, Action, "
    "Setting, Style & Audio. "
    "Hard rules: "
    "(1) Preserve every word inside quotation marks verbatim — including the "
    "language and script. Quoted text is dialogue; do not translate, transliterate, "
    "or modify it. "
    "(2) Preserve any explicit voice/accent direction the user wrote. "
    "(3) Keep the rewrite under 600 characters. "
    "(4) Do not invent characters, brands, or settings the user did not imply. "
    "Return JSON: { \"prompt\": \"<rewritten prompt>\" }."
)


async def enhance_veo_prompt(prompt: str, *, user_id: str | None = None) -> str:
    """Expand a brief prompt into a Veo-optimized one. Falls back to input on failure."""
    if not prompt or len(prompt) > 4000:
        return prompt
    try:
        service = get_gemini_service()
        result = await service.generate_structured_json(
            f"{_SYSTEM}\n\nUser brief:\n{prompt}",
            schema=_SCHEMA,
            model="gemini-2.5-flash",
            user_id=user_id,
        )
        out = (result or {}).get("prompt", "").strip()
        return out or prompt
    except GeminiError as e:
        logger.warning("Veo prompt enhancement failed (%s); using original", e)
        return prompt
