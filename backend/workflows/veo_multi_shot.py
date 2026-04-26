"""Workflow — Veo 3.1 multi-shot.

Renders 1–10 Veo 3.1 shots concurrently (each with its own prompt and either
1–3 reference images OR a single first-frame image) then stitches them into a
single MP4. Optionally overlays generated background music.

Per-shot state lives inside the parent job's `params.shots_status` so the
WebSocket stream can render a per-shot grid in the UI without a schema change.
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from config import settings
from services.brand_apply_service import compose_prompt_with_brand, fetch_brand_profile
from services.ffmpeg_service import (
    add_audio,
    generate_test_video,
    stitch_clips,
    stitch_with_crossfade,
)
from services.gemini_service import (
    GeminiError,
    GeminiSafetyError,
    estimate_video_cost_usd,
    get_gemini_service,
)
from services.job_queue import update_job
from services.prompt_enhance_service import enhance_veo_prompt
from services.storage_service import cleanup_temp

logger = logging.getLogger(__name__)

MAX_SHOTS = 10
MAX_REFS_PER_SHOT = 3
DEFAULT_CONCURRENCY = 3
ALLOWED_DURATIONS = {4, 6, 8}


def _read_bytes(path: str) -> bytes:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Image not found: {path}")
    return p.read_bytes()


def _publish_shot_status(job_id: str, params: dict, shots_status: list[dict]):
    """Persist per-shot state into the job's params and republish for the WS stream."""
    new_params = {**params, "shots_status": shots_status}
    update_job(job_id, params=new_params)


async def _render_single_shot(
    *,
    shot_idx: int,
    shot: dict,
    parent_aspect: str,
    parent_resolution: str,
    user_id: str | None,
    out_dir: Path,
) -> tuple[str, float]:
    """Render one Veo shot to disk. Returns (clip_path, cost_usd)."""
    prompt = (shot.get("prompt") or "").strip()
    duration = int(shot.get("duration_sec") or settings.GEMINI_DEFAULT_VIDEO_DURATION)
    negative_prompt = shot.get("negative_prompt") or None

    ref_paths: list[str] = shot.get("reference_image_paths") or []
    first_frame_path: str | None = shot.get("first_frame_image_path") or None

    image_bytes = _read_bytes(first_frame_path) if first_frame_path else None
    ref_bytes = [_read_bytes(p) for p in ref_paths] if ref_paths else None

    clip_path = out_dir / f"shot_{shot_idx + 1:02d}.mp4"

    if settings.MOCK_MODE:
        # Don't burn Veo credits in mock mode — render a labelled colour bar.
        target_w, target_h = (1080, 1920) if parent_aspect == "9:16" else (1920, 1080)
        generate_test_video(str(clip_path), duration=float(duration), width=target_w, height=target_h)
        return str(clip_path), 0.0

    service = get_gemini_service()
    result = await service.generate_video(
        prompt,
        image_bytes=image_bytes,
        reference_image_bytes=ref_bytes,
        duration_sec=duration,
        aspect_ratio=parent_aspect,
        resolution=parent_resolution,
        negative_prompt=negative_prompt,
        user_id=user_id,
    )
    clip_path.write_bytes(result.video_bytes)
    return str(clip_path), result.cost_usd


