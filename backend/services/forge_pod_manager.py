"""Forge on-demand pod orchestration.

Coordinates ForgePod (one shared GPU pod) + ForgeSession (per-user UI
session) lifecycles on top of `runpod_pods` (RunPod GraphQL) and the
existing `/api/internal/gpu-register` flow (pod self-announces its URL
via Redis after boot).

Flow on Connect:
  1. caller asks for an active session
  2. if a healthy pod exists  → create session row tied to that pod, return ready
  3. otherwise                → deploy new pod, create session in `provisioning`
                                state; the pod's startup script registers
                                itself via /api/internal/gpu-register, the
                                next status poll flips status → ready

Flow on Disconnect (or idle):
  - mark the session ended; reaper terminates the pod after
    FORGE_POD_IDLE_MIN of no active sessions and no recent jobs.
"""
from __future__ import annotations

import logging
import uuid as uuid_mod
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.models import ForgePod, ForgeSession
from services import runpod_pods
from services.job_queue import redis_client

logger = logging.getLogger(__name__)

# Redis keys re-used from the existing gpu-register flow.
GPU_REDIS_PREFIX = "skyie:gpu:"


# ── Helpers ──────────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _gpu_priority() -> list[str]:
    raw = (settings.FORGE_POD_GPU_PRIORITY or "").strip()
    if not raw:
        return runpod_pods.DEFAULT_GPU_FALLBACK
    return [s.strip() for s in raw.split(",") if s.strip()]


def _registered_pod_id() -> str | None:
    return redis_client.get(f"{GPU_REDIS_PREFIX}pod_id") or None


def _registered_url() -> str | None:
    return redis_client.get(f"{GPU_REDIS_PREFIX}url") or None


def _registration_age_seconds() -> float | None:
    raw = redis_client.get(f"{GPU_REDIS_PREFIX}registered_at")
    if not raw:
        return None
    try:
        ts = datetime.fromisoformat(raw)
    except ValueError:
        return None
    return (_now() - ts).total_seconds()


# ── Pod state ────────────────────────────────────────────────────────────────


async def _get_active_pod(db: AsyncSession) -> ForgePod | None:
    """The current pod that's either provisioning or ready (one at a time)."""
    res = await db.execute(
        select(ForgePod)
        .where(ForgePod.status.in_(("provisioning", "ready")))
        .order_by(ForgePod.created_at.desc())
        .limit(1)
    )
    return res.scalar_one_or_none()


async def _check_registration(db: AsyncSession, pod: ForgePod) -> ForgePod:
    """If the pod has called gpu-register since deploy, flip it to ready.

    The pod's startup posts {pod_id, gpu_url} to /api/internal/gpu-register
    which writes them into Redis. We treat a fresh registration whose pod_id
    matches our row as proof the pod is up.
    """
    if pod.status == "ready":
        return pod

    reg_pod_id = _registered_pod_id()
    reg_url = _registered_url()
    age = _registration_age_seconds()

    fresh = (
        reg_pod_id == pod.runpod_pod_id
        and reg_url
        and age is not None
        and age <= settings.GPU_HEARTBEAT_TIMEOUT
    )
    if fresh:
        pod.status = "ready"
        pod.registered_url = reg_url
        pod.ready_at = _now()
        await db.commit()
        await db.refresh(pod)
        logger.info("ForgePod %s ready at %s", pod.runpod_pod_id, reg_url)
        return pod

    # Has the deploy taken too long without registration? Mark failed so the
    # next Connect click triggers a fresh deploy instead of waiting forever.
    deploy_age = (_now() - pod.created_at).total_seconds()
    if deploy_age > settings.FORGE_POD_REGISTER_TIMEOUT_SEC:
        pod.status = "failed"
        pod.error = (
            f"Pod did not register within {settings.FORGE_POD_REGISTER_TIMEOUT_SEC}s. "
            "The container may have failed to boot or self-registration is misconfigured."
        )
        pod.terminated_at = _now()
        await db.commit()
        # Best-effort terminate so we don't keep paying for a broken pod.
        try:
            await runpod_pods.terminate_pod(pod.runpod_pod_id)
        except Exception as e:
            logger.warning("Could not terminate stale provisioning pod %s: %s", pod.runpod_pod_id, e)
        logger.warning("ForgePod %s marked failed: register timeout", pod.runpod_pod_id)
    return pod


