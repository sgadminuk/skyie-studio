from __future__ import annotations
"""Workflow — Shot Creator (Phase 1).
Upload source images → preprocess → animate each via I2V → stitch into final video.
"""

import asyncio
import logging

from config import settings
from services.job_queue import update_job
from services.storage_service import get_temp_dir, save_output, cleanup_temp
from services.ffmpeg_service import stitch_clips, add_audio
from services.image_preprocess import preprocess_image
from models.wan_video import wan_video_wrapper
from models.music_gen import music_gen_wrapper

logger = logging.getLogger(__name__)


async def execute_shots(job_id: str, params: dict) -> str:
    """Execute the shot-based image-to-video pipeline.

    Params:
        shots: list[dict] — each shot contains:
            images: list[str] — uploaded image paths
            prompts: list[str] — motion/animation prompt per image
            duration: float — seconds per image clip
        aspect_ratio: str — target aspect ratio (e.g. "16:9")
        transition: str — transition type ("cut", "crossfade")
        remove_watermarks: bool — whether to auto-remove watermarks
        auto_enhance: bool — auto-enhance images before animation
        generate_music: bool — whether to generate background music
        music_prompt: str — description for music generation
        width: int — output width
        height: int — output height
    """
    if not settings.MOCK_MODE:
        from services.gpu_client import gpu_client
        health = await gpu_client.health_check()
        if not health.get("healthy"):
            raise RuntimeError("GPU server is not available")

    temp = get_temp_dir(job_id)
    shots = params.get("shots", [])
    aspect_ratio = params.get("aspect_ratio")
    remove_watermarks = params.get("remove_watermarks", False)
    auto_enhance = params.get("auto_enhance", False)
    generate_music = params.get("generate_music", False)
    music_prompt = params.get("music_prompt", "Cinematic background music")
    width = params.get("width", 1920)
    height = params.get("height", 1080)

    if not shots:
        raise ValueError("No shots provided")

    try:
        # Count total images across all shots for progress tracking
        total_images = sum(len(shot.get("images", [])) for shot in shots)
        if total_images == 0:
            raise ValueError("No images provided in any shot")

        processed_count = 0
        all_clips = []

        # Step 1: Preprocess images (20%)
        update_job(job_id, progress=2, step="Preprocessing images")
        for shot_idx, shot in enumerate(shots):
            images = shot.get("images", [])
            for img_idx, img_path in enumerate(images):
                preprocessed_path = str(temp / f"preprocessed_s{shot_idx}_i{img_idx}.png")
                preprocess_image(
                    input_path=img_path,
                    output_path=preprocessed_path,
                    target_ratio=aspect_ratio,
                    target_width=width,
                    target_height=height,
                    remove_watermark=remove_watermarks,
                    auto_enhance=auto_enhance,
                )
                shot.setdefault("_preprocessed", []).append(preprocessed_path)
                processed_count += 1
                pct = 2 + int(18 * processed_count / total_images)
                update_job(job_id, progress=pct, step=f"Preprocessed image {processed_count}/{total_images}")

        update_job(job_id, progress=20, step="Images preprocessed")

        # Step 2: Animate each image via I2V (20% → 80%)
        update_job(job_id, progress=22, step="Animating images")
        animated_count = 0
        for shot_idx, shot in enumerate(shots):
            prompts = shot.get("prompts", [])
            duration = shot.get("duration", 5.0)
            preprocessed = shot.get("_preprocessed", [])

            for img_idx, img_path in enumerate(preprocessed):
                clip_path = str(temp / f"clip_s{shot_idx}_i{img_idx}.mp4")
                prompt = prompts[img_idx] if img_idx < len(prompts) else ""

                await wan_video_wrapper.image_to_video(
                    image_path=img_path,
                    output_path=clip_path,
                    prompt=prompt,
                    duration=duration,
                )
                all_clips.append(clip_path)
                animated_count += 1
                pct = 20 + int(60 * animated_count / total_images)
                update_job(job_id, progress=pct, step=f"Animated clip {animated_count}/{total_images}")

                if settings.MOCK_MODE:
                    await asyncio.sleep(0.5)

        update_job(job_id, progress=80, step="All clips animated")

        # Step 3: Stitch clips (80% → 90%)
        update_job(job_id, progress=82, step="Stitching clips")
        stitched_path = str(temp / "stitched.mp4")
        stitch_clips(all_clips, stitched_path)
        if settings.MOCK_MODE:
            await asyncio.sleep(0.3)
        update_job(job_id, progress=90, step="Clips stitched")

        # Step 4: Generate and add music (90% → 98%)
        final_path = stitched_path
        if generate_music:
            update_job(job_id, progress=91, step="Generating music")
            total_duration = sum(
                shot.get("duration", 5.0) * len(shot.get("images", []))
                for shot in shots
            )
            music_path = str(temp / "music.wav")
            await music_gen_wrapper.generate(music_prompt, music_path, total_duration)

            final_with_music = str(temp / "final.mp4")
            add_audio(stitched_path, music_path, final_with_music)
            final_path = final_with_music
            if settings.MOCK_MODE:
                await asyncio.sleep(0.3)
            update_job(job_id, progress=98, step="Music added")

        # Save output
        output_path = save_output(job_id, final_path, "shots.mp4")
        update_job(job_id, progress=100, step="Complete")
        cleanup_temp(job_id)

        logger.info("Shots workflow complete: %s (%d clips)", output_path, len(all_clips))
        return output_path

    except Exception as e:
        logger.exception("Shots workflow failed: %s", e)
        cleanup_temp(job_id)
        raise
