"""Forge pod/session reaper — Celery beat task.

Runs every 60s. Two responsibilities:

  1. Mark idle ForgeSession rows ended once they pass FORGE_SESSION_IDLE_MIN
     since their last_activity_at heartbeat.
  2. Terminate ForgePod rows that have no active sessions and no recent
     job activity (FORGE_POD_IDLE_MIN window).

Sync version of the logic in `forge_pod_manager.reap` so it runs cleanly
inside Celery workers without an event loop. Pod termination calls go to
RunPod's REST API via a small sync wrapper (matches `runpod_pods.py`'s
own deploy/terminate flow).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from config import settings
from db.models import ForgePod, ForgeSession
from services.job_queue import _sync_engine, celery_app, redis_client
from services.runpod_pods import REST_BASE

logger = logging.getLogger(__name__)

GPU_REDIS_PREFIX = "skyie:gpu:"


def _terminate_pod_sync(pod_id: str) -> None:
    """Sync terminate via RunPod REST `DELETE /v1/pods/{id}`.

    Idempotent — 404 (already gone) and similar are treated as no-op.
    """
    if not pod_id or not settings.RUNPOD_API_KEY:
        return
    url = f"{REST_BASE}/pods/{pod_id}"
    headers = {
        "Authorization": f"Bearer {settings.RUNPOD_API_KEY}",
        "User-Agent": "skyie-forge-pod-reaper/2.0",
    }
    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.delete(url, headers=headers)
        if r.status_code in (200, 204):
            logger.info("Reaper terminated pod %s", pod_id)
        elif r.status_code == 404:
            # Already gone — nothing to do.
            return
        else:
            logger.warning("Reaper: terminate %s HTTP %d: %s", pod_id, r.status_code, r.text[:200])
    except Exception as e:
        logger.warning("Reaper: terminate %s failed: %s", pod_id, e)


@celery_app.task(name="skyie.forge_pod_reap")
def forge_pod_reap() -> dict:
    """Beat-scheduled idle reaper. Returns a small report dict."""
    now = datetime.now(timezone.utc)
    session_idle_cutoff = now - timedelta(minutes=settings.FORGE_SESSION_IDLE_MIN)
    pod_idle_cutoff = now - timedelta(minutes=settings.FORGE_POD_IDLE_MIN)

    expired_count = 0
    terminated: list[str] = []

    with Session(_sync_engine) as db:
        # 1. Expire idle sessions.
        result = db.execute(
            update(ForgeSession)
            .where(
                ForgeSession.status == "active",
                ForgeSession.last_activity_at < session_idle_cutoff,
            )
            .values(status="ended", ended_at=now, end_reason="idle_timeout")
            .returning(ForgeSession.id)
        )
        expired_count = len(result.all())
        db.commit()

        # 2. Terminate empty, idle pods.
        pods = db.execute(
            select(ForgePod).where(ForgePod.status.in_(("ready", "provisioning")))
        ).scalars().all()

        for pod in pods:
            has_active = db.execute(
                select(ForgeSession).where(
                    ForgeSession.pod_id == pod.id,
                    ForgeSession.status == "active",
                )
            ).scalars().first()
            if has_active:
                continue

            # If the pod is still provisioning, only terminate after a long
            # grace period — boot can legitimately take many minutes for a
                # cold cache.
            if pod.status == "provisioning":
                age = (now - pod.created_at).total_seconds()
                if age < settings.FORGE_POD_REGISTER_TIMEOUT_SEC:
                    continue

            if pod.last_job_at and pod.last_job_at > pod_idle_cutoff:
                continue

            _terminate_pod_sync(pod.runpod_pod_id)
            pod.status = "terminated"
            pod.terminated_at = now
            db.commit()
            terminated.append(pod.runpod_pod_id)

            # Drop the Redis registration so the next Connect re-deploys
            # cleanly instead of routing to a dead URL.
            stale = redis_client.get(f"{GPU_REDIS_PREFIX}pod_id")
            if stale == pod.runpod_pod_id:
                for k in ("url", "registered_at", "pod_id"):
                    redis_client.delete(f"{GPU_REDIS_PREFIX}{k}")

    if expired_count or terminated:
        logger.info(
            "Forge reaper: expired_sessions=%d terminated_pods=%s",
            expired_count, terminated,
        )
    return {"expired_sessions": expired_count, "terminated_pods": terminated}