async def _deploy_new_pod(db: AsyncSession) -> ForgePod:
    """Provision a fresh on-demand pod and persist a row in `forge_pods`."""
    name = f"forge-pod-{uuid_mod.uuid4().hex[:8]}"
    env = {
        # The GPU's startup script reads these to phone home after boot.
        "SKYIE_BACKEND_URL": "https://api.skyie.studio",
        "GPU_REGISTRATION_KEY": settings.GPU_REGISTRATION_KEY,
        # Shared bearer between backend's forge_pod_client and the pod's
        # serve.py — gates POST /run. Empty value disables auth (dev only).
        "GPU_API_KEY": settings.GPU_API_KEY,
        # HuggingFace gated-model token (FLUX-dev needs this on first
        # download against an empty volume cache).
        "HF_TOKEN": settings.HF_API_KEY or "",
    }

    info = await runpod_pods.deploy_pod(
        image=settings.FORGE_POD_IMAGE,
        name=name,
        gpu_type_ids=_gpu_priority(),
        datacenter=settings.FORGE_POD_DATACENTER,
        volume_id=settings.FORGE_POD_VOLUME_ID,
        env=env,
    )

    pod = ForgePod(
        runpod_pod_id=info.id,
        gpu_type_id=info.gpu_type_id,
        datacenter=settings.FORGE_POD_DATACENTER,
        status="provisioning",
        cost_per_hr=info.cost_per_hr,
    )
    db.add(pod)
    await db.commit()
    await db.refresh(pod)
    logger.info("ForgePod created id=%s runpod=%s gpu=%s", pod.id, info.id, info.gpu_type_id)
    return pod


# ── Session lifecycle ───────────────────────────────────────────────────────


async def _get_active_session(db: AsyncSession, user_id: uuid_mod.UUID) -> ForgeSession | None:
    res = await db.execute(
        select(ForgeSession)
        .where(ForgeSession.user_id == user_id, ForgeSession.status == "active")
        .order_by(ForgeSession.started_at.desc())
        .limit(1)
    )
    return res.scalar_one_or_none()


