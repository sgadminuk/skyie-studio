"""Job status endpoints + WebSocket progress streaming."""

import io
import json
import uuid as uuid_mod
import asyncio
import logging
import mimetypes
import zipfile
from pathlib import Path
from fastapi import APIRouter, Depends, Header, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from config import settings
from db.base import get_session
from db.models import User
from api.dependencies import get_current_user
from services.credit_service import check_credits, get_credit_cost, reserve_credits
from services.job_queue import (
    create_job,
    find_job_by_idempotency_key,
    get_job,
    list_jobs,
    redis_client,
    run_veo_multi_shot_task,
)
from services.storage_service import get_asset_url


class ShotOverride(BaseModel):
    idx: int = Field(..., ge=0)
    prompt: str | None = None
    negative_prompt: str | None = None


class RetryRequest(BaseModel):
    shots_override: list[ShotOverride] | None = None

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


@router.get("")
async def get_all_jobs(limit: int = 50):
    """List all recent jobs."""
    jobs = list_jobs(limit)
    return {"jobs": jobs, "count": len(jobs)}


@router.get("/{job_id}")
async def get_job_status(job_id: str):
    """Get detailed status for a specific job."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Add download URL if completed
    if job.get("output_path"):
        job["download_url"] = get_asset_url(job["output_path"])
        job["attachment_url"] = f"/api/v1/jobs/{job_id}/download"

    return job


def _list_part_files(out_dir: Path, workflow: str) -> list[Path]:
    """Per-workflow file conventions for sub-output downloads."""
    files: list[Path] = []
    if workflow == "avatar_pack":
        files.extend(out_dir.glob("avatar_*.png"))
        files.extend(out_dir.glob("avatar_*.jpg"))
    elif workflow == "veo_multi_shot":
        files.extend(out_dir.glob("shot_*.mp4"))
    return sorted(files)


@router.get("/{job_id}/download/{idx}")
async def download_job_part(job_id: str, idx: int):
    """Force-download a single sub-output (one avatar tile, one multi-shot clip)."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    workflow = job.get("workflow", "")
    out_dir = Path(settings.OUTPUT_PATH) / job_id
    files = _list_part_files(out_dir, workflow)
    if idx < 0 or idx >= len(files):
        raise HTTPException(status_code=404, detail="Part index out of range")
    p = files[idx]
    media_type, _ = mimetypes.guess_type(p.name)
    return FileResponse(
        p,
        media_type=media_type or "application/octet-stream",
        filename=f"{workflow}-{job_id[:8]}-{p.name}",
    )


