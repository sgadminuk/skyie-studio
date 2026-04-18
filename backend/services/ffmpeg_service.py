"""Video compositing with FFmpeg. Generates placeholder videos in mock mode."""

import json
import subprocess
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def _run_ffmpeg(args: list[str], desc: str = ""):
    """Run an FFmpeg command."""
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "warning"] + args
    logger.info(f"FFmpeg ({desc}): {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg failed ({desc}): {result.stderr}")
    return result


def _probe_stream(path: str) -> dict:
    """Return codec/width/height/fps/duration for the first video stream."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-print_format", "json",
            "-show_streams", "-select_streams", "v:0",
            "-show_entries",
            "stream=codec_name,width,height,r_frame_rate,duration",
            path,
        ],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed for {path}: {result.stderr}")
    data = json.loads(result.stdout)
    streams = data.get("streams") or []
    if not streams:
        raise RuntimeError(f"ffprobe found no video stream in {path}")
    return streams[0]


def _streams_uniform(clips: list[str]) -> bool:
    """True iff all clips share codec + resolution + fps (so we can `-c copy`)."""
    try:
        probes = [_probe_stream(c) for c in clips]
    except RuntimeError as e:
        logger.warning("Falling back to re-encode stitch: %s", e)
        return False
    keys = {(p["codec_name"], p["width"], p["height"], p["r_frame_rate"]) for p in probes}
    return len(keys) == 1


def generate_test_video(output: str, duration: float = 3.0, width: int = 1080, height: int = 1920):
    """Generate a color-bar test video (used in mock mode)."""
    _run_ffmpeg([
        "-f", "lavfi", "-i", f"color=c=0x1a1a2e:s={width}x{height}:d={duration}",
        "-f", "lavfi", "-i", f"sine=frequency=440:duration={duration}",
        "-vf", (
            "drawtext=text='SKYIE STUDIO':fontsize=48:fontcolor=white:"
            "x=(w-text_w)/2:y=(h-text_h)/2-40,"
            "drawtext=text='Mock Output':fontsize=32:fontcolor=gray:"
            "x=(w-text_w)/2:y=(h-text_h)/2+40"
        ),
        "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac",
        "-shortest", output,
    ], "test video")
    return output


def generate_silent_audio(output: str, duration: float = 5.0):
    """Generate a silent audio file."""
    _run_ffmpeg([
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
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
    """Hard-cut concatenate clips. Uses stream-copy when codecs/res/fps match."""
    if not clips:
        raise ValueError("No clips to stitch")

    if len(clips) == 1:
        import shutil
        shutil.copy2(clips[0], output)
        return output

    concat_file = Path(output).parent / "concat.txt"
    with open(concat_file, "w") as f:
        for clip in clips:
            # Demuxer requires single-quote-escaped paths.
            safe = clip.replace("'", "'\\''")
            f.write(f"file '{safe}'\n")

    if _streams_uniform(clips):
        _run_ffmpeg([
            "-f", "concat", "-safe", "0", "-i", str(concat_file),
            "-c", "copy", output,
        ], "stitch (copy)")
    else:
        _run_ffmpeg([
            "-f", "concat", "-safe", "0", "-i", str(concat_file),
            "-c:v", "libx264", "-preset", "fast", "-c:a", "aac",
            output,
        ], "stitch (re-encode)")

    concat_file.unlink(missing_ok=True)
    return output


def stitch_with_crossfade(clips: list[str], output: str, fade_sec: float = 0.5):
    """Concatenate clips with a crossfade (xfade) + audio crossfade between each pair.

    Requires re-encode. Probes each clip's duration to compute xfade offsets.
    """
    if not clips:
        raise ValueError("No clips to stitch")
    if len(clips) == 1:
        import shutil
        shutil.copy2(clips[0], output)
        return output

    probes = [_probe_stream(c) for c in clips]
    durations: list[float] = []
    for p in probes:
        d = p.get("duration")
        if d is None:
            raise RuntimeError("crossfade requires probe-able duration on every clip")
        durations.append(float(d))

    inputs: list[str] = []
    for c in clips:
        inputs.extend(["-i", c])

    # Build a chain of xfade/acrossfade filters. Offset for the Nth join is
    # cumulative duration of clips 0..N-1 minus N*fade (each fade overlaps).
    v_filters: list[str] = []
    a_filters: list[str] = []
    cur_v = "[0:v]"
    cur_a = "[0:a]"
    cum_offset = durations[0] - fade_sec
    for i in range(1, len(clips)):
        v_out = f"[v{i}]"
        a_out = f"[a{i}]"
        v_filters.append(
            f"{cur_v}[{i}:v]xfade=transition=fade:duration={fade_sec}:offset={cum_offset:.3f}{v_out}"
        )
        a_filters.append(
            f"{cur_a}[{i}:a]acrossfade=d={fade_sec}{a_out}"
        )
        cur_v = v_out
        cur_a = a_out
        cum_offset += durations[i] - fade_sec

    filter_complex = ";".join(v_filters + a_filters)

    _run_ffmpeg(
        inputs + [
            "-filter_complex", filter_complex,
            "-map", cur_v, "-map", cur_a,
            "-c:v", "libx264", "-preset", "fast", "-c:a", "aac",
            output,
        ],
        "stitch (crossfade)",
    )
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
        "-vf", (
            f"subtitles={srt_file}:force_style="
            "'FontSize=24,PrimaryColour=&Hffffff&,OutlineColour=&H000000&,Outline=2'"
        ),
        "-c:v", "libx264", "-preset", "fast", "-c:a", "copy",
        output,
    ], "burn captions")
    return output


def export_format(video: str, output: str, width: int, height: int):
    """Export video to a specific aspect ratio with padding."""
    _run_ffmpeg([
        "-i", video,
        "-vf", (
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black"
        ),
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


def add_watermark(
    video: str,
    output: str,
    text: str = "Skyie Studio",
    position: str = "bottom_right",
    opacity: float = 0.5,
    font_size: int = 24,
) -> str:
    """Burn a semi-transparent text watermark onto a video.

    Args:
        video: Path to the source video.
        output: Path for the watermarked output.
        text: Watermark text to display.
        position: One of 'bottom_right', 'bottom_left', 'top_right', 'top_left', 'center'.
        opacity: Text opacity (0.0 to 1.0).
        font_size: Font size for the watermark text.

    Returns:
        The output file path.
    """
    # Map position names to FFmpeg x:y expressions
    position_map = {
        "bottom_right": "x=w-tw-20:y=h-th-20",
        "bottom_left": "x=20:y=h-th-20",
        "top_right": "x=w-tw-20:y=20",
        "top_left": "x=20:y=20",
        "center": "x=(w-tw)/2:y=(h-th)/2",
    }
    pos_expr = position_map.get(position, position_map["bottom_right"])

    font_color = f"white@{opacity}"

    _run_ffmpeg([
        "-i", video,
        "-vf", (
            f"drawtext=text='{text}':"
            f"fontsize={font_size}:"
            f"fontcolor={font_color}:"
            f"{pos_expr}"
        ),
        "-c:v", "libx264", "-preset", "fast", "-c:a", "copy",
        output,
    ], "add watermark")
    return output
