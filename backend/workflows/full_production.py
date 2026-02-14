"""Workflow C — Full Production.
Full script with scene descriptions → talking head + b-roll → final composite.
"""

import asyncio
import logging
import re
from config import settings
from services.job_queue import update_job
from services.storage_service import get_temp_dir, save_output, cleanup_temp
from services.ffmpeg_service import stitch_clips, add_audio, generate_test_video
from models.music_gen import music_gen_wrapper

logger = logging.getLogger(__name__)


def parse_script(script: str) -> list[dict]:
    """Parse a script into segments.

    Format:
        [TALKING] Speaker text here...
        [BROLL: description of scene] Optional narration text
        [TALKING] More speaker text...

    Returns list of {type, text, prompt?}
    """
    segments = []
    lines = script.strip().split("\n")
    current_segment = None

    for line in lines:
        line = line.strip()
        if not line:
            continue

        talking_match = re.match(r"^\[TALKING\]\s*(.*)", line, re.IGNORECASE)
        broll_match = re.match(r"^\[BROLL:\s*(.*?)\]\s*(.*)?", line, re.IGNORECASE)

        if talking_match:
            if current_segment:
                segments.append(current_segment)
            current_segment = {"type": "talking", "text": talking_match.group(1)}
        elif broll_match:
            if current_segment:
                segments.append(current_segment)
            current_segment = {
                "type": "broll",
                "prompt": broll_match.group(1),
                "text": broll_match.group(2) or "",
            }
        elif current_segment:
            # Continue previous segment
            current_segment["text"] = current_segment.get("text", "") + " " + line

    if current_segment:
        segments.append(current_segment)

    # If no markers found, treat entire script as talking head
    if not segments:
        segments = [{"type": "talking", "text": script}]

    return segments


async def execute_full_production(job_id: str, params: dict) -> str:
    """Execute the full production pipeline.

    Params:
        script: str — full script with [TALKING] and [BROLL:] markers
        avatar_path: str — path to avatar photo
        voice_engine: str — TTS engine
        voice_reference: str | None — voice clone reference
        language: str — language code
        generate_music: bool — add background music
        music_prompt: str — music description
        background_prompt: str — default background for talking segments
    """
    # GPU health check (non-mock mode only)
    if not settings.MOCK_MODE:
        from services.gpu_client import gpu_client

        health = await gpu_client.health_check()
        if not health.get("healthy"):
            raise RuntimeError("GPU server is not available")

    temp = get_temp_dir(job_id)
    script = params.get("script", "[TALKING] Hello from Skyie Studio!")
    avatar_path = params.get("avatar_path", "")
    voice_engine = params.get("voice_engine", "fish_speech")
    voice_reference = params.get("voice_reference")
    language = params.get("language", "en")
    generate_music = params.get("generate_music", True)
    music_prompt = params.get("music_prompt", "Professional background music")
    params.get("background_prompt", "Professional studio background")

    try:
        # Step 1: Parse script (5%)
        update_job(job_id, progress=5, step="Parsing script")
        segments = parse_script(script)
        logger.info(f"Parsed {len(segments)} segments: {[s['type'] for s in segments]}")

        if settings.MOCK_MODE:
            await asyncio.sleep(0.3)

        # Step 2+3: Process segments (5% → 70%)
        segment_clips = []
        total_segments = len(segments)
        progress_per_segment = 65.0 / max(total_segments, 1)

        for i, segment in enumerate(segments):
            seg_temp = temp / f"segment_{i}"
            seg_temp.mkdir(exist_ok=True)
            base_progress = 5 + int(progress_per_segment * i)

            if segment["type"] == "talking":
                update_job(job_id, progress=base_progress, step=f"Processing talking segment {i+1}")
                clip_path = str(seg_temp / "talking.mp4")

                # Generate TTS
                audio_path = str(seg_temp / "speech.wav")
                if voice_engine == "cosy_voice":
                    from models.cosy_voice import cosy_voice_wrapper
                    await cosy_voice_wrapper.generate(segment["text"], audio_path, language=language)
                else:
                    from models.fish_speech import fish_speech_wrapper
                    await fish_speech_wrapper.generate(segment["text"], audio_path, voice_reference, language)

                # Animate face
                from models.live_portrait import live_portrait_wrapper
                if avatar_path:
                    await live_portrait_wrapper.animate(avatar_path, audio_path, clip_path)
                else:
                    generate_test_video(clip_path, duration=5.0, width=1080, height=1920)

                segment_clips.append(clip_path)

            elif segment["type"] == "broll":
                update_job(job_id, progress=base_progress, step=f"Processing b-roll segment {i+1}")
                clip_path = str(seg_temp / "broll.mp4")

                from models.flux_image import flux_image_wrapper
                from models.wan_video import wan_video_wrapper

                img_path = str(seg_temp / "frame.png")
                await flux_image_wrapper.generate(segment["prompt"], img_path, 1080, 1920)
                await wan_video_wrapper.image_to_video(img_path, clip_path, segment["prompt"])
                segment_clips.append(clip_path)

            if settings.MOCK_MODE:
                await asyncio.sleep(1)

        update_job(job_id, progress=70, step="All segments processed")

        # Step 4: Stitch all segments (80%)
        update_job(job_id, progress=75, step="Stitching segments")
        stitched_path = str(temp / "stitched.mp4")
        stitch_clips(segment_clips, stitched_path)

        if settings.MOCK_MODE:
            await asyncio.sleep(0.5)
        update_job(job_id, progress=80, step="Segments stitched")

        # Step 5: Generate full captions (85%)
        update_job(job_id, progress=82, step="Generating captions")
        srt_path = str(temp / "captions.srt")
        full_text = " ".join(s.get("text", "") for s in segments)
        from services.caption_service import generate_mock_srt
        generate_mock_srt(srt_path, full_text, duration=len(segments) * 5)

        if settings.MOCK_MODE:
            await asyncio.sleep(0.3)
        update_job(job_id, progress=85, step="Captions generated")

        # Step 6: Background music (90%)
        final_path = stitched_path
        if generate_music:
            update_job(job_id, progress=87, step="Generating music")
            music_path = str(temp / "music.wav")
            duration = len(segments) * 5
            await music_gen_wrapper.generate(music_prompt, music_path, duration)

            final_with_music = str(temp / "with_music.mp4")
            add_audio(stitched_path, music_path, final_with_music)
            final_path = final_with_music

            if settings.MOCK_MODE:
                await asyncio.sleep(0.5)
            update_job(job_id, progress=90, step="Music added")

        # Step 7: Final composite + save (100%)
        update_job(job_id, progress=95, step="Finalizing")
        output_path = save_output(job_id, final_path, "full_production.mp4")
        update_job(job_id, progress=100, step="Complete")
        cleanup_temp(job_id)

        logger.info(f"Full production complete: {output_path}")
        return output_path

    except Exception as e:
        logger.exception(f"Full production workflow failed: {e}")
        cleanup_temp(job_id)
        raise
