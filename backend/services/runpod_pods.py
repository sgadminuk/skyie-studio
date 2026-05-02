"""Async client for RunPod on-demand pods (REST `/v1/pods`).

Distinct from `runpod_serverless.py` (talks to RunPod *Serverless*
endpoints). This module manages **on-demand pods** — a pod is rented by
the hour, runs a long-lived FastAPI server (`serve.py` from the network
volume), and is torn down when no Forge users are connected.

Why REST and not GraphQL: RunPod's documented public API is the REST
interface at `https://rest.runpod.io/v1/pods`. It natively supports a
fallback list (`gpuTypeIds: [..]` plus `gpuTypePriority: "availability"`)
which replaces the manual loop the previous GraphQL implementation did.
The GraphQL endpoint is undocumented and partially mismatches the schema
RunPod actually serves (e.g., `env` returns `[String]`, not the input
shape of `[{key,value}]`).

Public surface:
  - deploy_pod(...) -> PodInfo
  - terminate_pod(pod_id) -> None
  - get_pod(pod_id) -> PodInfo | None
  - PodInfo dataclass (id, status, gpu_type_id, public_ip, ports,
    runtime_uptime_sec, ...)
  - RunPodPodsError + subtypes for transport / config / capacity failures
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Optional

import httpx

from config import settings

logger = logging.getLogger(__name__)


# ── Errors ───────────────────────────────────────────────────────────────────


class RunPodPodsError(Exception):
    """Base error for on-demand pod operations."""

    def __init__(self, message: str, *, retryable: bool = False, details: dict | None = None):
        super().__init__(message)
        self.retryable = retryable
        self.details = details or {}


class RunPodPodsConfigError(RunPodPodsError):
    """Missing API key or template config."""


class RunPodPodsTransportError(RunPodPodsError):
    """Network / HTTP error talking to RunPod REST."""


class RunPodPodsCapacityError(RunPodPodsError):
    """No GPU stock available for any of the requested types."""


# ── Defaults ─────────────────────────────────────────────────────────────────

# RunPod gpu type ids exactly as returned by the GPU types catalog.
# Order is the *preference* — RunPod's REST API will pick whichever has
# stock when `gpuTypePriority` is "availability" (the default).
#
# NOTE: the dashboard's "RTX PRO 6000" tile maps to *Server Edition* — the
# Workstation Edition is a separate, lower-stock SKU. Listing both means
# we land on the Blackwell 96 GB tier whichever variant has stock today.
DEFAULT_GPU_FALLBACK = [
    "NVIDIA RTX PRO 6000 Blackwell Server Edition",
    "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
    "NVIDIA A100-SXM4-80GB",
    "NVIDIA H100 NVL",
    "NVIDIA GeForce RTX 5090",
]

# Defaults matching what the volume bootstrap pre-stages on the volume.
DEFAULT_DATACENTER = "EUR-IS-1"
DEFAULT_VOLUME_ID = "7muboz2qp0"
DEFAULT_VOLUME_MOUNT = "/runpod-volume"
DEFAULT_CONTAINER_DISK_GB = 50
DEFAULT_GPU_COUNT = 1
DEFAULT_PORTS = ["8888/http", "22/tcp"]  # FastAPI shim on 8888, ssh for debug
# Public RunPod-hosted base image. Pulls in seconds (RunPod mirrors it
# on its own infra). The actual app code lives on the network volume
# at /runpod-volume/forge-app/ and the dockerStartCmd boots it.
DEFAULT_IMAGE = "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04"
DEFAULT_DOCKER_START_CMD = ["bash", "/runpod-volume/forge-app/startup.sh"]

REST_BASE = "https://rest.runpod.io/v1"


# ── Types ────────────────────────────────────────────────────────────────────


@dataclass
class PodInfo:
    """Snapshot of an on-demand pod's lifecycle state."""

    id: str
    name: str
    status: str  # CREATED, RUNNING, EXITED, TERMINATED, …
    desired_status: str
    gpu_type_id: str | None
    image_name: str | None
    public_ip: str | None
    runtime_uptime_seconds: int | None
    cost_per_hr: float | None
    ports: list[dict] | None  # [{ip, isIpPublic, privatePort, publicPort, type}, ...]
    raw: dict[str, Any]

    @property
    def public_url(self) -> str | None:
        """Best-effort public URL for the pod's HTTP port (8888).

        RunPod exposes a managed HTTPS proxy at:
            https://<pod_id>-<internal_port>.proxy.runpod.net
        The `runtime.ports` list confirms the binding once the pod is up.
        We use the proxy URL even before runtime is populated because
        it's deterministic from `pod_id`.
        """
        return f"https://{self.id}-8888.proxy.runpod.net"


# ── Transport ────────────────────────────────────────────────────────────────


def _api_key() -> str:
    if not settings.RUNPOD_API_KEY:
        raise RunPodPodsConfigError("RUNPOD_API_KEY is not configured")
    return settings.RUNPOD_API_KEY


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_api_key()}",
        "Content-Type": "application/json",
        "User-Agent": "skyie-forge-pod-manager/2.0",
    }


