"""Async client for RunPod on-demand pods (GraphQL).

Distinct from `runpod_serverless.py`, which talks to RunPod *Serverless*
endpoints. This module manages **on-demand pods** — a pod is rented by the
hour, runs a long-lived FastAPI server, attaches our network volume, and is
torn down when no Forge users are connected.

Public surface:
  - deploy_pod(...) -> PodInfo
  - terminate_pod(pod_id) -> None
  - get_pod(pod_id) -> PodInfo
  - PodInfo dataclass (id, status, gpu_type_id, public_ip, ports, runtime_uptime_sec, ...)
  - RunPodPodsError + subtypes for transport / config / capacity failures

GPU fallback list (priority order — see live availability probe in
EUR-IS-1, 2026-04-29):
    RTX PRO 6000  (96 GB, $1.89/hr, Medium)   — primary
    A100 SXM      (80 GB, $1.49/hr, Low)
    H100 NVL      (94 GB, $3.07/hr, Low)
    RTX 5090      (32 GB, $0.99/hr, Low)      — last resort, FLUX-only
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
    """Network / HTTP error talking to RunPod GraphQL."""


class RunPodPodsCapacityError(RunPodPodsError):
    """No GPU stock available for any of the requested types."""


# ── Defaults — production EUR-IS-1 fallback chain ────────────────────────────

# RunPod gpu type ids exactly as returned by `gpuTypes.id`. Order = priority.
DEFAULT_GPU_FALLBACK = [
    "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
    "NVIDIA A100-SXM4-80GB",
    "NVIDIA H100 NVL",
    "NVIDIA GeForce RTX 5090",
]

# Pod naming/sizing defaults. The values match what the legacy bootstrap pod
# used so the network volume's HF cache layout doesn't surprise the handler.
DEFAULT_DATACENTER = "EUR-IS-1"
DEFAULT_VOLUME_ID = "7muboz2qp0"
DEFAULT_VOLUME_MOUNT = "/runpod-volume"
DEFAULT_CONTAINER_DISK_GB = 50
DEFAULT_MIN_VCPU = 8
DEFAULT_MIN_MEMORY_GB = 32
DEFAULT_GPU_COUNT = 1
DEFAULT_PORTS = "8888/http,22/tcp"  # FastAPI shim on 8888, ssh for debug

GRAPHQL_URL = "https://api.runpod.io/graphql"


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
        """Best-effort public URL for the pod's HTTP port (8888)."""
        if not self.ports:
            return None
        for p in self.ports:
            if p.get("type") == "http" and p.get("privatePort") == 8888:
                ip = p.get("ip")
                port = p.get("publicPort")
                if ip and port:
                    return f"http://{ip}:{port}"
        # RunPod also exposes a managed HTTPS proxy URL: <pod_id>-8888.proxy.runpod.net
        return f"https://{self.id}-8888.proxy.runpod.net"


# ── Transport ────────────────────────────────────────────────────────────────


def _api_key() -> str:
    if not settings.RUNPOD_API_KEY:
        raise RunPodPodsConfigError("RUNPOD_API_KEY is not configured")
    return settings.RUNPOD_API_KEY


