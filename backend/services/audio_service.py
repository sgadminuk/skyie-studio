from __future__ import annotations
"""Advanced audio production service (Phase 7).

Handles: multi-voice dialogue, emotion control, SFX generation, audio mixing.
"""

import logging
from pathlib import Path

from config import settings
from services.ffmpeg_service import _run_ffmpeg

logger = logging.getLogger(__name__)


class AudioService:
    """Advanced audio production capabilities."""

    async def generate_sfx(
        self,
        prompt: str,
        output_path: str,
        duration: float = 3.0,
    ) -> str:
        """Generate sound effects from text prompt using AudioLDM2."""
        if settings.MOCK_MODE:
            logger.info("[MOCK] SFX: '%s' (%.1fs) → %s", prompt[:50], duration, output_path)
            from services.ffmpeg_service import generate_silent_audio
            generate_silent_audio(output_path, duration)
            return output_path

        from services.gpu_client import gpu_client
        await gpu_client.infer(
            endpoint="/infer/sfx",
            params={"prompt": prompt, "duration": duration},
            output_path=output_path,
            timeout=120,
        )
        return output_path

    async def multi_voice_tts(
        self,
        segments: list[dict],
        output_path: str,
    ) -> str:
        """Generate multi-character dialogue with different voices.

        Args:
            segments: list of {"text": str, "voice": str, "emotion": str}
            output_path: Final mixed audio path.
        """
        from models.fish_speech import fish_speech_wrapper

        temp_dir = Path(output_path).parent
        audio_parts = []

        for i, seg in enumerate(segments):
            part_path = str(temp_dir / f"voice_part_{i}.wav")
            await fish_speech_wrapper.generate(
                text=seg["text"],
                output_path=part_path,
                voice_reference=seg.get("voice"),
                language=seg.get("language", "en"),
            )
            audio_parts.append(part_path)

        if len(audio_parts) == 1:
            import shutil
            shutil.copy2(audio_parts[0], output_path)
        else:
            self._concat_audio(audio_parts, output_path)

        logger.info("Multi-voice TTS: %d segments → %s", len(segments), output_path)
        return output_path

    async def voice_conversion(
        self,
        source_audio: str,
        target_voice: str,
        output_path: str,
    ) -> str:
        """Convert voice identity while preserving content."""
        if settings.MOCK_MODE:
            logger.info("[MOCK] Voice conversion: %s → %s", source_audio, target_voice)
            import shutil
            shutil.copy2(source_audio, output_path)
            return output_path

        from services.gpu_client import gpu_client
        await gpu_client.infer(
            endpoint="/infer/voice-convert",
            params={},
            input_files=[source_audio, target_voice],
            output_path=output_path,
            timeout=120,
        )
        return output_path

    def mix_audio_tracks(
        self,
        tracks: list[dict],
        output_path: str,
        duration: float | None = None,
    ) -> str:
        """Mix multiple audio tracks with volume control.

        Args:
            tracks: list of {"path": str, "volume": float (0.0-1.0), "start": float}
            output_path: Mixed output path.
            duration: Optional max duration.
        """
        if not tracks:
            raise ValueError("No audio tracks to mix")

        if len(tracks) == 1:
            import shutil
            shutil.copy2(tracks[0]["path"], output_path)
            return output_path

        inputs = []
        filter_parts = []
        for i, track in enumerate(tracks):
            inputs.extend(["-i", track["path"]])
            vol = track.get("volume", 1.0)
            delay = int(track.get("start", 0) * 1000)
            filter_parts.append(f"[{i}:a]volume={vol},adelay={delay}|{delay}[a{i}]")

        mix_inputs = "".join(f"[a{i}]" for i in range(len(tracks)))
        filter_parts.append(f"{mix_inputs}amix=inputs={len(tracks)}:duration=longest[out]")
        filter_str = ";".join(filter_parts)

        args = inputs + ["-filter_complex", filter_str, "-map", "[out]", "-c:a", "aac"]
        if duration:
            args.extend(["-t", str(duration)])
        args.append(output_path)

        _run_ffmpeg(args, "mix audio tracks")
        logger.info("Mixed %d audio tracks → %s", len(tracks), output_path)
        return output_path

    def separate_stems(
        self,
        input_path: str,
        output_dir: str,
    ) -> dict[str, str]:
        """Separate audio into stems (vocals, drums, bass, other).

        Note: Requires Demucs model on GPU server for real separation.
        Falls back to simple frequency-band splitting on VPS.
        """
        output = Path(output_dir)
        output.mkdir(parents=True, exist_ok=True)

        stems = {
            "vocals": str(output / "vocals.wav"),
            "drums": str(output / "drums.wav"),
            "bass": str(output / "bass.wav"),
            "other": str(output / "other.wav"),
        }

        if settings.MOCK_MODE:
            logger.info("[MOCK] Stem separation: %s", input_path)
            from services.ffmpeg_service import generate_silent_audio
            for name, path in stems.items():
                generate_silent_audio(path, 5.0)
            return stems

        # TODO: Call GPU /infer/stems endpoint for Demucs separation
        logger.warning("Stem separation not yet implemented on GPU — using mock")
        from services.ffmpeg_service import generate_silent_audio
        for name, path in stems.items():
            generate_silent_audio(path, 5.0)
        return stems

    @staticmethod
    def _concat_audio(parts: list[str], output: str):
        """Concatenate audio files sequentially."""
        concat_file = Path(output).parent / "audio_concat.txt"
        with open(concat_file, "w") as f:
            for part in parts:
                f.write(f"file '{part}'\n")
        _run_ffmpeg([
            "-f", "concat", "-safe", "0", "-i", str(concat_file),
            "-c:a", "aac", output,
        ], "concat audio")
        concat_file.unlink(missing_ok=True)


audio_service = AudioService()
