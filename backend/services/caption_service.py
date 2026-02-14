"""Caption generation and burn-in service."""

import logging
from pathlib import Path
from config import settings

logger = logging.getLogger(__name__)


def generate_mock_srt(output: str, text: str, duration: float = 10.0) -> str:
    """Generate a mock SRT caption file from text."""
    words = text.split()
    srt_lines = []
    words_per_segment = 8
    segments = [words[i:i + words_per_segment] for i in range(0, len(words), words_per_segment)]
    time_per_segment = duration / max(len(segments), 1)

    for i, segment in enumerate(segments):
        start = i * time_per_segment
        end = start + time_per_segment
        srt_lines.append(str(i + 1))
        srt_lines.append(f"{_format_time(start)} --> {_format_time(end)}")
        srt_lines.append(" ".join(segment))
        srt_lines.append("")

    Path(output).write_text("\n".join(srt_lines))
    return output


async def generate_captions(audio_path: str, output: str) -> str:
    """Generate captions from audio using Whisper."""
    if settings.MOCK_MODE:
        logger.info("[MOCK] Generating captions")
        return generate_mock_srt(output, "This is a mock caption for the generated video content.", 10.0)

    from models.whisper_caption import whisper_wrapper
    return await whisper_wrapper.transcribe(audio_path, output)


def _format_time(seconds: float) -> str:
    """Format seconds as SRT timestamp (HH:MM:SS,mmm)."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