def _validate_params(params: dict) -> tuple[list[dict], dict]:
    """Validate and normalize the request shape. Returns (shots, stitch_cfg)."""
    shots = params.get("shots") or []
    if not (1 <= len(shots) <= MAX_SHOTS):
        raise ValueError(f"shots must contain 1–{MAX_SHOTS} entries (got {len(shots)})")

    for i, shot in enumerate(shots):
        prompt = (shot.get("prompt") or "").strip()
        if not prompt:
            raise ValueError(f"shot {i + 1}: prompt is required")

        duration = int(shot.get("duration_sec") or settings.GEMINI_DEFAULT_VIDEO_DURATION)
        if duration not in ALLOWED_DURATIONS:
            raise ValueError(
                f"shot {i + 1}: duration_sec must be one of {sorted(ALLOWED_DURATIONS)}"
            )

        ref_paths = shot.get("reference_image_paths") or []
        first_frame = shot.get("first_frame_image_path")
        if ref_paths and first_frame:
            raise ValueError(
                f"shot {i + 1}: reference_image_paths and first_frame_image_path are mutually exclusive"
            )
        if len(ref_paths) > MAX_REFS_PER_SHOT:
            raise ValueError(
                f"shot {i + 1}: at most {MAX_REFS_PER_SHOT} reference images allowed"
            )

    stitch_cfg = params.get("stitch") or {}
    mode = stitch_cfg.get("mode", "hard_cut")
    if mode not in ("hard_cut", "crossfade"):
        raise ValueError(f"stitch.mode must be 'hard_cut' or 'crossfade' (got {mode!r})")

    return shots, stitch_cfg


async def _maybe_enhance_prompts(shots: list[dict], user_id: str | None) -> list[dict]:
    """Run prompt enhancement on every shot in parallel; never blocks generation."""
    enhanced = await asyncio.gather(
        *[enhance_veo_prompt(s.get("prompt", ""), user_id=user_id) for s in shots]
    )
    return [{**s, "prompt": p} for s, p in zip(shots, enhanced)]


def _apply_brand_to_shots(shots: list[dict], params: dict) -> list[dict]:
    """If brand_profile_id is set, prefix every shot's prompt with brand context."""
    brand_id = params.get("brand_profile_id")
    user_id = params.get("_user_id")
    if not brand_id or not user_id:
        return shots
    brand = fetch_brand_profile(brand_id, user_id)
    if brand is None:
        logger.warning("brand_profile_id %s not found for user %s", brand_id, user_id)
        return shots
    return [
        {**s, "prompt": compose_prompt_with_brand(s.get("prompt", ""), brand, intent="video")}
        for s in shots
    ]


async def _maybe_add_music(
    *,
    stitched_path: Path,
    out_dir: Path,
    music_cfg: dict,
    total_duration_sec: float,
) -> Path:
    """Generate background music and mix it under the stitched track. Returns final path."""
    if not music_cfg.get("enabled"):
        return stitched_path

    # Lazy import — keeps the workflow importable on machines without the GPU model.
    from models.music_gen import music_gen_wrapper

    music_path = out_dir / "music.wav"
    await music_gen_wrapper.generate(
        music_cfg.get("prompt", "Cinematic background music"),
        str(music_path),
        total_duration_sec,
    )

    final_path = out_dir / "final_with_music.mp4"
    add_audio(str(stitched_path), str(music_path), str(final_path), mix=True)
    return final_path


def _write_manifest(
    out_dir: Path,
    shots: list[dict],
    shots_status: list[dict],
    *,
    aspect_ratio: str,
    resolution: str,
    stitch_cfg: dict,
    total_cost_usd: float,
):
    """Persist a JSON manifest so we can re-stitch without re-rendering."""
    manifest: dict[str, Any] = {
        "aspect_ratio": aspect_ratio,
        "resolution": resolution,
        "stitch": stitch_cfg,
        "total_cost_usd": round(total_cost_usd, 4),
        "shots": [
            {
                "idx": i,
                "prompt": shots[i].get("prompt"),
                "duration_sec": shots[i].get("duration_sec"),
                "reference_image_paths": shots[i].get("reference_image_paths") or [],
                "first_frame_image_path": shots[i].get("first_frame_image_path"),
                "status": shots_status[i].get("status"),
                "clip_path": shots_status[i].get("clip_path"),
                "cost_usd": shots_status[i].get("cost_usd"),
            }
            for i in range(len(shots))
        ],
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))