@router.get("/{job_id}/download-all")
async def download_all_parts(job_id: str):
    """Stream a ZIP of every sub-output for multi-output workflows."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    workflow = job.get("workflow", "")
    out_dir = Path(settings.OUTPUT_PATH) / job_id
    files = _list_part_files(out_dir, workflow)
    if not files:
        raise HTTPException(status_code=404, detail="No files to download")

    # ZIP_STORED: image/video bytes are already compressed, deflate just burns
    # CPU. Building in-memory is fine — avatar packs are <50 MB, multi-shot
    # clips total <100 MB.
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
        for f in files:
            zf.write(f, f.name)
    buf.seek(0)
    filename = f"{workflow}-{job_id[:8]}.zip"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{job_id}/download")
async def download_job_output(job_id: str):
    """Serve the job output with Content-Disposition: attachment.

    Used for both the inline <video> player and the Download button. The
    shared Traefik proxy applies global gzip/compression on the static
    /assets/... route, which strips Range support and breaks mp4 streaming
    in Safari. This route returns the correct media_type plus an attachment
    disposition — Safari plays it inline because <video> ignores
    Content-Disposition, and the Download button saves it cross-origin.
    """
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    output_path = job.get("output_path")
    if not output_path:
        raise HTTPException(status_code=404, detail="Job has no output yet")
    p = Path(output_path)
    if not p.exists():
        raise HTTPException(status_code=410, detail="Output file no longer on disk")
    filename = f"{job.get('workflow', 'output')}-{job_id[:8]}{p.suffix}"
    media_type, _ = mimetypes.guess_type(p.name)
    return FileResponse(p, media_type=media_type or "application/octet-stream", filename=filename)


@router.post("/{job_id}/retry")
async def retry_job(
    job_id: str,
    request: RetryRequest | None = None,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Retry a failed multi-shot job, reusing successful clips on disk.

    Only the shots that didn't produce a clip are re-rendered, and the user
    is charged credits only for those. Currently scoped to veo_multi_shot —
    other workflows would need their own resume semantics.
    """
    if idempotency_key:
        existing = find_job_by_idempotency_key(str(user.id), idempotency_key)
        if existing:
            return {
                "job_id": existing["id"],
                "workflow": existing["workflow"],
                "status": existing.get("status", "queued"),
                "idempotent_replay": True,
            }

    old = get_job(job_id)
    if not old:
        raise HTTPException(status_code=404, detail="Job not found")
    if old.get("workflow") != "veo_multi_shot":
        raise HTTPException(status_code=400, detail="Only multi-shot jobs support retry")
    if old.get("status") != "failed":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot retry a job in status {old.get('status')}",
        )
    old_params = old.get("params") or {}
    if old_params.get("_user_id") != str(user.id):
        raise HTTPException(status_code=403, detail="Not your job")

    shots = old_params.get("shots") or []
    if not shots:
        raise HTTPException(status_code=400, detail="Original job had no shots")

    # A shot is "reusable" iff its clip is still on disk and non-empty.
    shots_status = old_params.get("shots_status") or []
    completed_idxs: list[int] = []
    for i, s in enumerate(shots_status[: len(shots)]):
        if s.get("status") == "completed":
            cp = s.get("clip_path")
            if cp and Path(cp).exists() and Path(cp).stat().st_size > 0:
                completed_idxs.append(i)
    remaining_idxs = [i for i in range(len(shots)) if i not in completed_idxs]

    # If every shot already succeeded but the job still failed, the failure
    # was downstream (stitch / music / manifest). Allow retry: zero Veo cost,
    # the workflow re-runs from after the render loop.
    cost = get_credit_cost(
        "veo_multi_shot",
        {
            "shots": [shots[i] for i in remaining_idxs],
            "resolution": old_params.get("resolution") or "1080p",
        },
    ) if remaining_idxs else 0
    if cost > 0 and not await check_credits(session, user.id, cost):
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient credits. Need {cost}, have {user.credits}",
        )

    # New job: same params, drop the stale shots_status, point the worker at
    # the prior output dir so it can copy the completed clips over.
    new_params = {k: v for k, v in old_params.items() if k != "shots_status"}
    new_params["_resume_from_job_id"] = job_id

    # Apply user-provided prompt edits to the still-to-render shots. Reject
    # overrides aimed at completed shots — those clips are reused as-is and
    # editing their prompts would silently do nothing.
    if request and request.shots_override:
        new_shots = [dict(s) for s in (new_params.get("shots") or [])]
        remaining_set = set(remaining_idxs)
        for ov in request.shots_override:
            if ov.idx not in remaining_set:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Cannot override shot {ov.idx + 1}: it already completed "
                        "(its clip is reused on retry)."
                    ),
                )
            target = new_shots[ov.idx]
            if ov.prompt is not None:
                target["prompt"] = ov.prompt
            if ov.negative_prompt is not None:
                target["negative_prompt"] = ov.negative_prompt
        new_params["shots"] = new_shots

    new_job_id = create_job(
        "veo_multi_shot", new_params, user_id=str(user.id),
        provider="gemini", model=settings.GEMINI_VEO_MODEL,
        idempotency_key=idempotency_key,
    )
    # Skip the credit transaction entirely when there's nothing to charge for
    # (stitch-only retry) — otherwise we leave 0-debit rows in the ledger.
    if cost > 0:
        await reserve_credits(
            session, user.id, cost, job_id=uuid_mod.UUID(new_job_id),
            description=(
                f"Veo multi-shot retry "
                f"({len(remaining_idxs)}/{len(shots)} shots, "
                f"{len(completed_idxs)} reused)"
            ),
        )
    run_veo_multi_shot_task.delay(new_job_id, new_params)
    return {
        "job_id": new_job_id,
        "workflow": "veo_multi_shot",
        "status": "queued",
        "credits_used": cost,
        "shots_resumed": len(completed_idxs),
        "shots_to_render": len(remaining_idxs),
    }


@router.websocket("/{job_id}/ws")
async def job_progress_ws(websocket: WebSocket, job_id: str):
    """Stream real-time progress updates for a job."""
    await websocket.accept()

    # Send current state immediately
    job = get_job(job_id)
    if job:
        await websocket.send_json(job)

        # If already completed/failed, close
        if job.get("status") in ("completed", "failed", "cancelled"):
            await websocket.close()
            return

    # Subscribe to Redis pub/sub for updates
    pubsub = redis_client.pubsub()
    channel = f"skyie:progress:{job_id}"
    pubsub.subscribe(channel)

    try:
        while True:
            message = pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message and message["type"] == "message":
                data = json.loads(message["data"])
                await websocket.send_json(data)

                # Close on completion
                if data.get("status") in ("completed", "failed", "cancelled"):
                    break

            # Also check for WebSocket disconnect
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=0.1)
            except asyncio.TimeoutError:
                pass

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for job {job_id}")
    finally:
        pubsub.unsubscribe(channel)
        pubsub.close()
