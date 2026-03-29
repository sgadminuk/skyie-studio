from __future__ import annotations
"""Workflow — AI Director (Phase 8).
One prompt → AI plans the entire video → orchestrates all sub-workflows.
"""

import asyncio
import json
import logging

from config import settings
from services.job_queue import update_job
from services.storage_service import get_temp_dir, save_output, cleanup_temp
from services.ffmpeg_service import stitch_clips, add_audio
from models.flux_image import flux_image_wrapper
from models.wan_video import wan_video_wrapper
from models.fish_speech import fish_speech_wrapper
from models.music_gen import music_gen_wrapper

logger = logging.getLogger(__name__)

DIRECTOR_SYSTEM_PROMPT = """You are an expert video production AI director. Given a topic or idea, you create a detailed production plan.

Output a JSON object with this structure:
{
  "title": "Video title",
  "scenes": [
    {
      "type": "talking" | "broll",
      "script": "Narration text (for talking scenes) or visual description (for broll)",
      "visual_prompt": "Detailed image generation prompt for this scene",
      "duration": 5,
      "camera": "static" | "pan_left" | "pan_right" | "zoom_in" | "zoom_out"
    }
  ],
  "music_prompt": "Background music description",
  "style": "Overall visual style description"
}

Rules:
- Create 4-8 scenes for a 30-60 second video
- Alternate between talking and broll scenes for variety
- Visual prompts should be detailed and cinematic
- Keep scripts concise and engaging
- Output ONLY valid JSON, no markdown"""


async def execute_director(job_id: str, params: dict) -> str:
    """Execute the AI Director pipeline.

    Params:
        idea: str — one-sentence video idea/topic
        style: str — visual style override
        voice_engine: str — TTS engine
        language: str — language code
        template: str — optional template type
        duration_target: int — target duration in seconds
    """
    if not settings.MOCK_MODE:
        from services.gpu_client import gpu_client
        health = await gpu_client.health_check()
        if not health.get("healthy"):
            raise RuntimeError("GPU server is not available")

    temp = get_temp_dir(job_id)
    idea = params.get("idea", "")
    style = params.get("style", "cinematic, professional, high quality")
    voice_engine = params.get("voice_engine", "fish_speech")
    language = params.get("language", "en")
    template = params.get("template", "general")
    duration_target = params.get("duration_target", 45)

    if not idea:
        raise ValueError("No idea/topic provided")

    try:
        # Step 1: AI plans the video (10%)
        update_job(job_id, progress=2, step="AI Director planning video")
        plan = await _generate_plan(idea, style, template, duration_target)
        if settings.MOCK_MODE:
            await asyncio.sleep(1)
        update_job(job_id, progress=10, step=f"Plan ready: {len(plan['scenes'])} scenes")

        scenes = plan["scenes"]
        total_scenes = len(scenes)
        clips = []

        # Step 2: Generate visuals for each scene (10% → 60%)
        for i, scene in enumerate(scenes):
            scene_type = scene.get("type", "broll")
            visual_prompt = f"{scene.get('visual_prompt', scene.get('script', ''))}, {style}"
            duration = scene.get("duration", 5)

            update_job(job_id, progress=10 + int(50 * i / total_scenes),
                       step=f"Generating scene {i+1}/{total_scenes}")

            # Generate key frame
            frame_path = str(temp / f"frame_{i}.png")
            await flux_image_wrapper.generate(visual_prompt, frame_path, 1920, 1080)

            # Animate to video
            clip_path = str(temp / f"clip_{i}.mp4")
            await wan_video_wrapper.image_to_video(
                frame_path, clip_path,
                prompt=visual_prompt,
                duration=duration,
            )
            clips.append(clip_path)

            if settings.MOCK_MODE:
                await asyncio.sleep(0.5)

        update_job(job_id, progress=60, step="All scenes generated")

        # Step 3: Generate narration (60% → 75%)
        talking_scenes = [s for s in scenes if s.get("type") == "talking"]
        if talking_scenes:
            update_job(job_id, progress=62, step="Generating narration")
            full_script = " ".join(s.get("script", "") for s in talking_scenes)
            narration_path = str(temp / "narration.wav")
            await fish_speech_wrapper.generate(full_script, narration_path, language=language)
            if settings.MOCK_MODE:
                await asyncio.sleep(1)
            update_job(job_id, progress=75, step="Narration generated")
        else:
            narration_path = None

        # Step 4: Stitch and mix (75% → 95%)
        update_job(job_id, progress=77, step="Stitching clips")
        stitched_path = str(temp / "stitched.mp4")
        stitch_clips(clips, stitched_path)

        # Add narration if available
        current_path = stitched_path
        if narration_path:
            with_narration = str(temp / "with_narration.mp4")
            from services.ffmpeg_service import add_audio as mix_audio
            mix_audio(current_path, narration_path, with_narration, mix=False)
            current_path = with_narration

        # Generate and add background music
        update_job(job_id, progress=85, step="Generating music")
        music_prompt = plan.get("music_prompt", "Cinematic background music")
        total_duration = sum(s.get("duration", 5) for s in scenes)
        music_path = str(temp / "music.wav")
        await music_gen_wrapper.generate(music_prompt, music_path, total_duration)

        final_path = str(temp / "final.mp4")
        add_audio(current_path, music_path, final_path, mix=True)
        if settings.MOCK_MODE:
            await asyncio.sleep(0.5)
        update_job(job_id, progress=95, step="Audio mixed")

        # Save
        output_path = save_output(job_id, final_path, "director.mp4")
        update_job(job_id, progress=100, step="Complete")
        cleanup_temp(job_id)

        logger.info("Director complete: %s (%d scenes)", output_path, total_scenes)
        return output_path

    except Exception as e:
        logger.exception("Director workflow failed: %s", e)
        cleanup_temp(job_id)
        raise


async def _generate_plan(idea: str, style: str, template: str, duration_target: int) -> dict:
    """Use LLM to generate a production plan from a simple idea."""
    if settings.MOCK_MODE:
        return _mock_plan(idea, duration_target)

    try:
        from services.llm_service import call_llm
        user_prompt = (
            f"Create a video production plan for: {idea}\n"
            f"Style: {style}\n"
            f"Template: {template}\n"
            f"Target duration: ~{duration_target} seconds"
        )
        response = await call_llm(DIRECTOR_SYSTEM_PROMPT, user_prompt)
        return json.loads(response)
    except Exception as e:
        logger.warning("LLM plan generation failed, using mock: %s", e)
        return _mock_plan(idea, duration_target)


def _mock_plan(idea: str, duration_target: int) -> dict:
    """Generate a reasonable mock production plan."""
    scene_count = max(4, duration_target // 8)
    scenes = []
    for i in range(scene_count):
        if i % 2 == 0:
            scenes.append({
                "type": "broll",
                "script": f"Visual scene {i+1} for: {idea}",
                "visual_prompt": f"Cinematic establishing shot related to {idea}, professional lighting, 4K",
                "duration": 5,
                "camera": "zoom_in" if i == 0 else "pan_right",
            })
        else:
            scenes.append({
                "type": "talking",
                "script": f"Exploring the topic of {idea}. This is an important aspect to consider.",
                "visual_prompt": f"Professional presenter discussing {idea}, studio background",
                "duration": 7,
                "camera": "static",
            })

    return {
        "title": f"Video about {idea}",
        "scenes": scenes,
        "music_prompt": "Professional cinematic background music, subtle and engaging",
        "style": "cinematic, professional, high quality",
    }
