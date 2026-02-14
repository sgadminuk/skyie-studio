"""Workflow B — AI B-Roll.
Text prompts → generated images → animated video clips → stitched b-roll.
"""

import asyncio
import logging
from config import settings
from services.job_queue import update_job
from services.storage_service import get_temp_dir, save_output, cleanup_temp
from services.ffmpeg_service import stitch_clips, add_audio
from models.flux_image import flux_image_wrapper
from models.wan_video import wan_video_wrapper
from models.music_gen import music_gen_wrapper

logger = logging.getLogger(__name__)


async def execute_broll(job_id: str, params: dict) -> str:
    """Execute the b-roll pipeline.

    Params:
        scenes: list[dict] — each with 'prompt' and optional 'duration'
        style: str — visual style description
        generate_music: bool — whether to add background music
        music_prompt: str — description for music generation
        width: int — output width
        height: int — output height
    """
    # GPU health check (non-mock mode only)
    if not settings.MOCK_MODE:
        from services.gpu_client import gpu_client

        health = await gpu_client.health_check()
        if not health.get("healthy"):
            raise RuntimeError("GPU server is not available")

    temp = get_temp_dir(job_id)
    scenes = params.get("scenes", [{"prompt": "Beautiful landscape with mountains", "duration": 5}])
    style = params.get("style", "cinematic, professional")
    generate_music = params.get("generate_music", True)
    music_prompt = params.get("music_prompt", "Upbeat corporate background music")
    width = params.get("width", 1080)
    height = params.get("height", 1920)

    try:
        total_scenes = len(scenes)
        clips = []

        # Step 1: Generate key frame images (30%)
        update_job(job_id, progress=5, step="Generating key frames")
        for i, scene in enumerate(scenes):
            prompt = f"{scene['prompt']}, {style}"
            img_path = str(temp / f"frame_{i}.png")
            await flux_image_wrapper.generate(prompt, img_path, width, height)

            pct = 5 + int(25 * (i + 1) / total_scenes)
            update_job(job_id, progress=pct, step=f"Generated frame {i+1}/{total_scenes}")
            if settings.MOCK_MODE:
                await asyncio.sleep(0.5)

        update_job(job_id, progress=30, step="Key frames complete")

        # Step 2: Animate images into video clips (70%)
        update_job(job_id, progress=35, step="Animating scenes")
        for i, scene in enumerate(scenes):
            img_path = str(temp / f"frame_{i}.png")
            clip_path = str(temp / f"clip_{i}.mp4")
            duration = scene.get("duration", 5)

            await wan_video_wrapper.image_to_video(
                img_path, clip_path, prompt=scene["prompt"], duration=duration
            )
            clips.append(clip_path)

            pct = 30 + int(40 * (i + 1) / total_scenes)
            update_job(job_id, progress=pct, step=f"Animated scene {i+1}/{total_scenes}")
            if settings.MOCK_MODE:
                await asyncio.sleep(1)

        update_job(job_id, progress=70, step="Scenes animated")

        # Step 3: Stitch clips (85%)
        update_job(job_id, progress=75, step="Stitching clips")
        stitched_path = str(temp / "stitched.mp4")
        stitch_clips(clips, stitched_path)

        if settings.MOCK_MODE:
            await asyncio.sleep(0.5)
        update_job(job_id, progress=85, step="Clips stitched")

        # Step 4: Generate background music (95%)
        final_path = stitched_path
        if generate_music:
            update_job(job_id, progress=88, step="Generating music")
            total_duration = sum(s.get("duration", 5) for s in scenes)
            music_path = str(temp / "music.wav")
            await music_gen_wrapper.generate(music_prompt, music_path, total_duration)

            final_with_music = str(temp / "final.mp4")
            add_audio(stitched_path, music_path, final_with_music)
            final_path = final_with_music

            if settings.MOCK_MODE:
                await asyncio.sleep(0.5)
            update_job(job_id, progress=95, step="Music added")

        # Save output
        output_path = save_output(job_id, final_path, "broll.mp4")
        update_job(job_id, progress=100, step="Complete")
        cleanup_temp(job_id)

        logger.info(f"B-roll complete: {output_path}")
        return output_path

    except Exception as e:
        logger.exception(f"B-roll workflow failed: {e}")
        cleanup_temp(job_id)
        raise