async def _graphql(query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
    """POST a GraphQL request. RunPod's GraphQL accepts the API key as either
    `Authorization: Bearer …` OR `?api_key=…`. We use the query string form
    because the live probe showed the bearer header silently 403s on some
    queries (e.g. gpuTypes.lowestPrice) for reasons RunPod hasn't documented.
    """
    url = f"{GRAPHQL_URL}?api_key={_api_key()}"
    body = {"query": query, "variables": variables or {}}
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            r = await client.post(
                url,
                json=body,
                headers={"User-Agent": "skyie-forge-pod-manager/1.0"},
            )
        except httpx.HTTPError as e:
            raise RunPodPodsTransportError(str(e), retryable=True) from e
    if r.status_code == 401:
        raise RunPodPodsConfigError("RUNPOD_API_KEY rejected (401)")
    if r.status_code >= 500:
        raise RunPodPodsTransportError(
            f"RunPod GraphQL returned {r.status_code}: {r.text[:300]}",
            retryable=True,
        )
    if r.status_code != 200:
        raise RunPodPodsError(
            f"RunPod GraphQL returned {r.status_code}: {r.text[:300]}",
        )
    payload = r.json()
    if "errors" in payload and payload["errors"]:
        # Surface GraphQL-level errors verbatim — RunPod's messages already
        # describe quota/capacity/auth issues clearly.
        msg = "; ".join(e.get("message", str(e)) for e in payload["errors"])
        # Out-of-stock manifests as "There are no longer any instances available"
        if "no longer any instances" in msg.lower() or "no available" in msg.lower():
            raise RunPodPodsCapacityError(msg, retryable=True, details=payload)
        raise RunPodPodsError(msg, details=payload)
    return payload.get("data") or {}


# ── Mutations ────────────────────────────────────────────────────────────────


_DEPLOY_MUTATION = """
mutation Deploy($input: PodFindAndDeployOnDemandInput!) {
  podFindAndDeployOnDemand(input: $input) {
    id
    name
    desiredStatus
    imageName
    machineId
    gpuCount
    vcpuCount
    memoryInGb
    containerDiskInGb
    volumeInGb
    volumeMountPath
    ports
    env
    machine { gpuTypeId podHostId }
    runtime { uptimeInSeconds ports { ip isIpPublic privatePort publicPort type } }
  }
}
"""


_TERMINATE_MUTATION = """
mutation Terminate($input: PodTerminateInput!) {
  podTerminate(input: $input)
}
"""


_GET_POD_QUERY = """
query Pod($id: String!) {
  pod(input: { podId: $id }) {
    id
    name
    desiredStatus
    imageName
    costPerHr
    machine { gpuTypeId podHostId }
    runtime {
      uptimeInSeconds
      ports { ip isIpPublic privatePort publicPort type }
    }
  }
}
"""


async def deploy_pod(
    *,
    image: str,
    name: str,
    gpu_type_ids: list[str] | None = None,
    datacenter: str = DEFAULT_DATACENTER,
    volume_id: str = DEFAULT_VOLUME_ID,
    volume_mount: str = DEFAULT_VOLUME_MOUNT,
    container_disk_gb: int = DEFAULT_CONTAINER_DISK_GB,
    min_vcpu: int = DEFAULT_MIN_VCPU,
    min_memory_gb: int = DEFAULT_MIN_MEMORY_GB,
    gpu_count: int = DEFAULT_GPU_COUNT,
    ports: str = DEFAULT_PORTS,
    env: dict[str, str] | None = None,
    registry_auth_id: str | None = None,
    cloud_type: str = "SECURE",
) -> PodInfo:
    """Find and deploy an on-demand pod.

    Iterates `gpu_type_ids` in order — the first GPU with stock wins. Raises
    RunPodPodsCapacityError if every type is out of stock.
    """
    gpu_list = gpu_type_ids or DEFAULT_GPU_FALLBACK
    env_list = [{"key": k, "value": v} for k, v in (env or {}).items()]

    last_capacity_err: Exception | None = None

    for gpu_id in gpu_list:
        input_payload = {
            "cloudType": cloud_type,
            "gpuCount": gpu_count,
            "gpuTypeId": gpu_id,
            "name": name,
            "imageName": image,
            "containerDiskInGb": container_disk_gb,
            "minVcpuCount": min_vcpu,
            "minMemoryInGb": min_memory_gb,
            "ports": ports,
            "volumeMountPath": volume_mount,
            "networkVolumeId": volume_id,
            "dataCenterId": datacenter,
            "env": env_list,
            "supportPublicIp": True,
        }
        if registry_auth_id:
            input_payload["containerRegistryAuthId"] = registry_auth_id

        try:
            data = await _graphql(_DEPLOY_MUTATION, {"input": input_payload})
        except RunPodPodsCapacityError as e:
            logger.info("Pod deploy: %s out of stock in %s, trying next", gpu_id, datacenter)
            last_capacity_err = e
            continue

        pod = data.get("podFindAndDeployOnDemand")
        if not pod or not pod.get("id"):
            # No error but also no pod — treat as capacity exhaustion for this type.
            logger.info("Pod deploy: %s returned no pod, trying next", gpu_id)
            continue

        logger.info(
            "Pod deployed id=%s gpu=%s dc=%s volume=%s",
            pod["id"], gpu_id, datacenter, volume_id,
        )
        return _pod_from_payload(pod)

    if last_capacity_err:
        raise last_capacity_err
    raise RunPodPodsCapacityError(
        f"No GPU stock for any of {gpu_list} in {datacenter}",
        retryable=True,
    )


async def terminate_pod(pod_id: str) -> None:
    """Stop and remove a pod. Idempotent — already-terminated pods raise
    no-op-ish errors that we swallow."""
    if not pod_id:
        return
    try:
        await _graphql(_TERMINATE_MUTATION, {"input": {"podId": pod_id}})
        logger.info("Pod terminated id=%s", pod_id)
    except RunPodPodsError as e:
        msg = str(e).lower()
        if "not found" in msg or "already" in msg:
            logger.info("Pod %s already gone — terminate is a no-op", pod_id)
            return
        raise


async def get_pod(pod_id: str) -> PodInfo | None:
    """Fetch the current pod state. Returns None if the pod no longer exists."""
    if not pod_id:
        return None
    try:
        data = await _graphql(_GET_POD_QUERY, {"id": pod_id})
    except RunPodPodsError as e:
        if "not found" in str(e).lower():
            return None
        raise
    pod = data.get("pod")
    if not pod:
        return None
    return _pod_from_payload(pod)


def _pod_from_payload(pod: dict[str, Any]) -> PodInfo:
    machine = pod.get("machine") or {}
    runtime = pod.get("runtime") or {}
    rt_ports = runtime.get("ports") if isinstance(runtime, dict) else None
    public_ip: Optional[str] = None
    if rt_ports:
        for p in rt_ports:
            if p.get("isIpPublic") and p.get("ip"):
                public_ip = p["ip"]
                break
    return PodInfo(
        id=pod.get("id", ""),
        name=pod.get("name", ""),
        status=pod.get("desiredStatus", "UNKNOWN"),
        desired_status=pod.get("desiredStatus", "UNKNOWN"),
        gpu_type_id=machine.get("gpuTypeId"),
        image_name=pod.get("imageName"),
        public_ip=public_ip,
        runtime_uptime_seconds=runtime.get("uptimeInSeconds") if isinstance(runtime, dict) else None,
        cost_per_hr=pod.get("costPerHr"),
        ports=rt_ports,
        raw=pod,
    )
