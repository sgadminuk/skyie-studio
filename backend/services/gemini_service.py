"""Gemini service — Veo 3.1 video + Gemini 2.5 Flash Image ("Nano Banana").

Quality policy:
  - Never downgrade model, resolution, duration, or audio to save tokens.
  - Never truncate or rewrite user prompts.
  - Never downscale input images before submission.
  - Retries are for transient errors only — quota/safety errors surface immediately.

Exposes an async, transport-only API. Job/credit/storage logic lives in the
workflow layer (workflows/gemini.py), not here.
"""
from __future__ import annotations

import asyncio
import base64
import logging
import time
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional

from PIL import Image
from redis import Redis

from config import settings

logger = logging.getLogger(__name__)


# ── Errors ───────────────────────────────────────────────────────────────────

class GeminiError(Exception):
    """Base class for all Gemini errors. `code` maps to the error taxonomy."""

    code: str = "gemini_error"

    def __init__(self, message: str, *, retryable: bool = False, details: dict | None = None):
        super().__init__(message)
        self.retryable = retryable
        self.details = details or {}


class GeminiConfigError(GeminiError):
    code = "gemini_config"


class GeminiQuotaError(GeminiError):
    code = "gemini_quota"


class GeminiRateLimitError(GeminiError):
    code = "gemini_rate_limit"


class GeminiSafetyError(GeminiError):
    """Prompt or output blocked by Gemini safety filters."""
    code = "gemini_safety"


class GeminiInvalidInputError(GeminiError):
    code = "gemini_invalid_input"


class GeminiTransientError(GeminiError):
    code = "gemini_transient"


class GeminiBreakerOpenError(GeminiError):
    code = "gemini_degraded"


# ── Pricing (Veo 3.1 — per second) ──────────────────────────────────────────
# Public Vertex/Gemini pricing as of model release. Update here if Google revises.

VEO_3_1_PRICE_PER_SEC_AUDIO = 0.40   # $/sec with synchronized audio
VEO_3_1_PRICE_PER_SEC_SILENT = 0.20  # $/sec video only
NANO_BANANA_PRICE_PER_IMAGE = 0.039  # $/generated image (1024×1024 class)


def estimate_video_cost_usd(duration_sec: float, generate_audio: bool) -> float:
    rate = VEO_3_1_PRICE_PER_SEC_AUDIO if generate_audio else VEO_3_1_PRICE_PER_SEC_SILENT
    return round(duration_sec * rate, 4)


def estimate_image_cost_usd(count: int = 1) -> float:
    return round(count * NANO_BANANA_PRICE_PER_IMAGE, 4)


# ── Result containers ───────────────────────────────────────────────────────

@dataclass
class ImageResult:
    image_bytes: bytes
    mime_type: str
    prompt_feedback: dict | None = None
    cost_usd: float = 0.0


@dataclass
class VideoResult:
    video_bytes: bytes
    mime_type: str
    duration_sec: float
    resolution: str
    cost_usd: float = 0.0


# ── Circuit breaker (Redis-backed, shared across workers) ───────────────────

class _Breaker:
    """Simple sliding-window failure counter → open/closed state in Redis."""

    def __init__(self, redis: Redis):
        self.redis = redis
        self.fail_key = "skyie:gemini:breaker:fails"
        self.open_until_key = "skyie:gemini:breaker:open_until"

    def check_open(self) -> bool:
        open_until = self.redis.get(self.open_until_key)
        if open_until and float(open_until) > time.time():
            return True
        return False

    def record_success(self):
        self.redis.delete(self.fail_key)

    def record_failure(self):
        pipe = self.redis.pipeline()
        pipe.incr(self.fail_key)
        pipe.expire(self.fail_key, settings.GEMINI_BREAKER_WINDOW_SEC)
        fails, _ = pipe.execute()
        if fails >= settings.GEMINI_BREAKER_FAIL_THRESHOLD:
            self.redis.set(
                self.open_until_key,
                str(time.time() + settings.GEMINI_BREAKER_COOLDOWN_SEC),
                ex=settings.GEMINI_BREAKER_COOLDOWN_SEC,
            )
            logger.warning("Gemini circuit breaker opened after %d failures", fails)


# ── Per-user token-bucket rate limiter ──────────────────────────────────────

def _check_user_rate(redis: Redis, user_id: str | None):
    if not user_id:
        return
    key = f"skyie:gemini:rate:{user_id}:{int(time.time() // 60)}"
    count = redis.incr(key)
    if count == 1:
        redis.expire(key, 70)
    if count > settings.GEMINI_USER_RATE_PER_MIN:
        raise GeminiRateLimitError(
            f"User rate limit exceeded ({settings.GEMINI_USER_RATE_PER_MIN}/min)",
            retryable=True,
        )


