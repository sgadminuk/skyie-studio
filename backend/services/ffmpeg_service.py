"""Video compositing with FFmpeg. Generates placeholder videos in mock mode."""

import subprocess
import logging
from pathlib import Path
from config import settings

logger = logging.getLogger(__name__)


def _run_ffmpeg(args: list[str], desc: str = ""):
    """Run an FFmpeg command."""
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "warning"] + args
    logger.info(f"FFmpeg ({desc}): {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg failed ({desc}): {result.stderr}")
    return result


def generate_test_video(output: str, duration: float = 3.0, width: int = 1080, height: int = 1920):
    """Generate a color-bar test video (used in mock mode)."""
    _run_ffmpeg([
        "-f", "lavfi", "-i", f"color=c=0x1a1a2e:s={width}x{height}:d={duration}",
        "-f", "lavfi", "-i", f"sine=frequency=440:duration={duration}",
        "-vf", (
            f"drawtext=text='SKYIE STUDIO':fontsize=48:fontcolor=white:"
            f"x=(w-text_w)/2:y=(h-text_h)/2-40,"
            f"drawtext=text='Mock Output':fontsize=32:fontcolor=gray:"
            f"x=(w-text_w)/2:y=(h-text_h)/2+40"
        ),
        "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac",
        "-shortest", output,
    ], "test video")
    return output


def generate_silent_audio(output: str, duration: float = 5.0):
    """Generate a silent audio file."""
    _run_ffmpeg([
        "-f", "lavfi", "-i", f"anullsrc=r=44100:cl=mono",
        "-t", str(duration), "-c:a", "aac", output,
    ], "silent audio")
    return output


def composite_video(face_video: str, background: str, output: str):
    """Overlay face video on a background image/video."""
    _run_ffmpeg([
        "-i", background, "-i", face_video,
        "-filter_complex", "[1:v]scale=400:400[face];[0:v][face]overlay=(W-w)/2:(H-h)/2-100",
        "-c:v", "libx264", "-preset", "fast", "-c:a", "copy",
        "-shortest", output,
    ], "composite")
    return output


def stitch_clips(clips: list[str], output: str):
    """Concatenate video clips with crossfade transitions."""
    if not clips:
        raise ValueError("No clips to stitch")

    if len(clips) == 1:
        import shutil
        shutil.copy2(clips[0], output)
        return output

    # Create concat file
    concat_file = Path(output).parent / "concat.txt"
    with open(concat_file, "w") as f:
        for clip in clips:
            f.write(f"file '{clip}'\n")

    _run_ffmpeg([
        "-f", "concat", "-safe", "0", "-i", str(concat_file),
        "-c:v", "libx264", "-preset", "fast", "-c:a", "aac",
        output,
    ], "stitch")

    concat_file.unlink(missing_ok=True)
    return output


def add_audio(video: str, audio: str, output: str, mix: bool = True):
    """Add/mix audio track to a video."""
    if mix:
        _run_ffmpeg([
            "-i", video, "-i", audio,
            "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=first[a]",
            "-map", "0:v", "-map", "[a]",
            "-c:v", "copy", "-c:a", "aac", "-shortest", output,
        ], "add audio (mix)")
    else:
        _run_ffmpeg([
            "-i", video, "-i", audio,
            "-map", "0:v", "-map", "1:a",
            "-c:v", "copy", "-c:a", "aac", "-shortest", output,
        ], "add audio (replace)")
    return output


def burn_captions(video: str, srt_file: str, output: str):
    """Burn subtitles onto video."""
    _run_ffmpeg([
        "-i", video,
        "-vf", f"subtitles={srt_file}:force_style='FontSize=24,PrimaryColour=&Hffffff&,OutlineColour=&H000000&,Outline=2'",
        "-c:v", "libx264", "-preset", "fast", "-c:a", "copy",
        output,
    ], "burn captions")
    return output


def export_format(video: str, output: str, width: int, height: int):
    """Export video to a specific aspect ratio with padding."""
    _run_ffmpeg([
        "-i", video,
        "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black",
        "-c:v", "libx264", "-preset", "fast", "-c:a", "copy",
        output,
    ], f"export {width}x{height}")
    return output


def export_all_formats(video: str, output_dir: str) -> dict[str, str]:
    """Export video to all social media formats."""
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    formats = {
        "vertical_9_16": (1080, 1920),   # TikTok, Reels
        "horizontal_16_9": (1920, 1080),  # YouTube
        "square_1_1": (1080, 1080),       # Instagram
    }
    outputs = {}
    for name, (w, h) in formats.items():
        out = str(Path(output_dir) / f"{name}.mp4")
        export_format(video, out, w, h)
        outputs[name] = out
    return outputs