async def execute_veo_multi_shot(job_id: str, params: dict) -> str:
    """Execute the multi-shot Veo workflow.

    Params:
        shots: list[dict] — 1–10 entries, each with:
            prompt: str
            duration_sec: 4 | 6 | 8
            reference_image_paths: list[str]   (0–3, mutex with first_frame_image_path)
            first_frame_image_path: str        (mutex with reference_image_paths)
            negative_prompt: str               (optional)
        aspect_ratio: "16:9" | "9:16"
        resolution: "720p" | "1080p"
        stitch: { mode: "hard_cut" | "crossfade", crossfade_duration_sec?: float }
        music: { enabled: bool, prompt?: str }
        enhance_prompts: bool
        brand_profile_id: str | None
        concurrency: int (cap, defaults to 3)
    """
    shots, stitch_cfg = _validate_params(params)
    aspect = params.get("aspect_ratio") or settings.GEMINI_DEFAULT_VIDEO_ASPECT
    resolution = params.get("resolution") or settings.GEMINI_DEFAULT_VIDEO_RESOLUTION
    user_id = params.get("_user_id")
    concurrency = max(1, min(int(params.get("concurrency") or DEFAULT_CONCURRENCY), DEFAULT_CONCURRENCY))

    # Brand prefix + optional Gemini Flash prompt enhancement.
    shots = _apply_brand_to_shots(shots, params)
    if params.get("enhance_prompts"):
        update_job(job_id, progress=2, step="Enhancing prompts")
        shots = await _maybe_enhance_prompts(shots, user_id)

    out_dir = Path(settings.OUTPUT_PATH) / job_id
    out_dir.mkdir(parents=True, exist_ok=True)

    # Resume: pull successful shots from a prior failed job's output dir so the
    # render-skip detection finds them and we don't pay Veo for them again.
    resume_from = params.get("_resume_from_job_id")
    if resume_from:
        import shutil as _shutil
        src_dir = Path(settings.OUTPUT_PATH) / str(resume_from)
        if src_dir.exists() and src_dir.is_dir():
            for src_clip in src_dir.glob("shot_*.mp4"):
                dst = out_dir / src_clip.name
                if not dst.exists():
                    _shutil.copy2(src_clip, dst)
            logger.info(
                "veo_multi_shot resume: copied clips from %s into %s",
                resume_from, job_id,
            )

    shots_status: list[dict] = [
        {"idx": i, "status": "queued", "progress": 0} for i in range(len(shots))
    ]
    _publish_shot_status(job_id, params, shots_status)
    update_job(job_id, progress=5, step=f"Rendering 0/{len(shots)} shots")

    sem = asyncio.Semaphore(concurrency)
    completed = 0
    completed_lock = asyncio.Lock()

    async def render(i: int, shot: dict):
        nonlocal completed
        async with sem:
            # Skip shots that already produced a clip on disk (e.g. resumed run).
            existing = out_dir / f"shot_{i + 1:02d}.mp4"
            if existing.exists() and existing.stat().st_size > 0:
                shots_status[i].update(
                    status="completed",
                    progress=100,
                    clip_path=str(existing),
                    cost_usd=0.0,
                    resumed=True,
                )
                _publish_shot_status(job_id, params, shots_status)
                async with completed_lock:
                    completed += 1
                    pct = 5 + int(80 * completed / len(shots))
                    update_job(job_id, progress=pct, step=f"Rendered {completed}/{len(shots)} shots")
                return

            shots_status[i].update(status="processing", progress=10)
            _publish_shot_status(job_id, params, shots_status)
            try:
                clip_path, cost_usd = await _render_single_shot(
                    shot_idx=i,
                    shot=shot,
                    parent_aspect=aspect,
                    parent_resolution=resolution,
                    user_id=user_id,
                    out_dir=out_dir,
                )
            except (GeminiSafetyError, GeminiError) as e:
                # Per-shot failure: record it and let other shots finish so we
                # don't waste their successful renders.
                shots_status[i].update(
                    status="failed", error=str(e), code=e.code, progress=100,
                )
                _publish_shot_status(job_id, params, shots_status)
                raise

            shots_status[i].update(
                status="completed",
                progress=100,
                clip_path=clip_path,
                cost_usd=round(cost_usd, 4),
            )
            async with completed_lock:
                completed += 1
                pct = 5 + int(80 * completed / len(shots))
                update_job(job_id, progress=pct, step=f"Rendered {completed}/{len(shots)} shots")
            _publish_shot_status(job_id, params, shots_status)

    # Let every shot finish or fail independently — burning successful renders
    # because a sibling raised mid-batch is not OK at $3+/shot.
    results = await asyncio.gather(
        *[render(i, s) for i, s in enumerate(shots)],
        return_exceptions=True,
    )
    failed_idxs = [i for i, r in enumerate(results) if isinstance(r, BaseException)]
    if failed_idxs:
        summary = "; ".join(
            f"shot {i + 1}: {shots_status[i].get('error') or type(results[i]).__name__}"
            for i in failed_idxs
        )
        # Persist a manifest of what *did* render so the user can re-run and
        # only the failed shots will actually hit Veo (the rest are reused).
        total_cost_usd = sum(s.get("cost_usd") or 0.0 for s in shots_status)
        _write_manifest(
            out_dir, shots, shots_status,
            aspect_ratio=aspect, resolution=resolution,
            stitch_cfg=stitch_cfg, total_cost_usd=total_cost_usd,
        )
        raise RuntimeError(
            f"{len(failed_idxs)}/{len(shots)} shots failed: {summary}. "
            "Successful clips are preserved on disk — re-running this job will "
            "skip them and only re-render the failed shots."
        )

    # Stitch
    update_job(job_id, progress=88, step="Stitching shots")
    clip_paths = [s["clip_path"] for s in shots_status]
    stitched_path = out_dir / "stitched.mp4"
    if stitch_cfg.get("mode") == "crossfade":
        fade = float(stitch_cfg.get("crossfade_duration_sec") or 0.5)
        stitch_with_crossfade(clip_paths, str(stitched_path), fade_sec=fade)
    else:
        stitch_clips(clip_paths, str(stitched_path))

    # Optional music overlay
    music_cfg = params.get("music") or {}
    total_duration = float(sum(int(s.get("duration_sec") or 8) for s in shots))
    final_path = await _maybe_add_music(
        stitched_path=stitched_path,
        out_dir=out_dir,
        music_cfg=music_cfg,
        total_duration_sec=total_duration,
    )
    if final_path != stitched_path:
        # Promote the music-mixed file to the canonical "final.mp4" name.
        final_named = out_dir / "final.mp4"
        final_named.write_bytes(final_path.read_bytes())
        final_path.unlink(missing_ok=True)
        final_path = final_named
    else:
        final_named = out_dir / "final.mp4"
        final_named.write_bytes(stitched_path.read_bytes())
        stitched_path.unlink(missing_ok=True)
        final_path = final_named

    # Manifest
    total_cost_usd = sum(s.get("cost_usd") or 0.0 for s in shots_status)
    if settings.MOCK_MODE:
        # Record what *would* have cost in real mode for accounting visibility.
        total_cost_usd = sum(
            estimate_video_cost_usd(int(s.get("duration_sec") or 8), True) for s in shots
        )
    _write_manifest(
        out_dir, shots, shots_status,
        aspect_ratio=aspect, resolution=resolution,
        stitch_cfg=stitch_cfg, total_cost_usd=total_cost_usd,
    )

    update_job(
        job_id,
        progress=100,
        step="Complete",
        cost_usd=total_cost_usd,
    )

    try:
        cleanup_temp(job_id)
    except Exception:
        pass

    logger.info(
        "veo_multi_shot complete: job=%s shots=%d cost_usd=%.4f",
        job_id, len(shots), total_cost_usd,
    )
    return str(final_path)