# ── Service ─────────────────────────────────────────────────────────────────

class GeminiService:
    """Async wrapper around google-genai for video + image generation."""

    def __init__(self, redis: Redis | None = None):
        if not settings.GEMINI_API_KEY:
            raise GeminiConfigError("GEMINI_API_KEY is not configured")

        # Lazy import so unit tests can stub without installing the SDK
        from google import genai  # type: ignore

        self._genai = genai
        self._client = genai.Client(api_key=settings.GEMINI_API_KEY)

        from services.job_queue import redis_client as default_redis
        self._redis = redis or default_redis
        self._breaker = _Breaker(self._redis)

    # ── Image generation (Nano Banana / Gemini 2.5 Flash Image) ──────────

    async def generate_image(
        self,
        prompt: str,
        *,
        reference_images: list[bytes] | None = None,
        aspect_ratio: str = "1:1",
        user_id: str | None = None,
    ) -> ImageResult:
        """Text-to-image, or text+references (composition/style transfer)."""
        self._preflight(user_id)
        contents = self._build_image_contents(prompt, reference_images)
        config = self._build_image_config(aspect_ratio=aspect_ratio)

        result = await self._retry(
            lambda: self._call_generate_content(contents, config),
            op="generate_image",
        )
        return self._extract_image(result, count=1)

    async def edit_image(
        self,
        image_bytes: bytes,
        prompt: str,
        *,
        mask_bytes: bytes | None = None,
        user_id: str | None = None,
    ) -> ImageResult:
        """Inpaint / edit an existing image. Mask optional (full-image edit if None)."""
        self._preflight(user_id)
        parts = [prompt, self._to_pil(image_bytes)]
        if mask_bytes is not None:
            parts.append(self._to_pil(mask_bytes))
        config = self._build_image_config()

        result = await self._retry(
            lambda: self._call_generate_content(parts, config),
            op="edit_image",
        )
        return self._extract_image(result, count=1)

    async def compose_images(
        self,
        images: list[bytes],
        prompt: str,
        *,
        aspect_ratio: str = "1:1",
        user_id: str | None = None,
    ) -> ImageResult:
        """Multi-image composition — Nano Banana's flagship capability.

        Accepts up to 10 source images (model cap) without downscaling.
        """
        if not images:
            raise GeminiInvalidInputError("compose_images requires at least one image")
        if len(images) > 10:
            raise GeminiInvalidInputError("Nano Banana accepts up to 10 reference images")

        self._preflight(user_id)
        parts: list[Any] = [prompt]
        parts.extend(self._to_pil(b) for b in images)
        config = self._build_image_config(aspect_ratio=aspect_ratio)

        result = await self._retry(
            lambda: self._call_generate_content(parts, config),
            op="compose_images",
        )
        return self._extract_image(result, count=1)

    # ── Video generation (Veo 3.1) ───────────────────────────────────────

    async def generate_video(
        self,
        prompt: str,
        *,
        image_bytes: bytes | None = None,
        reference_image_bytes: list[bytes] | None = None,
        duration_sec: int | None = None,
        aspect_ratio: str | None = None,
        resolution: str | None = None,
        generate_audio: bool | None = None,
        negative_prompt: str | None = None,
        user_id: str | None = None,
        progress_cb: Optional[Callable[[int, str], Awaitable[None]]] = None,
    ) -> VideoResult:
        """Submit Veo 3.1 generation and poll until complete.

        Three input modes (mutually exclusive on Veo 3.1):
          - T2V: prompt only
          - I2V (first frame): image_bytes
          - Reference-driven (character/subject identity): reference_image_bytes
            (1–3 images of the same person/character/product)
        """
        if image_bytes is not None and reference_image_bytes:
            raise GeminiInvalidInputError(
                "Veo 3.1 rejects first-frame `image` and `reference_images` "
                "together — pass one or the other, not both.",
            )
        if reference_image_bytes is not None and not (1 <= len(reference_image_bytes) <= 3):
            raise GeminiInvalidInputError(
                "Veo 3.1 accepts 1–3 reference images per generation.",
            )

        self._preflight(user_id)

        duration = duration_sec or settings.GEMINI_DEFAULT_VIDEO_DURATION
        aspect = aspect_ratio or settings.GEMINI_DEFAULT_VIDEO_ASPECT
        res = resolution or settings.GEMINI_DEFAULT_VIDEO_RESOLUTION
        # Veo 3.1 always renders audio — ignore the incoming flag for pricing.
        audio = True

        config = self._build_video_config(
            duration=duration,
            aspect_ratio=aspect,
            resolution=res,
            generate_audio=audio,
            negative_prompt=negative_prompt,
            reference_image_bytes=reference_image_bytes,
        )

        kwargs: dict[str, Any] = {
            "model": settings.GEMINI_VEO_MODEL,
            "prompt": prompt,
            "config": config,
        }
        if image_bytes is not None:
            kwargs["image"] = self._to_genai_image(image_bytes)

        # Submit
        operation = await self._retry(
            lambda: asyncio.to_thread(self._client.models.generate_videos, **kwargs),
            op="submit_video",
        )

        # Poll long-running operation
        video_bytes = await self._poll_video(operation, progress_cb=progress_cb)

        return VideoResult(
            video_bytes=video_bytes,
            mime_type="video/mp4",
            duration_sec=float(duration),
            resolution=res,
            cost_usd=estimate_video_cost_usd(duration, audio),
        )

    # ── Structured text ──────────────────────────────────────────────────

    async def generate_structured_json(
        self,
        prompt: str,
        *,
        schema: dict | None = None,
        model: str = "gemini-2.5-flash",
        user_id: str | None = None,
    ) -> dict:
        """Text-only Gemini call that returns a JSON object.

        Uses response_mime_type=application/json so the model is forced to
        emit valid JSON. If a schema is passed it's wired through so fields
        are typed. No safety-first retry — caller handles errors.
        """
        from google.genai import types  # type: ignore

        self._preflight(user_id)
        config_kwargs: dict[str, Any] = {"response_mime_type": "application/json"}
        if schema is not None:
            config_kwargs["response_schema"] = schema
        config = types.GenerateContentConfig(**config_kwargs)

        result = await self._retry(
            lambda: asyncio.to_thread(
                self._client.models.generate_content,
                model=model,
                contents=prompt,
                config=config,
            ),
            op="generate_structured_json",
        )

        self._check_safety_block(result)
        text = getattr(result, "text", None)
        if not text:
            # Fallback: walk candidates → parts → text
            for cand in getattr(result, "candidates", []) or []:
                for part in getattr(getattr(cand, "content", None), "parts", []) or []:
                    t = getattr(part, "text", None)
                    if t:
                        text = t
                        break
                if text:
                    break
        if not text:
            raise GeminiTransientError("Gemini returned no text", retryable=True)

        import json as _json
        try:
            return _json.loads(text)
        except _json.JSONDecodeError as e:
            raise GeminiTransientError(f"Gemini JSON parse failed: {e}", retryable=False)

    # ── Internals ────────────────────────────────────────────────────────

    def _preflight(self, user_id: str | None):
        if self._breaker.check_open():
            raise GeminiBreakerOpenError(
                "Gemini provider is temporarily degraded — please retry shortly",
                retryable=True,
            )
        _check_user_rate(self._redis, user_id)

    def _build_image_contents(
        self, prompt: str, reference_images: list[bytes] | None
    ) -> list[Any]:
        parts: list[Any] = [prompt]
        if reference_images:
            parts.extend(self._to_pil(b) for b in reference_images)
        return parts

    def _build_image_config(self, *, aspect_ratio: str = "1:1"):
        from google.genai import types  # type: ignore
        # Nano Banana: no token cap, let the model emit at its native fidelity.
        return types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
            image_config=types.ImageConfig(aspect_ratio=aspect_ratio),
        )

    def _build_video_config(
        self,
        *,
        duration: int,
        aspect_ratio: str,
        resolution: str,
        generate_audio: bool,
        negative_prompt: str | None,
        reference_image_bytes: list[bytes] | None = None,
    ):
        from google.genai import types  # type: ignore
        # Veo 3.1 always generates synchronized audio — the API rejects a
        # `generate_audio` flag, so we silently drop it here. `generate_audio`
        # stays in our own request schema for forward-compat with future
        # Veo variants that may let you mute.
        kwargs: dict[str, Any] = dict(
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            duration_seconds=duration,
            number_of_videos=1,
            negative_prompt=negative_prompt,
        )
        if reference_image_bytes:
            kwargs["reference_images"] = [
                types.VideoGenerationReferenceImage(
                    image=self._to_genai_image(b),
                    reference_type="asset",
                )
                for b in reference_image_bytes
            ]
        return types.GenerateVideosConfig(**kwargs)

    async def _call_generate_content(self, contents: list[Any], config) -> Any:
        return await asyncio.to_thread(
            self._client.models.generate_content,
            model=settings.GEMINI_IMAGE_MODEL,
            contents=contents,
            config=config,
        )

    async def _poll_video(
        self,
        operation: Any,
        progress_cb: Optional[Callable[[int, str], Awaitable[None]]],
    ) -> bytes:
        attempts = 0
        start = time.time()
        while not getattr(operation, "done", False):
            if attempts >= settings.GEMINI_MAX_POLL_ATTEMPTS:
                raise GeminiTransientError(
                    f"Veo polling exceeded {settings.GEMINI_MAX_POLL_ATTEMPTS} attempts",
                    retryable=True,
                )
            await asyncio.sleep(settings.GEMINI_POLL_INTERVAL_SEC)
            attempts += 1

            try:
                operation = await asyncio.to_thread(self._client.operations.get, operation)
            except Exception as e:
                self._map_and_raise(e, op="poll_video")

            if progress_cb:
                # Veo operations don't expose a % — estimate from elapsed vs typical 3-5 min render.
                elapsed = time.time() - start
                pct = min(85, 10 + int(75 * min(elapsed / 240.0, 1.0)))
                await progress_cb(pct, f"Rendering video ({int(elapsed)}s)")

        # Veo operations sometimes finish with done=True but stuff the real
        # failure in operation.error. Surface it as the typed error class so the
        # caller can tell safety/quota/region apart from a true transient blip.
        op_error = getattr(operation, "error", None)
        if op_error is not None:
            err_code = getattr(op_error, "code", None)
            err_msg = getattr(op_error, "message", None) or str(op_error)
            details = {"google_code": err_code, "google_message": err_msg}
            lowered = (err_msg or "").lower()
            if "safety" in lowered or "blocked" in lowered or "policy" in lowered:
                raise GeminiSafetyError(
                    f"Veo blocked the generation: {err_msg}", details=details,
                )
            if "quota" in lowered:
                raise GeminiQuotaError(
                    f"Veo quota exhausted: {err_msg}", retryable=False, details=details,
                )
            if "invalid" in lowered or err_code in (3, 9):
                raise GeminiInvalidInputError(
                    f"Veo rejected the request: {err_msg}", retryable=False, details=details,
                )
            raise GeminiTransientError(
                f"Veo operation failed: {err_msg}", retryable=True, details=details,
            )

        response = getattr(operation, "response", None)
        if not response or not getattr(response, "generated_videos", None):
            # Surface safety reason if present
            self._check_safety_block(response)
            # Pull whatever the SDK exposes so the user gets a real signal.
            details = {
                "response_repr": repr(response)[:300] if response is not None else None,
                "rai_filtered_count": getattr(response, "rai_media_filtered_count", None),
                "rai_reasons": list(
                    getattr(response, "rai_media_filtered_reasons", []) or []
                ),
            }
            if details.get("rai_filtered_count"):
                raise GeminiSafetyError(
                    f"Veo filtered the output (RAI): {details['rai_reasons']}",
                    details=details,
                )
            raise GeminiTransientError(
                "Veo returned no video (operation done, response empty)",
                retryable=True, details=details,
            )

        generated = response.generated_videos[0]
        video_ref = getattr(generated, "video", None) or generated
        try:
            self._client.files.download(file=video_ref)
            video_bytes = getattr(video_ref, "video_bytes", None)
            if video_bytes is None:
                # Fallback: some SDK revisions stash bytes on `.data`
                video_bytes = getattr(video_ref, "data", None)
            if not video_bytes:
                raise GeminiTransientError("Veo video download returned empty bytes", retryable=True)
            return video_bytes
        except GeminiError:
            raise
        except Exception as e:
            self._map_and_raise(e, op="download_video")

    def _extract_image(self, response: Any, *, count: int) -> ImageResult:
        self._check_safety_block(response)
        candidates = getattr(response, "candidates", None) or []
        for cand in candidates:
            content = getattr(cand, "content", None)
            parts = getattr(content, "parts", []) if content else []
            for part in parts:
                inline = getattr(part, "inline_data", None)
                if inline and getattr(inline, "data", None):
                    raw = inline.data
                    if isinstance(raw, str):
                        raw = base64.b64decode(raw)
                    return ImageResult(
                        image_bytes=raw,
                        mime_type=getattr(inline, "mime_type", "image/png"),
                        prompt_feedback=self._extract_feedback(response),
                        cost_usd=estimate_image_cost_usd(count),
                    )
        raise GeminiTransientError("Gemini image response contained no image data", retryable=True)

    def _check_safety_block(self, response: Any):
        if response is None:
            return
        feedback = getattr(response, "prompt_feedback", None)
        if feedback and getattr(feedback, "block_reason", None):
            reason = feedback.block_reason
            raise GeminiSafetyError(
                f"Prompt blocked by Gemini safety filters: {reason}",
                details={"block_reason": str(reason)},
            )
        candidates = getattr(response, "candidates", None) or []
        for cand in candidates:
            finish = getattr(cand, "finish_reason", None)
            if finish and str(finish).upper() in ("SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST"):
                raise GeminiSafetyError(
                    f"Output blocked by Gemini safety filters: {finish}",
                    details={"finish_reason": str(finish)},
                )

    def _extract_feedback(self, response: Any) -> dict | None:
        feedback = getattr(response, "prompt_feedback", None)
        if not feedback:
            return None
        return {
            "block_reason": getattr(feedback, "block_reason", None),
            "safety_ratings": [str(r) for r in getattr(feedback, "safety_ratings", []) or []],
        }

    def _to_pil(self, image_bytes: bytes) -> Image.Image:
        """Convert raw bytes to PIL.Image without downscaling or re-encoding."""
        img = Image.open(BytesIO(image_bytes))
        img.load()
        return img

    def _to_genai_image(self, image_bytes: bytes):
        from google.genai import types  # type: ignore
        # Detect mime from magic bytes — don't re-encode.
        mime = "image/png"
        if image_bytes[:3] == b"\xff\xd8\xff":
            mime = "image/jpeg"
        elif image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
            mime = "image/png"
        elif image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP":
            mime = "image/webp"
        return types.Image(image_bytes=image_bytes, mime_type=mime)

    async def _retry(self, fn: Callable[[], Awaitable[Any]], *, op: str) -> Any:
        max_attempts = 4
        backoff = 1.5
        last_error: Optional[Exception] = None
        for attempt in range(1, max_attempts + 1):
            try:
                result = await fn()
                self._breaker.record_success()
                logger.info("gemini.%s ok (attempt=%d)", op, attempt)
                return result
            except GeminiError as e:
                last_error = e
                if not e.retryable or attempt == max_attempts:
                    self._breaker.record_failure()
                    raise
                await asyncio.sleep(backoff ** attempt)
            except Exception as e:
                try:
                    self._map_and_raise(e, op=op)
                except GeminiError as mapped:
                    last_error = mapped
                    if not mapped.retryable or attempt == max_attempts:
                        self._breaker.record_failure()
                        raise
                    await asyncio.sleep(backoff ** attempt)
        if last_error:
            raise last_error
        raise GeminiTransientError(f"gemini.{op} failed with no error", retryable=False)

    def _map_and_raise(self, exc: Exception, *, op: str):
        """Translate SDK/HTTP exceptions into our typed error taxonomy."""
        msg = str(exc)
        status = getattr(exc, "status_code", None) or getattr(exc, "code", None)
        lowered = msg.lower()

        if status == 429 or "quota" in lowered or "rate" in lowered:
            if "quota" in lowered:
                raise GeminiQuotaError(msg, retryable=False) from exc
            raise GeminiRateLimitError(msg, retryable=True) from exc
        if status in (400, 422) or "invalid" in lowered:
            raise GeminiInvalidInputError(msg, retryable=False) from exc
        if "safety" in lowered or "blocked" in lowered:
            raise GeminiSafetyError(msg, retryable=False) from exc
        if status and 500 <= int(status) < 600:
            raise GeminiTransientError(msg, retryable=True) from exc
        if isinstance(exc, (TimeoutError, asyncio.TimeoutError)):
            raise GeminiTransientError(msg, retryable=True) from exc
        # Default: treat unknown errors as transient once
        raise GeminiTransientError(msg, retryable=True) from exc


# ── Module-level singleton accessor ─────────────────────────────────────────

_service: GeminiService | None = None


def get_gemini_service() -> GeminiService:
    global _service
    if _service is None:
        _service = GeminiService()
    return _service


def reset_gemini_service():
    """Test hook — drop the cached instance."""
    global _service
    _service = None


# ── Utility: save bytes to the job's output directory ──────────────────────

def save_bytes_to_output(job_id: str, data: bytes, filename: str) -> str:
    """Persist generated bytes to the job's output directory and return the path."""
    output_dir = Path(settings.OUTPUT_PATH) / job_id
    output_dir.mkdir(parents=True, exist_ok=True)
    dest = output_dir / filename
    dest.write_bytes(data)
    return str(dest)
