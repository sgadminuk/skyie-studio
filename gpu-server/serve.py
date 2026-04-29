"""Skyie Forge — On-demand pod FastAPI shim.

Long-lived HTTP server for the on-demand pod variant of Skyie Forge.
Wraps the same FLUX/PuLID/LoRA logic as `handler.py` (which targets
RunPod Serverless) — but exposes it over HTTP so the backend can dispatch
jobs to a specific pod URL after the user clicks Connect.

On startup:
  1. Importing `handler` triggers the cold-start: FLUX-dev loads into VRAM
     against the network-volume HF cache.
  2. Self-registers with the Skyie backend via /api/internal/gpu-register
     so `gpu_client` can look up the pod's URL from Redis.
  3. Schedules a 60s heartbeat that re-posts the same registration —
     keeps the backend's "online" check fresh and detects soft death.

Endpoints:
  GET  /health           → liveness + VRAM/uptime/pod_id
  POST /run              → run one FLUX job; same payload shape as handler()
  GET  /pod/info         → pod identity (id, gpu, image)

Auth: every endpoint other than /health checks `X-API-Key` against
`GPU_API_KEY`. The backend's `gpu_client` already sends this header.
Skip the check entirely if `GPU_API_KEY` isn't set (single-user dev).
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager

import httpx
import uvicorn
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

# Side-effect import: this triggers `_load_pipeline()` at module load,
# so by the time we serve our first request FLUX is already warm.
import handler as _handler_module
from handler import handler as _handler_fn

logger = logging.getLogger("forge.serve")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# ── Config from env ──────────────────────────────────────────────────────────

PORT = int(os.environ.get("FORGE_SERVE_PORT", "8888"))
API_KEY = os.environ.get("GPU_API_KEY") or ""

# RunPod ought to set RUNPOD_POD_ID, but historically it's been flaky
# on container restarts. Fall back to the first 14 chars of the hostname
# (the proxy-URL convention RunPod itself uses).
def _detect_pod_id() -> str:
    explicit = os.environ.get("RUNPOD_POD_ID")
    if explicit:
        return explicit
    try:
        import socket
        return socket.gethostname()[:14]
    except Exception:
        return ""


POD_ID = _detect_pod_id()
BACKEND_URL = (os.environ.get("SKYIE_BACKEND_URL") or "https://api.skyie.studio").rstrip("/")
REG_KEY = os.environ.get("GPU_REGISTRATION_KEY") or ""

# RunPod's HTTPS proxy for an exposed port. Format the docs guarantee:
#   https://<pod_id>-<port>.proxy.runpod.net
# Override with FORGE_PUBLIC_URL if running behind a custom edge.
PUBLIC_URL = (
    os.environ.get("FORGE_PUBLIC_URL")
    or (f"https://{POD_ID}-{PORT}.proxy.runpod.net" if POD_ID else "")
)

HEARTBEAT_INTERVAL_SEC = int(os.environ.get("FORGE_HEARTBEAT_SEC", "60"))


# ── Auth helper ──────────────────────────────────────────────────────────────


def _check_key(x_api_key: str | None) -> None:
    """Reject unless the caller's `X-API-Key` matches GPU_API_KEY.

    If GPU_API_KEY is unset we accept anything — useful in dev, gated by
    network reachability in prod (only the backend has the proxy URL).
    """
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid GPU API key")


# ── Self-registration loop ──────────────────────────────────────────────────


async def _post_register(client: httpx.AsyncClient) -> tuple[bool, str]:
    """Single registration POST. Returns (ok, info_str). Errors are caught
    and reported, never raised — the heartbeat loop keeps retrying."""
    if not REG_KEY:
        return False, "GPU_REGISTRATION_KEY not set"
    if not PUBLIC_URL:
        return False, "PUBLIC_URL not resolvable (no RUNPOD_POD_ID)"
    try:
        r = await client.post(
            f"{BACKEND_URL}/api/internal/gpu-register",
            json={"gpu_url": PUBLIC_URL, "pod_id": POD_ID},
            headers={"X-GPU-Key": REG_KEY},
            timeout=10.0,
        )
    except Exception as e:
        return False, f"transport: {e}"
    if r.status_code == 200:
        return True, f"registered as {PUBLIC_URL}"
    return False, f"http {r.status_code}: {r.text[:200]}"


async def _heartbeat_forever() -> None:
    """Background task: re-register every HEARTBEAT_INTERVAL_SEC.

    Uses a single httpx client across iterations so the connection pool
    is reused. Catches every exception — if registration fails for any
    reason the next tick retries.
    """
    async with httpx.AsyncClient() as client:
        while True:
            ok, info = await _post_register(client)
            if ok:
                logger.debug("heartbeat ok: %s", info)
            else:
                logger.warning("heartbeat failed: %s", info)
            await asyncio.sleep(HEARTBEAT_INTERVAL_SEC)


# ── App ──────────────────────────────────────────────────────────────────────

_started_at = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: do the first registration synchronously so the user's
    Connect call doesn't see "ready" before the backend has the URL.
    Then kick off the heartbeat task. On shutdown we just let the task
    cancel — RunPod tears down the container.
    """
    async with httpx.AsyncClient() as client:
        ok, info = await _post_register(client)
    logger.info("Initial registration: ok=%s info=%s url=%s", ok, info, PUBLIC_URL)
    task = asyncio.create_task(_heartbeat_forever())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(title="Skyie Forge On-Demand Pod", lifespan=lifespan)


