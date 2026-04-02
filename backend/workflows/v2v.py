from __future__ import annotations
"""Workflow — Video-to-Video & Video Extend (Phase 4).
Transform existing videos or extend generated clips.
"""

import asyncio
import logging

from config import settings
from services.job_queue import update_job
from services.storage_service import get_temp_dir, save_output, cleanup_temp
from services.ffmpeg_service import stitch_clips
from models.wan_video import wan_video_wrapper

logger = logging.getLogger(__name__)


async def execute_v2v(job_id: str, params: dict) -> str:
    """Execute video-to-video transformation.

    Params:
        source_video: str — path to uploaded source video
        prompt: str — transformation description
        strength: float — transform intensity (0.0-1.0)
        style: str — target style (e.g. "anime", "cinematic")
        width: int — output width
        height: int — output height
    """
    if not settings.MOCK_MODE:
        from services.gpu_client import gpu_client
        health = await gpu_client.health_check()
        if health.get("status") != "healthy":
            raise RuntimeError("GPU server is not available")

    temp = get_temp_dir(job_id)
    source_video = params.get("source_video", "")
    prompt = params.get("prompt", "")
    strength = params.get("strength", 0.7)
    style = params.get("style", "")
    width = params.get("width", 1920)
    height = params.get("height", 1080)

    if not source_video:
        raise ValueError("No source video provided")

    try:
        update_job(job_id, progress=5, step="Preparing video")
        full_prompt = f"{prompt}, {style}" if style else prompt
        output_video = str(temp / "v2v_output.mp4")

        update_job(job_id, progress=10, step="Transforming video")
        await wan_video_wrapper.video_to_video(
            source_path=source_video,
            output_path=output_video,
            prompt=full_prompt,
            strength=strength,
            width=width,
            height=height,
        )
        if settings.MOCK_MODE:
            await asyncio.sleep(2)

        update_job(job_id, progress=90, step="Encoding final")
        output_path = save_output(job_id, output_video, "v2v.mp4")
        update_job(job_id, progress=100, step="Complete")
        cleanup_temp(job_id)

        logger.info("V2V complete: %s", output_path)
        return output_path

    except Exception as e:
        logger.exception("V2V workflow failed: %s", e)
        cleanup_temp(job_id)
        raise


async def execute_extend(job_id: str, params: dict) -> str:
    """Execute video extend workflow.

    Params:
        source_video: str — path to video to extend
        prompt: str — continuation prompt
        extend_seconds: float — how many seconds to add
        direction: str — "forward" or "backward"
    """
    if not settings.MOCK_MODE:
        from services.gpu_client import gpu_client
        health = await gpu_client.health_check()
        if health.get("status") != "healthy":
            raise RuntimeError("GPU server is not available")

    temp = get_temp_dir(job_id)
    source_video = params.get("source_video", "")
    prompt = params.get("prompt", "")
    extend_seconds = params.get("extend_seconds", 5.0)
    direction = params.get("direction", "forward")

    if not source_video:
        raise ValueError("No source video provided")

    try:
        update_job(job_id, progress=5, step="Analyzing video")
        extended_path = str(temp / "extended.mp4")

        update_job(job_id, progress=10, step="Extending video")
        await wan_video_wrapper.extend_video(
            source_path=source_video,
            output_path=extended_path,
            prompt=prompt,
            extend_seconds=extend_seconds,
            direction=direction,
        )
        if settings.MOCK_MODE:
            await asyncio.sleep(2)

        update_job(job_id, progress=90, step="Encoding")
        if direction == "backward":
            final_path = str(temp / "final.mp4")
            stitch_clips([extended_path, source_video], final_path)
        else:
            final_path = str(temp / "final.mp4")
            stitch_clips([source_video, extended_path], final_path)

        output_path = save_output(job_id, final_path, "extended.mp4")
        update_job(job_id, progress=100, step="Complete")
        cleanup_temp(job_id)

        logger.info("Extend complete: %s (+%.1fs %s)", output_path, extend_seconds, direction)
        return output_path

    except Exception as e:
        logger.exception("Extend workflow failed: %s", e)
        cleanup_temp(job_id)
        raise
