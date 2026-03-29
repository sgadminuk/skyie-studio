"""GPU self-registration and status endpoints."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from config import settings
from services.job_queue import redis_client

logger = logging.getLogger(__name__)

GPU_REDIS_PREFIX = "skyie:gpu:"

# ── Internal (called by the GPU pod) ────────────────────────────────────────

router_internal = APIRouter(prefix="/api/internal", tags=["gpu-internal"])


class GPURegisterRequest(BaseModel):
    gpu_url: str
    pod_id: str = ""


@router_internal.post("/gpu-register")
async def register_gpu(
    request: GPURegisterRequest,
    x_gpu_key: str = Header(...),
):
    """Called by the GPU pod on boot and every heartbeat."""
    if not settings.GPU_REGISTRATION_KEY or x_gpu_key != settings.GPU_REGISTRATION_KEY:
        raise HTTPException(status_code=401, detail="Invalid GPU registration key")

    now = datetime.now(timezone.utc).isoformat()
    redis_client.set(f"{GPU_REDIS_PREFIX}url", request.gpu_url)
    redis_client.set(f"{GPU_REDIS_PREFIX}registered_at", now)
    redis_client.set(f"{GPU_REDIS_PREFIX}pod_id", request.pod_id)

    logger.info("GPU registered: %s (pod: %s)", request.gpu_url, request.pod_id)
    return {"status": "registered", "gpu_url": request.gpu_url, "registered_at": now}


# ── Public (called by the frontend) ─────────────────────────────────────────

router_public = APIRouter(prefix="/api/v1", tags=["gpu-status"])


@router_public.get("/gpu-status")
async def gpu_status():
    """Return the current GPU server status."""
    gpu_url = redis_client.get(f"{GPU_REDIS_PREFIX}url")
    registered_at = redis_client.get(f"{GPU_REDIS_PREFIX}registered_at")
    pod_id = redis_client.get(f"{GPU_REDIS_PREFIX}pod_id")

    if not gpu_url or not registered_at:
        return {"online": False, "reason": "no_gpu_registered"}

    # Check heartbeat freshness
    last_seen = datetime.fromisoformat(registered_at)
    age_seconds = (datetime.now(timezone.utc) - last_seen).total_seconds()

    if age_seconds > settings.GPU_HEARTBEAT_TIMEOUT:
        return {
            "online": False,
            "reason": "heartbeat_expired",
            "gpu_url": gpu_url,
            "pod_id": pod_id,
            "last_seen": registered_at,
            "age_seconds": round(age_seconds),
        }

    # GPU is online — optionally probe for richer data
    gpu_health = None
    try:
        import httpx

        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{gpu_url.rstrip('/')}/health")
            if resp.status_code == 200:
                gpu_health = resp.json()
    except Exception:
        pass  # probe failed, but heartbeat is fresh so still "online"

    return {
        "online": True,
        "gpu_url": gpu_url,
        "pod_id": pod_id,
        "last_seen": registered_at,
        "age_seconds": round(age_seconds),
        "health": gpu_health,
    }
