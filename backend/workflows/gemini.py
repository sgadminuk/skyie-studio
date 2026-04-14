"""Gemini workflows — Veo 3.1 video + Nano Banana image generation.

Each execute function is called by a Celery task in job_queue.py and emits
progress via update_job().
"""
from __future__ import annotations

import logging
from pathlib import Path

from services.gemini_service import (
    GeminiError,
    GeminiSafetyError,
    get_gemini_service,
    save_bytes_to_output,
)
from services.job_queue import update_job
from services.storage_service import cleanup_temp

logger = logging.getLogger(__name__)


def _load_image_bytes(path: str) -> bytes:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Image not found: {path}")
    return p.read_bytes()


def _make_progress_cb(job_id: str):
    async def cb(pct: int, step: str):
        update_job(job_id, progress=pct, step=step)
    return cb


async def execute_gemini_image(job_id: str, params: dict) -> str:
    """Text-to-image or text+references via Nano Banana.

    Params:
        prompt: str
        reference_image_paths: list[str] (optional) — up to 10 for composition
        aspect_ratio: str (default "1:1")
    """
    prompt = params.get("prompt", "").strip()
    if not prompt:
        raise ValueError("prompt is required")

    aspect_ratio = params.get("aspect_ratio", "1:1")
    ref_paths = params.get("reference_image_paths") or []
    user_id = params.get("_user_id")

    update_job(job_id, progress=5, step="Preparing request")
    refs = [_load_image_bytes(p) for p in ref_paths] if ref_paths else None

    update_job(job_id, progress=20, step="Generating with Nano Banana")
    service = get_gemini_service()

    try:
        if refs and len(refs) > 1:
            result = await service.compose_images(
                refs, prompt, aspect_ratio=aspect_ratio, user_id=user_id
            )
        else:
            result = await service.generate_image(
                prompt,
                reference_images=refs,
                aspect_ratio=aspect_ratio,
                user_id=user_id,
            )
    except GeminiSafetyError as e:
        update_job(job_id, step=f"Blocked: {e}", error_code=e.code)
        raise

    update_job(job_id, progress=85, step="Saving image")
    ext = ".png" if "png" in result.mime_type else ".jpg"
    output_path = save_bytes_to_output(job_id, result.image_bytes, f"image{ext}")

    update_job(job_id, progress=100, step="Complete", cost_usd=result.cost_usd)
    return output_path


async def execute_gemini_image_edit(job_id: str, params: dict) -> str:
    """Inpaint / edit an existing image."""
    prompt = params.get("prompt", "").strip()
    source_path = params.get("source_image_path")
    mask_path = params.get("mask_image_path")
    user_id = params.get("_user_id")

    if not prompt or not source_path:
        raise ValueError("prompt and source_image_path are required")

    update_job(job_id, progress=10, step="Loading source image")
    source_bytes = _load_image_bytes(source_path)
    mask_bytes = _load_image_bytes(mask_path) if mask_path else None

    update_job(job_id, progress=25, step="Editing with Nano Banana")
    service = get_gemini_service()
    try:
        result = await service.edit_image(
            source_bytes, prompt, mask_bytes=mask_bytes, user_id=user_id
        )
    except GeminiSafetyError as e:
        update_job(job_id, step=f"Blocked: {e}", error_code=e.code)
        raise

    update_job(job_id, progress=85, step="Saving edited image")
    ext = ".png" if "png" in result.mime_type else ".jpg"
    output_path = save_bytes_to_output(job_id, result.image_bytes, f"edited{ext}")

    update_job(job_id, progress=100, step="Complete", cost_usd=result.cost_usd)
    return output_path


async def execute_gemini_video(job_id: str, params: dict) -> str:
    """Text-to-video or image-to-video via Veo 3.1.

    Params:
        prompt: str
        source_image_path: str (optional) — if provided, runs I2V
        duration_sec: int (default from settings, max quality)
        aspect_ratio: str
        resolution: str — "720p" or "1080p"
        generate_audio: bool
        negative_prompt: str (optional)
    """
    prompt = params.get("prompt", "").strip()
    if not prompt:
        raise ValueError("prompt is required")

    source_image_path = params.get("source_image_path")
    image_bytes = _load_image_bytes(source_image_path) if source_image_path else None
    user_id = params.get("_user_id")

    update_job(job_id, progress=5, step="Submitting to Veo 3.1")
    service = get_gemini_service()
    progress_cb = _make_progress_cb(job_id)

    try:
        result = await service.generate_video(
            prompt,
            image_bytes=image_bytes,
            duration_sec=params.get("duration_sec"),
            aspect_ratio=params.get("aspect_ratio"),
            resolution=params.get("resolution"),
            generate_audio=params.get("generate_audio"),
            negative_prompt=params.get("negative_prompt"),
            user_id=user_id,
            progress_cb=progress_cb,
        )
    except GeminiSafetyError as e:
        update_job(job_id, step=f"Blocked: {e}", error_code=e.code)
        raise
    except GeminiError as e:
        update_job(job_id, error_code=e.code)
        raise

    update_job(job_id, progress=92, step="Saving video")
    output_path = save_bytes_to_output(job_id, result.video_bytes, "video.mp4")

    update_job(
        job_id,
        progress=100,
        step="Complete",
        cost_usd=result.cost_usd,
    )

    # Cleanup any temp dir that the workflow may have created
    try:
        cleanup_temp(job_id)
    except Exception:
        pass

    logger.info(
        "gemini video complete: job=%s duration=%s res=%s cost_usd=%.4f",
        job_id, result.duration_sec, result.resolution, result.cost_usd,
    )
    return output_path
