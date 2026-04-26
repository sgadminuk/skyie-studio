"""Workflow — AI Avatar Pack.

Take one reference photo of a person + a target count, generate that many
diverse Nano Banana scenes with the same identity. Mirrors the multi-shot
pattern: per-image status array in params, parallel render with semaphore,
return_exceptions so a single failure doesn't poison the batch, and on-disk
clips are reused on retry.
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from config import settings
from services.gemini_service import (
    GeminiError,
    GeminiSafetyError,
    estimate_image_cost_usd,
    get_gemini_service,
)
from services.job_queue import update_job
from services.prompt_enhance_service import generate_avatar_pack_prompts
from services.storage_service import cleanup_temp

logger = logging.getLogger(__name__)

DEFAULT_CONCURRENCY = 5
MIN_COUNT = 1
MAX_COUNT = 60


def _read_bytes(path: str) -> bytes:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Reference image not found: {path}")
    return p.read_bytes()


def _publish_status(job_id: str, params: dict, scenes_status: list[dict]):
    update_job(job_id, params={**params, "scenes_status": scenes_status})


async def execute_avatar_pack(job_id: str, params: dict) -> str:
    """Execute the avatar-pack workflow.

    Params:
        reference_image_path: str — single photo of the subject
        count: int — number of variants to generate (1-60)
        brief: str (optional) — extra steering for the prompt generator
        aspect_ratio: str (default "1:1")
    """
    ref_path = params.get("reference_image_path")
    if not ref_path:
        raise ValueError("reference_image_path is required")
    count = int(params.get("count") or 30)
    if not (MIN_COUNT <= count <= MAX_COUNT):
        raise ValueError(f"count must be {MIN_COUNT}-{MAX_COUNT} (got {count})")
    aspect_ratio = params.get("aspect_ratio") or "1:1"
    brief = (params.get("brief") or "").strip()
    user_id = params.get("_user_id")

    out_dir = Path(settings.OUTPUT_PATH) / job_id
    out_dir.mkdir(parents=True, exist_ok=True)

    # Resume: copy any prior job's images so the render-skip logic finds them.
    resume_from = params.get("_resume_from_job_id")
    if resume_from:
        import shutil as _shutil
        src_dir = Path(settings.OUTPUT_PATH) / str(resume_from)
        if src_dir.exists() and src_dir.is_dir():
            for src in src_dir.glob("avatar_*.png"):
                dst = out_dir / src.name
                if not dst.exists():
                    _shutil.copy2(src, dst)
            for src in src_dir.glob("avatar_*.jpg"):
                dst = out_dir / src.name
                if not dst.exists():
                    _shutil.copy2(src, dst)
            logger.info("avatar_pack resume: copied images from %s into %s", resume_from, job_id)

    ref_bytes = _read_bytes(ref_path)

    # Step 1: generate the diverse scene prompts (cheap Flash call).
    update_job(job_id, progress=3, step="Drafting scene prompts")
    scenes = await generate_avatar_pack_prompts(count=count, brief=brief, user_id=user_id)
    if not scenes:
        raise RuntimeError("Failed to generate any scene prompts")

    # Persist the scene plan + initial status so the UI can render the grid
    # immediately, even before any image lands.
    scenes_status: list[dict] = [
        {"idx": i, "label": s.get("label"), "status": "queued", "progress": 0}
        for i, s in enumerate(scenes)
    ]
    new_params = {**params, "scenes": scenes, "scenes_status": scenes_status}
    update_job(job_id, params=new_params, progress=8, step=f"Rendering 0/{len(scenes)} avatars")

    concurrency = max(1, min(int(params.get("concurrency") or DEFAULT_CONCURRENCY), 10))
    sem = asyncio.Semaphore(concurrency)
    completed = 0
    completed_lock = asyncio.Lock()

    service = get_gemini_service()

    async def render(i: int, scene: dict):
        nonlocal completed
        async with sem:
            # Skip if a prior run already produced this image.
            for ext in (".png", ".jpg"):
                existing = out_dir / f"avatar_{i + 1:02d}{ext}"
                if existing.exists() and existing.stat().st_size > 0:
                    scenes_status[i].update(
                        status="completed", progress=100,
                        image_path=str(existing), cost_usd=0.0, resumed=True,
                    )
                    _publish_status(job_id, new_params, scenes_status)
                    async with completed_lock:
                        completed += 1
                        pct = 8 + int(88 * completed / len(scenes))
                        update_job(
                            job_id, progress=pct,
                            step=f"Rendered {completed}/{len(scenes)} avatars",
                        )
                    return

            scenes_status[i].update(status="processing", progress=10)
            _publish_status(job_id, new_params, scenes_status)

            try:
                result = await service.generate_image(
                    scene["prompt"],
                    reference_images=[ref_bytes],
                    aspect_ratio=aspect_ratio,
                    user_id=user_id,
                )
            except (GeminiSafetyError, GeminiError) as e:
                scenes_status[i].update(
                    status="failed", error=str(e), code=e.code, progress=100,
                )
                _publish_status(job_id, new_params, scenes_status)
                raise

            ext = ".png" if "png" in (result.mime_type or "") else ".jpg"
            dst = out_dir / f"avatar_{i + 1:02d}{ext}"
            dst.write_bytes(result.image_bytes)
            scenes_status[i].update(
                status="completed", progress=100,
                image_path=str(dst), cost_usd=round(result.cost_usd, 4),
            )
            async with completed_lock:
                completed += 1
                pct = 8 + int(88 * completed / len(scenes))
                update_job(
                    job_id, progress=pct,
                    step=f"Rendered {completed}/{len(scenes)} avatars",
                )
            _publish_status(job_id, new_params, scenes_status)

    results = await asyncio.gather(
        *[render(i, s) for i, s in enumerate(scenes)],
        return_exceptions=True,
    )
    failed_idxs = [i for i, r in enumerate(results) if isinstance(r, BaseException)]

    # Persist a manifest regardless — supports retry that reuses on-disk images.
    total_cost_usd = sum(s.get("cost_usd") or 0.0 for s in scenes_status)
    if settings.MOCK_MODE:
        total_cost_usd = estimate_image_cost_usd(len(scenes))
    manifest: dict[str, Any] = {
        "count": len(scenes),
        "completed": len(scenes) - len(failed_idxs),
        "failed": len(failed_idxs),
        "total_cost_usd": round(total_cost_usd, 4),
        "scenes": [
            {**scenes[i], **{k: scenes_status[i].get(k) for k in ("status", "image_path", "cost_usd", "error")}}
            for i in range(len(scenes))
        ],
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))

    if failed_idxs:
        summary = "; ".join(
            f"avatar {i + 1}: {scenes_status[i].get('error') or type(results[i]).__name__}"
            for i in failed_idxs
        )
        raise RuntimeError(
            f"{len(failed_idxs)}/{len(scenes)} avatars failed: {summary}. "
            "Successful images are preserved on disk — retry will reuse them."
        )

    update_job(job_id, progress=100, step="Complete", cost_usd=total_cost_usd)

    try:
        cleanup_temp(job_id)
    except Exception:
        pass

    logger.info(
        "avatar_pack complete: job=%s count=%d cost_usd=%.4f",
        job_id, len(scenes), total_cost_usd,
    )
    # The "primary" output is the manifest — the UI will render the grid
    # from scenes_status; there isn't a single canonical file.
    return str(out_dir / "manifest.json")