class RunRequest(BaseModel):
    """Mirrors `handler.py`'s expected `event["input"]` schema."""

    prompt: str = Field(..., min_length=1, max_length=4000)
    negative_prompt: str | None = None
    width: int = Field(default=1024, ge=512, le=2048)
    height: int = Field(default=1024, ge=512, le=2048)
    num_inference_steps: int = Field(default=28, ge=10, le=60)
    guidance_scale: float = Field(default=3.5, ge=0.0, le=10.0)
    seed: int | None = None
    reference_image_url: str | None = None
    id_weight: float = Field(default=1.0, ge=0.0, le=1.5)
    loras: list[dict] = Field(default_factory=list)


@app.get("/health")
async def health():
    """Liveness + a few useful telemetry fields. Auth-free so the
    backend's gpu_status endpoint can probe without a key."""
    try:
        import torch
        vram_used = torch.cuda.memory_allocated() / 1e9 if torch.cuda.is_available() else 0.0
        vram_total = (
            torch.cuda.get_device_properties(0).total_memory / 1e9
            if torch.cuda.is_available() else 0.0
        )
        gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu"
    except Exception:
        vram_used = vram_total = 0.0
        gpu_name = "unknown"

    return {
        "status": "ok",
        "uptime_seconds": int(time.time() - _started_at),
        "pod_id": POD_ID,
        "public_url": PUBLIC_URL,
        "gpu": gpu_name,
        "vram_used_gb": round(vram_used, 2),
        "vram_total_gb": round(vram_total, 2),
        "pipeline_loaded": getattr(_handler_module, "PIPE", None) is not None,
        "registered_with_backend": bool(REG_KEY),
    }


@app.post("/run")
async def run(
    req: RunRequest,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
):
    """Run one FLUX (+ optional PuLID + LoRA) job. Same input/output shape
    as `handler()` so existing serverless-mode tests/payloads work unchanged.
    """
    _check_key(x_api_key)
    payload = req.model_dump(exclude_none=False)
    # FLUX inference is GPU-bound and CPU-blocking inside diffusers — push
    # to a thread so the event loop stays responsive for /health probes.
    out = await asyncio.to_thread(_handler_fn, {"input": payload})
    if isinstance(out, dict) and out.get("error"):
        # Surface the error verbatim — 500 keeps the contract familiar to
        # the backend's existing GPUClientError flow.
        raise HTTPException(status_code=500, detail=out)
    return out


@app.get("/pod/info")
async def pod_info(x_api_key: str | None = Header(default=None, alias="X-API-Key")):
    _check_key(x_api_key)
    return {
        "pod_id": POD_ID,
        "public_url": PUBLIC_URL,
        "backend_url": BACKEND_URL,
        "heartbeat_interval_sec": HEARTBEAT_INTERVAL_SEC,
        "uptime_seconds": int(time.time() - _started_at),
    }


if __name__ == "__main__":
    # `0.0.0.0` so RunPod's port forwarder reaches us. log_config=None
    # keeps uvicorn from clobbering our root logger format.
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info", log_config=None)
