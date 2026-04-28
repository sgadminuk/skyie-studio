"""Thin async client for RunPod Serverless endpoints.

Fronts the `/run` and `/status/{id}` REST endpoints with a typed async
interface so workflow code doesn't have to deal with the polling loop or
authentication header shape.

Public surface:
  - RunPodServerlessError: base exception
  - run_and_wait(endpoint_id, payload, ...) -> dict        # async polling
  - run_async(endpoint_id, payload) -> str                 # returns job id
  - get_status(endpoint_id, job_id) -> dict
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Awaitable, Callable, Optional

import httpx

from config import settings

logger = logging.getLogger(__name__)


class RunPodServerlessError(Exception):
    """Base error for RunPod serverless calls."""

    def __init__(self, message: str, *, retryable: bool = False, details: dict | None = None):
        super().__init__(message)
        self.retryable = retryable
        self.details = details or {}


class RunPodConfigError(RunPodServerlessError):
    """Missing RUNPOD_API_KEY or endpoint id."""


class RunPodTransportError(RunPodServerlessError):
    """Network / HTTP error talking to RunPod."""


class RunPodJobError(RunPodServerlessError):
    """The job ran but the worker returned an error payload."""


def _base_url(endpoint_id: str) -> str:
    return f"https://api.runpod.ai/v2/{endpoint_id}"


def _headers() -> dict[str, str]:
    if not settings.RUNPOD_API_KEY:
        raise RunPodConfigError("RUNPOD_API_KEY is not configured")
    return {
        "Authorization": f"Bearer {settings.RUNPOD_API_KEY}",
        "Content-Type": "application/json",
    }


async def run_async(endpoint_id: str, payload: dict[str, Any]) -> str:
    """Submit a job and return the RunPod job id (no waiting)."""
    if not endpoint_id:
        raise RunPodConfigError("endpoint_id is required")
    url = f"{_base_url(endpoint_id)}/run"
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            r = await client.post(url, json={"input": payload}, headers=_headers())
        except httpx.HTTPError as e:
            raise RunPodTransportError(str(e), retryable=True) from e
    if r.status_code >= 500:
        raise RunPodTransportError(
            f"RunPod returned {r.status_code}: {r.text[:300]}", retryable=True,
        )
    if r.status_code == 401:
        raise RunPodConfigError("RUNPOD_API_KEY rejected (401)")
    if r.status_code != 200:
        raise RunPodJobError(
            f"RunPod /run returned {r.status_code}: {r.text[:300]}",
            retryable=False,
        )
    body = r.json()
    job_id = body.get("id")
    if not job_id:
        raise RunPodJobError(f"RunPod /run gave no job id: {body!r}")
    return job_id


async def get_status(endpoint_id: str, job_id: str) -> dict[str, Any]:
    """Fetch the latest status of a queued/running/completed job."""
    url = f"{_base_url(endpoint_id)}/status/{job_id}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            r = await client.get(url, headers=_headers())
        except httpx.HTTPError as e:
            raise RunPodTransportError(str(e), retryable=True) from e
    if r.status_code >= 500:
        raise RunPodTransportError(
            f"RunPod returned {r.status_code}: {r.text[:300]}", retryable=True,
        )
    if r.status_code != 200:
        raise RunPodJobError(
            f"RunPod /status returned {r.status_code}: {r.text[:300]}",
            retryable=False,
        )
    return r.json()


async def run_and_wait(
    endpoint_id: str,
    payload: dict[str, Any],
    *,
    timeout_sec: Optional[int] = None,
    poll_interval: Optional[int] = None,
    progress_cb: Optional[Callable[[str, Optional[int]], Awaitable[None]]] = None,
) -> dict[str, Any]:
    """Submit a job and poll until it completes, fails, or times out.

    Returns the worker's `output` payload on success. Raises RunPodJobError
    if the worker returned an `error` field, or RunPodTransportError on a
    timeout / repeated polling failure.
    """
    timeout_sec = timeout_sec or settings.RUNPOD_REQUEST_TIMEOUT
    poll_interval = poll_interval or settings.RUNPOD_POLL_INTERVAL_SEC

    job_id = await run_async(endpoint_id, payload)
    logger.info("RunPod[%s] queued job=%s", endpoint_id, job_id)

    start = time.time()
    last_status = ""
    while True:
        if time.time() - start > timeout_sec:
            raise RunPodTransportError(
                f"RunPod job {job_id} timed out after {timeout_sec}s",
                retryable=True, details={"job_id": job_id},
            )

        try:
            status = await get_status(endpoint_id, job_id)
        except RunPodTransportError as e:
            # Transient — pause and try again until timeout.
            logger.warning("RunPod status poll failed (will retry): %s", e)
            await asyncio.sleep(poll_interval)
            continue

        cur = status.get("status", "")
        if cur != last_status:
            last_status = cur
            logger.info("RunPod[%s] job=%s status=%s", endpoint_id, job_id, cur)
            if progress_cb:
                # Map RunPod status to a pct hint for UI streaming.
                pct = {
                    "IN_QUEUE": 5,
                    "IN_PROGRESS": 30,
                    "COMPLETED": 95,
                    "FAILED": None,
                    "CANCELLED": None,
                    "TIMED_OUT": None,
                }.get(cur)
                await progress_cb(cur, pct)

        if cur == "COMPLETED":
            output = status.get("output") or {}
            if isinstance(output, dict) and output.get("error"):
                raise RunPodJobError(
                    output["error"], details={"job_id": job_id, "traceback": output.get("traceback")},
                )
            return output
        if cur in ("FAILED", "CANCELLED", "TIMED_OUT"):
            raise RunPodJobError(
                f"RunPod job {job_id} ended with status={cur}",
                details={"job_id": job_id, "raw": status},
            )

        await asyncio.sleep(poll_interval)
