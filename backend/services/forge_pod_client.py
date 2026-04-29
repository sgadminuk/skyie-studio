"""Thin async client for the Forge on-demand pod's /run endpoint.

Distinct from `runpod_serverless` (talks to RunPod's queue-based serverless
endpoints) and `gpu_client` (which expects the legacy upload/download/poll
contract). The Forge on-demand pod runs `serve.py`, a FastAPI shim with a
single `POST /run` that mirrors `handler.py`'s input/output shape.

Public surface:
  - run_image(pod_url, payload, *, timeout, api_key) -> dict
  - ForgePodClientError + retryable transport variant
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from config import settings

logger = logging.getLogger(__name__)


class ForgePodClientError(Exception):
    """Base error for /run dispatch."""

    def __init__(self, message: str, *, retryable: bool = False, status_code: int | None = None):
        super().__init__(message)
        self.retryable = retryable
        self.status_code = status_code


async def run_image(
    pod_url: str,
    payload: dict[str, Any],
    *,
    timeout: float | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    """POST `payload` to `<pod_url>/run`. Returns the worker's JSON response.

    The pod's FastAPI shim runs FLUX inference synchronously inside `/run`
    (the diffusers pipeline blocks on the GPU). Generation is ~6-10s for
    a 1024² image at 28 steps; the timeout default leaves comfortable
    headroom for PuLID + multi-LoRA jobs.

    Raises:
        ForgePodClientError(retryable=True) on transport / 5xx errors.
        ForgePodClientError(retryable=False) on 4xx, malformed payload,
            or an explicit `error` field in the worker response.
    """
    if not pod_url:
        raise ForgePodClientError("pod_url is empty — pod has not registered yet")

    timeout = timeout if timeout is not None else float(settings.GPU_TIMEOUT_SECONDS)
    headers = {"Content-Type": "application/json"}
    key = api_key or settings.GPU_API_KEY
    if key:
        headers["X-API-Key"] = key

    url = pod_url.rstrip("/") + "/run"
    logger.info("Forge pod /run dispatch: url=%s prompt[:60]=%r", url, (payload.get("prompt") or "")[:60])

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(url, json=payload, headers=headers)
    except httpx.TimeoutException as e:
        raise ForgePodClientError(
            f"Forge pod did not respond within {timeout}s: {e}",
            retryable=True,
        ) from e
    except httpx.HTTPError as e:
        raise ForgePodClientError(f"Forge pod transport error: {e}", retryable=True) from e

    if r.status_code >= 500:
        raise ForgePodClientError(
            f"Forge pod returned {r.status_code}: {r.text[:300]}",
            retryable=True,
            status_code=r.status_code,
        )
    if r.status_code == 401:
        raise ForgePodClientError(
            "Forge pod rejected GPU_API_KEY (401)",
            retryable=False,
            status_code=401,
        )
    if r.status_code != 200:
        raise ForgePodClientError(
            f"Forge pod returned {r.status_code}: {r.text[:300]}",
            retryable=False,
            status_code=r.status_code,
        )

    try:
        body = r.json()
    except Exception as e:
        raise ForgePodClientError(f"Forge pod returned non-JSON: {e}") from e

    if isinstance(body, dict) and body.get("error"):
        # Worker explicitly reported a job-level error (FLUX OOM, bad LoRA URL, etc.)
        raise ForgePodClientError(
            f"Forge worker error: {body['error']}",
            retryable=False,
        )
    return body


async def health(pod_url: str, *, timeout: float = 8.0) -> dict[str, Any]:
    """Lightweight liveness probe. Auth-free on the pod side so we can
    call this from any context (Connect screen, reaper, status route)."""
    if not pod_url:
        raise ForgePodClientError("pod_url is empty")
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.get(pod_url.rstrip("/") + "/health")
    if r.status_code != 200:
        raise ForgePodClientError(
            f"Health check returned {r.status_code}: {r.text[:200]}",
            status_code=r.status_code,
        )
    return r.json()
