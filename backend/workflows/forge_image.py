"""Workflow — Forge image generation (FLUX-dev + optional PuLID + LoRA).

Lives behind the Forge gate (require_forge_user) and the Connect-GPU
gate (require an active ForgeSession + ready ForgePod). Dispatches the
job to the user's currently-connected on-demand pod via the FastAPI
shim's `POST /run` endpoint.

Why on-demand vs. RunPod Serverless: the EUR-IS-1 datacenter ran out of
serverless GPU stock at the tiers we need; on-demand pods can fall over
to a list of GPU types per deploy and the same network volume keeps the
HF cache warm across pods. See `services/runpod_pods.py` for the deploy
side.

The handler decodes the response (base64 PNG) and writes it to the same
`/app/assets/generated/<job_id>/` location every other workflow uses, so
download/gallery code stays unchanged.
"""
from __future__ import annotations

import base64
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import ForgePod, ForgeSession
from services.forge_pod_client import ForgePodClientError, run_image
from services.gemini_service import save_bytes_to_output
from services.job_queue import _sync_engine, update_job

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class _ResolvedPod:
    id: uuid.UUID
    runpod_pod_id: str
    registered_url: str


def _resolve_pod_for_user(user_id: str) -> _ResolvedPod:
    """Look up the active session for `user_id` and return its bound pod.

    Returns a frozen dataclass with just the fields the caller needs, so
    we don't leak detached SQLAlchemy objects out of the session scope.

    Raises RuntimeError with a UI-friendly message if:
      - no active session (user clicked Connect, then it expired/disconnected)
      - the session's pod is no longer ready (terminated/failed)
      - the pod hasn't registered yet (rare race — Connect → submit < boot)
    """
    with Session(_sync_engine) as db:
        sess = db.execute(
            select(ForgeSession)
            .where(ForgeSession.user_id == user_id, ForgeSession.status == "active")
            .order_by(ForgeSession.started_at.desc())
            .limit(1)
        ).scalar_one_or_none()

        if not sess:
            raise RuntimeError(
                "No active GPU session — click Connect in the Forge header to spin up a pod.",
            )
        if not sess.pod_id:
            raise RuntimeError(
                "Session has no pod attached — click Disconnect, then Connect again.",
            )

        pod = db.get(ForgePod, sess.pod_id)
        if not pod:
            raise RuntimeError(
                "Session's pod was terminated. Click Connect again to provision a fresh one.",
            )
        if pod.status != "ready":
            raise RuntimeError(
                f"Pod is in status={pod.status}. "
                "Wait for the green pill in the header, or click Disconnect → Connect to reset.",
            )
        if not pod.registered_url:
            raise RuntimeError(
                "Pod is ready but hasn't published its URL yet. Wait a few seconds and retry.",
            )

        # Bump last_activity_at so the reaper doesn't expire the session
        # mid-job. The worker may take 30+s for first-job-after-Connect.
        sess.last_activity_at = datetime.now(timezone.utc)
        db.commit()

        return _ResolvedPod(
            id=pod.id,
            runpod_pod_id=pod.runpod_pod_id,
            registered_url=pod.registered_url,
        )


def _bump_pod_last_job(pod_id: uuid.UUID) -> None:
    """Mark `last_job_at = now` so the reaper grace window resets."""
    with Session(_sync_engine) as db:
        pod = db.get(ForgePod, pod_id)
        if pod:
            pod.last_job_at = datetime.now(timezone.utc)
            db.commit()


async def execute_forge_image(job_id: str, params: dict) -> str:
    """Generate one Forge image via the user's connected on-demand pod.

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
        _user_id: str (injected by the route handler)
    """
    user_id = params.get("_user_id")
    if not user_id:
        raise RuntimeError("Internal error: _user_id missing from forge_image params")

    prompt = (params.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("prompt is required")

    update_job(job_id, progress=2, step="Locating connected GPU")
    try:
        pod = _resolve_pod_for_user(user_id)
    except RuntimeError:
        update_job(job_id, error_code="forge_no_pod")
        raise

    pod_url = pod.registered_url
    pod_uuid = pod.id

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

    update_job(job_id, progress=15, step=f"Dispatching to pod {pod.runpod_pod_id[:10]}")
    _bump_pod_last_job(pod_uuid)

    try:
        output = await run_image(pod_url, payload)
    except ForgePodClientError as e:
        update_job(
            job_id,
            error_code="forge_pod_transport" if e.retryable else "forge_pod_error",
        )
        raise RuntimeError(f"Forge pod call failed: {e}") from e

    # Mark the post-job idle window from completion time (not start time)
    # so a long PuLID job doesn't cause the reaper to fire 1s after it ends.
    _bump_pod_last_job(pod_uuid)

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
        "forge_image complete: job=%s seed=%s size=%sx%s pod=%s",
        job_id, seed, width, height, pod.runpod_pod_id,
    )
    return output_path
