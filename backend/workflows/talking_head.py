"""Workflow A — Talking Head Video.
Script + avatar photo + voice → professional talking head video with captions.
"""

import asyncio
import logging
from config import settings
from services.job_queue import update_job
from services.storage_service import get_temp_dir, save_output, cleanup_temp
from services.ffmpeg_service import composite_video, generate_test_video
from services.caption_service import generate_captions
from models.fish_speech import fish_speech_wrapper
from models.cosy_voice import cosy_voice_wrapper
from models.live_portrait import live_portrait_wrapper
from models.flux_image import flux_image_wrapper

logger = logging.getLogger(__name__)


async def execute_talking_head(job_id: str, params: dict) -> str:
    """Execute the full talking head pipeline.

    Params:
        script: str — the text script
        avatar_path: str — path to avatar photo
        voice_engine: str — "fish_speech" or "cosy_voice"
        voice_reference: str | None — path to voice reference audio
        language: str — language code
        generate_background: bool — whether to generate AI background
        background_prompt: str — prompt for background generation
    """
    # GPU health check (non-mock mode only)
    if not settings.MOCK_MODE:
        from services.gpu_client import gpu_client

        health = await gpu_client.health_check()
        if not health.get("healthy"):
            raise RuntimeError("GPU server is not available")

    temp = get_temp_dir(job_id)
    script = params.get("script", "Hello, welcome to Skyie Studio!")
    avatar_path = params.get("avatar_path", "")
    voice_engine = params.get("voice_engine", "fish_speech")
    voice_reference = params.get("voice_reference")
    language = params.get("language", "en")
    generate_background = params.get("generate_background", True)
    background_prompt = params.get("background_prompt", "Professional studio background, soft lighting")

    try:
        # Step 1: Generate audio from script (20%)
        update_job(job_id, progress=5, step="Generating speech audio")
        audio_path = str(temp / "speech.wav")
        if voice_engine == "cosy_voice":
            await cosy_voice_wrapper.generate(script, audio_path, language=language)
        else:
            await fish_speech_wrapper.generate(script, audio_path, voice_reference, language)

        if settings.MOCK_MODE:
            await asyncio.sleep(1)
        update_job(job_id, progress=20, step="Speech audio generated")

        # Step 2: Animate avatar face synced to audio (50%)
        update_job(job_id, progress=25, step="Animating avatar")
        face_video_path = str(temp / "face.mp4")
        if avatar_path:
            await live_portrait_wrapper.animate(avatar_path, audio_path, face_video_path)
        else:
            # No avatar — generate a simple video with audio
            generate_test_video(face_video_path, duration=5.0, width=512, height=512)

        if settings.MOCK_MODE:
            await asyncio.sleep(1.5)
        update_job(job_id, progress=50, step="Avatar animated")

        # Step 3: Generate background image (60%)
        if generate_background:
            update_job(job_id, progress=55, step="Generating background")
            bg_path = str(temp / "background.png")
            await flux_image_wrapper.generate(background_prompt, bg_path, 1080, 1920)
            if settings.MOCK_MODE:
                await asyncio.sleep(0.5)
            update_job(job_id, progress=60, step="Background generated")
        else:
            bg_path = None

        # Step 4: Composite face over background (75%)
        update_job(job_id, progress=65, step="Compositing video")
        composite_path = str(temp / "composite.mp4")
        if bg_path:
            composite_video(face_video_path, bg_path, composite_path)
        else:
            import shutil
            shutil.copy2(face_video_path, composite_path)

        if settings.MOCK_MODE:
            await asyncio.sleep(0.5)
        update_job(job_id, progress=75, step="Video composited")

        # Step 5: Generate captions (85%)
        update_job(job_id, progress=78, step="Generating captions")
        srt_path = str(temp / "captions.srt")
        await generate_captions(audio_path, srt_path)

        if settings.MOCK_MODE:
            await asyncio.sleep(0.5)
        update_job(job_id, progress=85, step="Captions generated")

        # Step 6: Burn captions + encode final (100%)
        update_job(job_id, progress=88, step="Encoding final video")
        final_path = str(temp / "final.mp4")
        # In mock mode, just use the composite as final (subtitle burn requires real SRT sync)
        if settings.MOCK_MODE:
            import shutil
            shutil.copy2(composite_path, final_path)
            await asyncio.sleep(0.5)
        else:
            from services.ffmpeg_service import burn_captions
            burn_captions(composite_path, srt_path, final_path)

        # Save output
        output_path = save_output(job_id, final_path, "talking_head.mp4")
        update_job(job_id, progress=100, step="Complete")

        # Cleanup temp files
        cleanup_temp(job_id)

        logger.info(f"Talking head complete: {output_path}")
        return output_path

    except Exception as e:
        logger.exception(f"Talking head workflow failed: {e}")
        cleanup_temp(job_id)
        raise