async def _rest(
    method: str,
    path: str,
    *,
    json: dict[str, Any] | None = None,
    timeout: float = 30.0,
) -> dict[str, Any]:
    """One REST call. Returns the parsed JSON response. Raises on error."""
    url = f"{REST_BASE}{path}"
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            r = await client.request(method, url, json=json, headers=_headers())
        except httpx.HTTPError as e:
            raise RunPodPodsTransportError(str(e), retryable=True) from e

    if r.status_code == 401:
        raise RunPodPodsConfigError("RUNPOD_API_KEY rejected (401)")
    if r.status_code in (204, 200, 201):
        try:
            return r.json() if r.content else {}
        except Exception:
            return {}
    if r.status_code == 404:
        raise RunPodPodsError(f"not found: {r.text[:200]}", details={"status": 404})
    if r.status_code >= 500:
        raise RunPodPodsTransportError(
            f"RunPod {method} {path} → {r.status_code}: {r.text[:300]}",
            retryable=True,
        )

    # 4xx other than 401/404 — surface body so the caller can detect capacity.
    body = r.text[:500]
    body_lower = body.lower()
    # RunPod returns 400 / 422 with an error message for stock-out conditions.
    if (
        "no longer any instances" in body_lower
        or "no available" in body_lower
        or "no gpus available" in body_lower
        or "out of stock" in body_lower
    ):
        raise RunPodPodsCapacityError(body, retryable=True)
    raise RunPodPodsError(
        f"RunPod {method} {path} → {r.status_code}: {body}",
        details={"status": r.status_code, "body": body},
    )


# ── Public API ──────────────────────────────────────────────────────────────


async def deploy_pod(
    *,
    name: str,
    image: str = DEFAULT_IMAGE,
    gpu_type_ids: list[str] | None = None,
    datacenter: str = DEFAULT_DATACENTER,
    volume_id: str = DEFAULT_VOLUME_ID,
    volume_mount: str = DEFAULT_VOLUME_MOUNT,
    container_disk_gb: int = DEFAULT_CONTAINER_DISK_GB,
    gpu_count: int = DEFAULT_GPU_COUNT,
    ports: list[str] | None = None,
    env: dict[str, str] | None = None,
    docker_start_cmd: list[str] | None = None,
    cloud_type: str = "SECURE",
) -> PodInfo:
    """Deploy a Forge on-demand pod via REST `POST /v1/pods`.

    `gpu_type_ids` is passed to RunPod as a list and combined with
    `gpuTypePriority="availability"` (the default) so RunPod itself picks
    whichever GPU has stock — no manual fallback loop on our side.
    """
    payload = {
        "name": name,
        "imageName": image,
        "gpuTypeIds": gpu_type_ids or DEFAULT_GPU_FALLBACK,
        "gpuCount": gpu_count,
        "containerDiskInGb": container_disk_gb,
        "ports": ports or DEFAULT_PORTS,
        "volumeMountPath": volume_mount,
        "networkVolumeId": volume_id,
        "dataCenterIds": [datacenter],
        "env": env or {},
        "dockerStartCmd": docker_start_cmd or DEFAULT_DOCKER_START_CMD,
        "cloudType": cloud_type,
        # RunPod's defaults: gpuTypePriority=availability, dataCenterPriority=availability.
        # We don't override — let it pick the first available combo.
    }

    try:
        data = await _rest("POST", "/pods", json=payload)
    except RunPodPodsCapacityError as e:
        # All requested GPU types are out of stock in this DC.
        logger.info("All requested GPU types out of stock in %s: %s", datacenter, e)
        raise

    if not data.get("id"):
        raise RunPodPodsError(f"deploy returned no pod id: {data!r}")

    info = _pod_from_payload(data)
    logger.info(
        "Pod deployed id=%s gpu=%s dc=%s volume=%s",
        info.id, info.gpu_type_id, datacenter, volume_id,
    )
    return info


async def terminate_pod(pod_id: str) -> None:
    """Stop and remove a pod. Idempotent — already-gone pods are no-op."""
    if not pod_id:
        return
    try:
        await _rest("DELETE", f"/pods/{pod_id}")
        logger.info("Pod terminated id=%s", pod_id)
    except RunPodPodsError as e:
        msg = str(e).lower()
        if "not found" in msg or "already" in msg or e.details.get("status") == 404:
            logger.info("Pod %s already gone — terminate is a no-op", pod_id)
            return
        raise


async def get_pod(pod_id: str) -> PodInfo | None:
    """Fetch the current pod state. Returns None if the pod no longer exists."""
    if not pod_id:
        return None
    try:
        data = await _rest("GET", f"/pods/{pod_id}")
    except RunPodPodsError as e:
        if e.details.get("status") == 404:
            return None
        raise
    if not data.get("id"):
        return None
    return _pod_from_payload(data)


def _pod_from_payload(pod: dict[str, Any]) -> PodInfo:
    """Translate RunPod's REST pod object into our PodInfo dataclass.

    The REST shape differs slightly from the GraphQL one — fields like
    `desiredStatus` and `runtime` exist on both, but there are subtle
    naming differences across versions of the API. We pull defensively.
    """
    machine = pod.get("machine") or {}
    runtime = pod.get("runtime") or {}
    rt_ports = runtime.get("ports") if isinstance(runtime, dict) else None

    public_ip: Optional[str] = pod.get("publicIp") or None
    if not public_ip and rt_ports:
        for p in rt_ports:
            if p.get("isIpPublic") and p.get("ip"):
                public_ip = p["ip"]
                break

    return PodInfo(
        id=pod.get("id", ""),
        name=pod.get("name", ""),
        status=pod.get("desiredStatus", "UNKNOWN"),
        desired_status=pod.get("desiredStatus", "UNKNOWN"),
        gpu_type_id=(machine.get("gpuTypeId") if isinstance(machine, dict) else None)
                    or (pod.get("gpuTypeIds") or [None])[0],
        image_name=pod.get("imageName"),
        public_ip=public_ip,
        runtime_uptime_seconds=(
            runtime.get("uptimeInSeconds") if isinstance(runtime, dict) else None
        ),
        cost_per_hr=pod.get("costPerHr"),
        ports=rt_ports,
        raw=pod,
    )
