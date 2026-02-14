"""Export endpoints — convert videos to platform-specific formats."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.job_queue import get_job
from services.ffmpeg_service import export_format, add_watermark
from services.storage_service import get_asset_url
from config import settings

router = APIRouter(prefix="/api/v1/export", tags=["export"])

FORMAT_PRESETS = {
    "tiktok": {"width": 1080, "height": 1920, "label": "TikTok / Reels (9:16)", "fps": 30},
    "youtube": {"width": 1920, "height": 1080, "label": "YouTube (16:9)", "fps": 30},
    "youtube_short": {"width": 1080, "height": 1920, "label": "YouTube Short (9:16)", "fps": 30},
    "instagram": {"width": 1080, "height": 1080, "label": "Instagram (1:1)", "fps": 30},
    "instagram_story": {"width": 1080, "height": 1920, "label": "Instagram Story (9:16)", "fps": 30},
    "twitter": {"width": 1280, "height": 720, "label": "Twitter/X (16:9)", "fps": 30},
    "linkedin": {"width": 1920, "height": 1080, "label": "LinkedIn (16:9)", "fps": 30},
    "gif_preview": {"width": 480, "height": 480, "label": "GIF Preview (1:1)", "fps": 10},
}


class ExportRequest(BaseModel):
    formats: list[str] = ["tiktok", "youtube", "instagram"]
    watermark: bool = False
    watermark_text: str = "Skyie Studio"


@router.get("/formats")
async def list_formats():
    """List available export formats with resolution and fps details."""
    return {"formats": FORMAT_PRESETS}


@router.post("/{job_id}")
async def export_video(job_id: str, request: ExportRequest):
    """Export a completed video to platform-specific formats.

    Optionally add a watermark to all exported files.
    """
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.get("status") != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Job is not completed (status: {job.get('status')})",
        )

    source_path = job.get("output_path")
    if not source_path:
        raise HTTPException(status_code=400, detail="No output file found for job")

    output_dir = settings.OUTPUT_PATH / job_id / "exports"
    output_dir.mkdir(parents=True, exist_ok=True)

    exports = {}
    for fmt in request.formats:
        if fmt not in FORMAT_PRESETS:
            continue
        preset = FORMAT_PRESETS[fmt]
        output_path = str(output_dir / f"{fmt}.mp4")
        export_format(source_path, output_path, preset["width"], preset["height"])

        # Optionally apply watermark
        if request.watermark:
            watermarked_path = str(output_dir / f"{fmt}_wm.mp4")
            add_watermark(output_path, watermarked_path, text=request.watermark_text)
            output_path = watermarked_path

        exports[fmt] = {
            "path": output_path,
            "url": get_asset_url(output_path),
            "label": preset["label"],
            "width": preset["width"],
            "height": preset["height"],
        }

    return {"job_id": job_id, "exports": exports}


@router.get("/{job_id}/downloads")
async def list_exports(job_id: str):
    """List previously exported files for a job."""
    export_dir = settings.OUTPUT_PATH / job_id / "exports"
    if not export_dir.exists():
        return {"job_id": job_id, "exports": {}}

    exports = {}
    for f in sorted(export_dir.iterdir()):
        if f.is_file() and f.suffix == ".mp4":
            fmt_name = f.stem.replace("_wm", "")
            exports[fmt_name] = {
                "path": str(f),
                "url": get_asset_url(str(f)),
                "filename": f.name,
                "size_bytes": f.stat().st_size,
            }

    return {"job_id": job_id, "exports": exports}
