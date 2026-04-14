"""Local file management — uploads, downloads, temp cleanup."""

import uuid
import shutil
import logging
from pathlib import Path
from fastapi import UploadFile
from config import settings

logger = logging.getLogger(__name__)


async def save_upload(file: UploadFile, category: str) -> str:
    """Save an uploaded file and return its relative path."""
    dest_dir = settings.ASSETS_PATH / category
    dest_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename).suffix if file.filename else ""
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = dest_dir / filename

    with open(dest, "wb") as f:
        content = await file.read()
        f.write(content)

    logger.info(f"Saved upload: {dest} ({len(content)} bytes)")
    return str(dest)


def get_asset_url(file_path: str) -> str:
    """Convert a local file path to a URL path for serving."""
    path = Path(file_path)
    try:
        relative = path.relative_to(settings.ASSETS_PATH)
        return f"/assets/{relative}"
    except ValueError:
        return f"/assets/{path.name}"


def get_temp_dir(job_id: str) -> Path:
    """Get/create a temp directory for a job."""
    temp = settings.TEMP_PATH / job_id
    temp.mkdir(parents=True, exist_ok=True)
    return temp


def cleanup_temp(job_id: str):
    """Remove temp files for a completed job."""
    temp = settings.TEMP_PATH / job_id
    if temp.exists():
        shutil.rmtree(temp)
        logger.info(f"Cleaned up temp for job {job_id}")


def save_output(job_id: str, source_path: str, filename: str) -> str:
    """Move a generated file to the output directory."""
    output_dir = settings.OUTPUT_PATH / job_id
    output_dir.mkdir(parents=True, exist_ok=True)
    dest = output_dir / filename
    shutil.copy2(source_path, dest)
    return str(dest)


def list_assets(category: str) -> list[dict]:
    """List assets in a category."""
    asset_dir = settings.ASSETS_PATH / category
    if not asset_dir.exists():
        return []

    assets = []
    for f in sorted(asset_dir.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
        if f.is_file() and not f.name.startswith("."):
            assets.append({
                "filename": f.name,
                "path": str(f),
                "url": get_asset_url(str(f)),
                "size_bytes": f.stat().st_size,
                "modified": f.stat().st_mtime,
            })
    return assets


_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
_VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv"}


def list_generated_outputs(kind: str) -> list[dict]:
    """List generated outputs recursively from OUTPUT_PATH.

    kind: "image" or "video" — filters by file extension.
    Returns newest first. Each entry includes the parent job_id so the
    frontend can link back to the job detail page.
    """
    output_dir = settings.OUTPUT_PATH
    if not output_dir.exists():
        return []

    exts = _IMAGE_EXTS if kind == "image" else _VIDEO_EXTS
    results: list[dict] = []
    for job_dir in output_dir.iterdir():
        if not job_dir.is_dir() or job_dir.name.startswith("."):
            continue
        for f in job_dir.iterdir():
            if not f.is_file() or f.name.startswith("."):
                continue
            if f.suffix.lower() not in exts:
                continue
            results.append({
                "filename": f.name,
                "path": str(f),
                "url": get_asset_url(str(f)),
                "size_bytes": f.stat().st_size,
                "modified": f.stat().st_mtime,
                "job_id": job_dir.name,
            })

    results.sort(key=lambda r: r["modified"], reverse=True)
    return results


def delete_asset(file_path: str) -> bool:
    """Delete an asset file."""
    path = Path(file_path)
    if path.exists() and path.is_file():
        path.unlink()
        return True
    return False
