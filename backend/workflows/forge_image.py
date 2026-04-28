"""Workflow — Forge image generation (FLUX-dev + optional PuLID + LoRA).

Lives behind the Forge gate (require_forge_user). Routes the prompt to a
RunPod Serverless endpoint that has FLUX.1-dev baked into its Docker image.
The handler decodes the response (base64 PNG) and writes it to the same
`/app/assets/generated/<job_id>/` location every other workflow uses, so
download/gallery code stays unchanged.
"""
from __future__ import annotations

import base64
import logging

from config import settings
from services.job_queue import update_job
from services.runpod_serverless import (
    RunPodConfigError,
    RunPodJobError,
    RunPodServerlessError,
    run_and_wait,
)
from services.gemini_service import save_bytes_to_output

logger = logging.getLogger(__name__)


async def execute_forge_image(job_id: str, params: dict) -> str:
    """Generate one Forge image via RunPod Serverless.

    Params:
        prompt: str (required)
        negative_prompt: str | None
        width: int (default 1024)
        height: int (default 1024)
        num_inference_steps: int (default 28)
        guidance_scale: float (default 3.5)
        seed: int | None
        reference_image_url: str | None  → triggers PuLID identity mode
        id_weight: float (default 1.0)
        loras: list[{url, weight, name?}]
    """
    if not settings.RUNPOD_FORGE_IMAGE_ENDPOINT_ID:
        raise RunPodConfigError(
            "RUNPOD_FORGE_IMAGE_ENDPOINT_ID is not set — the Forge image worker "
            "endpoint hasn't been deployed or wired into the backend yet.",
        )

    prompt = (params.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("prompt is required")

    payload = {
        "prompt": prompt,
        "negative_prompt": params.get("negative_prompt") or None,
        "width": int(params.get("width") or 1024),
        "height": int(params.get("height") or 1024),
        "num_inference_steps": int(params.get("num_inference_steps") or 28),
        "guidance_scale": float(params.get("guidance_scale") or 3.5),
        "seed": params.get("seed"),
        "reference_image_url": params.get("reference_image_url") or None,
        "id_weight": float(params.get("id_weight") or 1.0),
        "loras": params.get("loras") or [],
    }

    update_job(job_id, progress=5, step="Submitting to GPU worker")

    async def progress_cb(status: str, pct):
        if pct is not None:
            update_job(job_id, progress=pct, step=f"GPU worker: {status.lower()}")
        else:
            update_job(job_id, step=f"GPU worker: {status.lower()}")

    try:
        output = await run_and_wait(
            settings.RUNPOD_FORGE_IMAGE_ENDPOINT_ID,
            payload,
            progress_cb=progress_cb,
        )
    except RunPodJobError as e:
        # Worker returned an explicit error string — surface it to the UI.
        update_job(job_id, error_code="forge_worker_error")
        raise RuntimeError(f"Forge worker error: {e}") from e
    except RunPodServerlessError as e:
        update_job(job_id, error_code="forge_transport")
        raise

    image_b64 = (output or {}).get("image_b64")
    if not image_b64:
        raise RuntimeError(
            f"Forge worker returned no image_b64. raw={str(output)[:200]}",
        )

    update_job(job_id, progress=95, step="Saving image")
    image_bytes = base64.b64decode(image_b64)
    output_path = save_bytes_to_output(job_id, image_bytes, "image.png")

    seed = output.get("seed")
    width = output.get("width")
    height = output.get("height")
    update_job(
        job_id,
        progress=100,
        step="Complete",
        params={**params, "_seed": seed, "_width": width, "_height": height},
    )
    logger.info(
        "forge_image complete: job=%s seed=%s size=%sx%s",
        job_id, seed, width, height,
    )
    return output_path
