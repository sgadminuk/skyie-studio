"""Asset management — avatars, voices, generated videos."""

from fastapi import APIRouter, UploadFile, File, HTTPException
from services.storage_service import save_upload, list_assets, delete_asset, get_asset_url

router = APIRouter(prefix="/api/v1/assets", tags=["assets"])


# --- Avatars ---

@router.get("/avatars")
async def list_avatars():
    """List all uploaded avatar images."""
    return {"avatars": list_assets("avatars")}


@router.post("/avatars")
async def upload_avatar(file: UploadFile = File(...)):
    """Upload a new avatar photo."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    path = await save_upload(file, "avatars")
    return {"path": path, "url": get_asset_url(path), "filename": file.filename}


@router.delete("/avatars/{filename}")
async def delete_avatar(filename: str):
    """Delete an avatar."""
    from config import settings
    path = str(settings.ASSETS_PATH / "avatars" / filename)
    if delete_asset(path):
        return {"deleted": True}
    raise HTTPException(status_code=404, detail="Avatar not found")


# --- Voices ---

@router.get("/voices")
async def list_voices():
    """List available voice options."""
    # Built-in voices + any uploaded reference files
    builtin = [
        {"id": "default_female", "name": "Default Female", "language": "en", "type": "builtin"},
        {"id": "default_male", "name": "Default Male", "language": "en", "type": "builtin"},
        {"id": "professional", "name": "Professional", "language": "en", "type": "builtin"},
        {"id": "casual", "name": "Casual", "language": "en", "type": "builtin"},
    ]
    uploaded = [
        {**v, "type": "cloned", "id": v["filename"]}
        for v in list_assets("voices")
    ]
    return {"voices": builtin + uploaded}


@router.post("/voices/upload")
async def upload_voice_reference(file: UploadFile = File(...)):
    """Upload a voice reference audio for cloning."""
    if not file.content_type or not file.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="File must be audio")

    path = await save_upload(file, "voices")
    return {"path": path, "url": get_asset_url(path), "filename": file.filename}


@router.post("/voices/preview")
async def preview_voice(voice_id: str = "default_female", text: str = "Hello, this is a voice preview from Skyie Studio."):
    """Generate a 5-second voice preview."""
    from config import settings
    from services.storage_service import get_temp_dir
    import uuid

    temp = get_temp_dir(f"preview_{uuid.uuid4().hex[:8]}")
    output = str(temp / "preview.wav")

    from models.fish_speech import fish_speech_wrapper
    await fish_speech_wrapper.generate(text[:200], output)

    return {"preview_url": get_asset_url(output)}


# --- Generated Videos ---

@router.get("/videos")
async def list_videos():
    """List all generated videos."""
    return {"videos": list_assets("generated")}


@router.get("/videos/{job_id}")
async def get_video(job_id: str):
    """Get details for a specific generated video."""
    from services.job_queue import get_job
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Video not found")

    if job.get("output_path"):
        job["download_url"] = get_asset_url(job["output_path"])
    return job


@router.delete("/videos/{job_id}")
async def delete_video(job_id: str):
    """Delete a generated video and its files."""
    from config import settings
    import shutil
    from pathlib import Path

    output_dir = settings.OUTPUT_PATH / job_id
    if output_dir.exists():
        shutil.rmtree(output_dir)
        return {"deleted": True}
    raise HTTPException(status_code=404, detail="Video not found")