async def connect(db: AsyncSession, user_id: uuid_mod.UUID) -> dict:
    """Idempotent — creates a session if none exists, deploys a pod if none exists.

    Returns the same shape as `status()`.
    """
    pod = await _get_active_pod(db)
    if pod is None:
        pod = await _deploy_new_pod(db)
    elif pod.status == "provisioning":
        # Re-check registration in case the pod registered while idle.
        pod = await _check_registration(db, pod)
        if pod.status == "failed":
            # Try once more with a fresh deploy.
            pod = await _deploy_new_pod(db)

    session = await _get_active_session(db, user_id)
    if session is None:
        session = ForgeSession(
            user_id=user_id,
            pod_id=pod.id,
            status="active",
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
    elif session.pod_id != pod.id:
        # Old pod terminated, rebind session to the current pod.
        session.pod_id = pod.id
        session.last_activity_at = _now()
        await db.commit()
        await db.refresh(session)

    return await status(db, user_id)


async def status(db: AsyncSession, user_id: uuid_mod.UUID) -> dict:
    """Snapshot of pod + session state for the calling user."""
    pod = await _get_active_pod(db)
    if pod and pod.status == "provisioning":
        pod = await _check_registration(db, pod)

    session = await _get_active_session(db, user_id)

    # Count active sessions across all users on this pod (UI shows
    # "Shared with N active users").
    active_session_count = 0
    if pod:
        res = await db.execute(
            select(ForgeSession).where(
                ForgeSession.pod_id == pod.id,
                ForgeSession.status == "active",
            )
        )
        active_session_count = len(res.scalars().all())

    return {
        "pod": _pod_to_dict(pod),
        "session": _session_to_dict(session),
        "active_session_count": active_session_count,
    }


async def heartbeat(db: AsyncSession, user_id: uuid_mod.UUID) -> dict:
    """Bump last_activity_at to defer the idle reaper."""
    session = await _get_active_session(db, user_id)
    if session:
        session.last_activity_at = _now()
        await db.commit()
    return await status(db, user_id)


async def disconnect(db: AsyncSession, user_id: uuid_mod.UUID) -> dict:
    """End the calling user's active session. Pod stays alive until the
    reaper notices no sessions remain (so other users aren't dropped)."""
    session = await _get_active_session(db, user_id)
    if session:
        session.status = "ended"
        session.ended_at = _now()
        session.end_reason = "user_disconnect"
        await db.commit()
    return await status(db, user_id)


# ── Reaper (called from Celery beat) ─────────────────────────────────────────


async def reap(db: AsyncSession) -> dict:
    """Expire idle sessions; terminate idle pods.

    Run every ~60s. Returns a small report dict for logging/observability.
    """
    now = _now()
    session_idle_cutoff = now - timedelta(minutes=settings.FORGE_SESSION_IDLE_MIN)
    pod_idle_cutoff = now - timedelta(minutes=settings.FORGE_POD_IDLE_MIN)

    # 1. End sessions that haven't pinged for a while.
    expired = await db.execute(
        update(ForgeSession)
        .where(
            ForgeSession.status == "active",
            ForgeSession.last_activity_at < session_idle_cutoff,
        )
        .values(status="ended", ended_at=now, end_reason="idle_timeout")
        .returning(ForgeSession.id)
    )
    expired_ids = [row[0] for row in expired.all()]
    if expired_ids:
        logger.info("Forge reaper expired %d idle sessions", len(expired_ids))

    # 2. Terminate pods with no active sessions and no recent jobs.
    res = await db.execute(
        select(ForgePod).where(ForgePod.status.in_(("ready", "provisioning")))
    )
    candidate_pods = res.scalars().all()

    terminated: list[str] = []
    for pod in candidate_pods:
        # Any active sessions left?
        res = await db.execute(
            select(ForgeSession).where(
                ForgeSession.pod_id == pod.id,
                ForgeSession.status == "active",
            )
        )
        if res.scalars().first():
            continue
        # Recent job activity (someone disconnected mid-job)?
        if pod.last_job_at and pod.last_job_at > pod_idle_cutoff:
            continue

        # OK to terminate.
        try:
            await runpod_pods.terminate_pod(pod.runpod_pod_id)
        except Exception as e:
            logger.warning("Reaper failed to terminate pod %s: %s", pod.runpod_pod_id, e)
            continue

        pod.status = "terminated"
        pod.terminated_at = now
        await db.commit()
        terminated.append(pod.runpod_pod_id)

        # Clean up the Redis registration so a future Connect doesn't
        # accidentally route to the dead pod's URL.
        if _registered_pod_id() == pod.runpod_pod_id:
            for k in ("url", "registered_at", "pod_id"):
                redis_client.delete(f"{GPU_REDIS_PREFIX}{k}")

    await db.commit()
    return {
        "expired_sessions": len(expired_ids),
        "terminated_pods": terminated,
    }


# ── Serializers ──────────────────────────────────────────────────────────────


def _pod_to_dict(pod: ForgePod | None) -> dict | None:
    if not pod:
        return None
    return {
        "id": str(pod.id),
        "runpod_pod_id": pod.runpod_pod_id,
        "status": pod.status,
        "gpu_type_id": pod.gpu_type_id,
        "datacenter": pod.datacenter,
        "cost_per_hr": pod.cost_per_hr,
        "registered_url": pod.registered_url,
        "created_at": pod.created_at.isoformat() if pod.created_at else None,
        "ready_at": pod.ready_at.isoformat() if pod.ready_at else None,
        "uptime_seconds": int((_now() - pod.created_at).total_seconds())
        if pod.created_at and pod.status in ("provisioning", "ready") else None,
        "error": pod.error,
    }


def _session_to_dict(session: ForgeSession | None) -> dict | None:
    if not session:
        return None
    return {
        "id": str(session.id),
        "status": session.status,
        "pod_id": str(session.pod_id) if session.pod_id else None,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "last_activity_at": session.last_activity_at.isoformat() if session.last_activity_at else None,
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
        "end_reason": session.end_reason,
    }
