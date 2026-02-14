"""Job status endpoints + WebSocket progress streaming."""

import json
import asyncio
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from services.job_queue import get_job, list_jobs, redis_client
from services.storage_service import get_asset_url

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

    return job


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
