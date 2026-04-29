"""Forge platform routes — gated open-weights generation.

Every route under this router requires `require_forge_user`, which rejects
401/403 unless the caller has `forge_enabled=true` on their user row. This
is the API-side gate; Cloudflare Access on forge.skyie.studio is the
front-side gate. Either alone is sufficient; both together is defence in
depth.
"""
from __future__ import annotations

import uuid as uuid_mod

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import require_forge_user
from db.base import get_session
from db.models import User
from services import forge_pod_manager
from services.credit_service import check_credits, get_credit_cost, reserve_credits
from services.job_queue import (
    create_job,
    find_job_by_idempotency_key,
    run_forge_image_task,
)
from services.runpod_pods import RunPodPodsCapacityError, RunPodPodsError

router = APIRouter(prefix="/api/v1/forge", tags=["forge"])


@router.get("/status")
async def forge_status(user: User = Depends(require_forge_user)) -> dict:
    """Cheap readiness probe — the request itself proves the gate is live."""
    return {
        "enabled": True,
        "user_id": str(user.id),
        "email": user.email,
        "credits": user.credits,
    }


# ── Forge image (FLUX-dev + optional PuLID + LoRA) ──────────────────────────


class ForgeLora(BaseModel):
    url: str
    weight: float = Field(default=1.0, ge=-2.0, le=2.0)
    name: str | None = None


class ForgeImageRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4000)
    negative_prompt: str | None = Field(default=None, max_length=2000)
    width: int = Field(default=1024, ge=512, le=2048)
    height: int = Field(default=1024, ge=512, le=2048)
    num_inference_steps: int = Field(default=28, ge=10, le=60)
    guidance_scale: float = Field(default=3.5, ge=0.0, le=10.0)
    seed: int | None = None
    reference_image_url: str | None = None
    id_weight: float = Field(default=1.0, ge=0.0, le=1.5)
    loras: list[ForgeLora] = Field(default_factory=list, max_length=3)


@router.post("/generate/image")
async def generate_forge_image(
    request: ForgeImageRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    user: User = Depends(require_forge_user),
    session: AsyncSession = Depends(get_session),
):
    """Generate one image via FLUX-dev on the user's connected on-demand pod.

    Requires a `ready` ForgeSession (clicked Connect) tied to a `ready` pod.
    Identity-preservation (PuLID) kicks in if `reference_image_url` is set;
    LoRAs fuse on top regardless.
    """
    # Gate on connected GPU. Without this, jobs queue forever waiting for a
    # worker that doesn't exist.
    state = await forge_pod_manager.status(session, user.id)
    pod = state.get("pod")
    sess = state.get("session")
    if not sess or sess.get("status") != "active":
        raise HTTPException(
            status_code=412,
            detail="Connect a GPU first — click Connect in the Forge header.",
        )
    if not pod or pod.get("status") != "ready":
        raise HTTPException(
            status_code=412,
            detail=(
                "GPU is still warming up. Wait for the pill to turn green then retry."
                if pod else "No GPU connected — click Connect."
            ),
        )

    if idempotency_key:
        existing = find_job_by_idempotency_key(str(user.id), idempotency_key)
        if existing:
            return {
                "job_id": existing["id"],
                "workflow": existing["workflow"],
                "status": existing.get("status", "queued"),
                "idempotent_replay": True,
            }

    params = request.model_dump()
    params["_user_id"] = str(user.id)

    cost = get_credit_cost("forge_image", params)
    if not await check_credits(session, user.id, cost):
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient credits. Need {cost}, have {user.credits}",
        )

    job_id = create_job(
        "forge_image", params, user_id=str(user.id),
        provider="forge_runpod", model="flux-dev",
        idempotency_key=idempotency_key,
    )
    await reserve_credits(
        session, user.id, cost, job_id=uuid_mod.UUID(job_id),
        description=f"Forge image ({request.width}x{request.height})",
    )
    run_forge_image_task.delay(job_id, params)
    return {
        "job_id": job_id,
        "workflow": "forge_image",
        "provider": "forge_runpod",
        "model": "flux-dev",
        "status": "queued",
        "credits_used": cost,
    }


# ── Pod lifecycle: Connect / Status / Disconnect / Heartbeat ────────────────


@router.post("/pod/connect")
async def pod_connect(
    user: User = Depends(require_forge_user),
    session: AsyncSession = Depends(get_session),
):
    """Idempotent. Joins an existing pod if one is healthy, or spins up a
    new on-demand pod (RunPod GraphQL `podFindAndDeployOnDemand`) and creates
    a session row tied to it. UI shows a provisioning spinner until the pod
    self-registers.
    """
    try:
        return await forge_pod_manager.connect(session, user.id)
    except RunPodPodsCapacityError as e:
        raise HTTPException(
            status_code=503,
            detail=f"All preferred GPU types are out of stock. {e}",
        )
    except RunPodPodsError as e:
        raise HTTPException(status_code=502, detail=f"Pod deploy failed: {e}")


@router.get("/pod/status")
async def pod_status(
    user: User = Depends(require_forge_user),
    session: AsyncSession = Depends(get_session),
):
    """Lightweight poll target for the Forge UI. Safe to call every few
    seconds while the pod is provisioning."""
    return await forge_pod_manager.status(session, user.id)


@router.post("/pod/disconnect")
async def pod_disconnect(
    user: User = Depends(require_forge_user),
    session: AsyncSession = Depends(get_session),
):
    """End the user's session. The pod stays alive until no sessions remain
    (so other users on the same shared pod aren't dropped); the reaper
    terminates it after FORGE_POD_IDLE_MIN of being empty."""
    return await forge_pod_manager.disconnect(session, user.id)


@router.post("/pod/heartbeat")
async def pod_heartbeat(
    user: User = Depends(require_forge_user),
    session: AsyncSession = Depends(get_session),
):
    """Bump session activity to defer the idle-session reaper. The frontend
    pings this every ~30s while the tab is visible."""
    return await forge_pod_manager.heartbeat(session, user.id)
