"""
Skyie Studio — GPU Inference Server (FastAPI)

Runs on the RunPod GPU pod and exposes inference endpoints that the VPS
backend calls via HTTP.  Authentication is via a shared API key in the
X-API-Key header.
"""

import logging
import os
import time
import uuid
from pathlib import Path
from typing import Any

import aiofiles
from fastapi import (
    Depends,
    FastAPI,
    File,
    HTTPException,
    Header,
    UploadFile,
)
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from model_registry import MODEL_CATALOGUE, registry

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
API_KEY = os.getenv("GPU_API_KEY", "change-me-in-production")
UPLOAD_DIR = Path(os.getenv("GPU_UPLOAD_DIR", "/workspace/uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

VRAM_LIMIT_GB = float(os.getenv("VRAM_LIMIT_GB", "23.0"))
registry.vram_limit_gb = VRAM_LIMIT_GB

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("gpu-server")

# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Skyie Studio GPU Inference Server",
    description="GPU inference endpoints for TTS, lip-sync, video generation, and more.",
    version="0.1.0",
)

# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------


async def verify_api_key(x_api_key: str = Header(...)):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return x_api_key


# ---------------------------------------------------------------------------
# In-memory file registry  (file_id -> local path)
# ---------------------------------------------------------------------------
_file_registry: dict[str, Path] = {}


def _register_file(path: Path) -> str:
    """Store a file path and return a UUID-based file_id."""
    file_id = str(uuid.uuid4())
    _file_registry[file_id] = path
    return file_id


def _resolve_file(file_id: str) -> Path:
    """Look up a file_id and return its local path, or raise 404."""
    path = _file_registry.get(file_id)
    if path is None or not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {file_id}")
    return path


# ---------------------------------------------------------------------------
# Pydantic request / response models
# ---------------------------------------------------------------------------


class InferRequest(BaseModel):
    """Generic inference request body."""

    model_key: str | None = None
    params: dict[str, Any] = {}
    input_file_ids: list[str] = []


class ModelActionRequest(BaseModel):
    model_key: str


class InferResponse(BaseModel):
    status: str = "ok"
    output_file_id: str | None = None
    result: dict[str, Any] = {}
    elapsed_seconds: float = 0.0


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "uptime_seconds": round(time.time() - _start_time, 1),
        "models": registry.get_status(),
    }


_start_time = time.time()

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


@app.get("/models", dependencies=[Depends(verify_api_key)])
async def list_models():
    return {
        "catalogue": registry.get_catalogue(),
        "loaded": registry.get_loaded_models(),
        "vram": registry.get_status(),
    }


@app.post("/models/load", dependencies=[Depends(verify_api_key)])
async def load_model(req: ModelActionRequest):
    try:
        loaded = registry.load_model(req.model_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=507, detail=str(exc))  # Insufficient Storage
    return {
        "status": "loaded",
        "model": loaded.key,
        "vram": registry.get_status(),
    }


@app.post("/models/unload", dependencies=[Depends(verify_api_key)])
async def unload_model(req: ModelActionRequest):
    registry.unload_model(req.model_key)
    return {
        "status": "unloaded",
        "model": req.model_key,
        "vram": registry.get_status(),
    }


# ---------------------------------------------------------------------------
# File upload / download
# ---------------------------------------------------------------------------


@app.post("/files/upload", dependencies=[Depends(verify_api_key)])
async def upload_file(file: UploadFile = File(...)):
    ext = Path(file.filename or "file").suffix
    dest = UPLOAD_DIR / f"{uuid.uuid4()}{ext}"

    async with aiofiles.open(dest, "wb") as f:
        while chunk := await file.read(1024 * 1024):  # 1 MB chunks
            await f.write(chunk)

    file_id = _register_file(dest)
    logger.info("File uploaded: %s -> %s", file_id, dest.name)
    return {"file_id": file_id, "filename": dest.name, "size_bytes": dest.stat().st_size}


@app.get("/files/{file_id}", dependencies=[Depends(verify_api_key)])
async def download_file(file_id: str):
    path = _resolve_file(file_id)
    return FileResponse(path, filename=path.name)


# ---------------------------------------------------------------------------
# Inference helpers
# ---------------------------------------------------------------------------


def _ensure_model_loaded(model_key: str | None, default_key: str) -> str:
    """Make sure the requested (or default) model is loaded."""
    key = model_key or default_key
    if key not in MODEL_CATALOGUE:
        raise HTTPException(status_code=400, detail=f"Unknown model: {key}")
    if not registry.is_loaded(key):
        try:
            registry.load_model(key)
        except RuntimeError as exc:
            raise HTTPException(status_code=507, detail=str(exc))
    return key


def _resolve_input_files(file_ids: list[str]) -> list[Path]:
    """Resolve a list of file_ids to local paths."""
    return [_resolve_file(fid) for fid in file_ids]


def _stub_output(task_type: str, model_key: str, params: dict) -> tuple[dict, Path | None]:
    """
    STUB: In production, this calls the actual model pipeline.
    Returns (result_dict, output_file_path | None).
    """
    logger.info("STUB inference: type=%s model=%s params=%s", task_type, model_key, params)
    return {"stub": True, "task": task_type, "model": model_key}, None


# ---------------------------------------------------------------------------
# Inference endpoints
# ---------------------------------------------------------------------------


@app.post("/infer/tts", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_tts(req: InferRequest):
    """Text-to-Speech inference."""
    t0 = time.time()
    key = _ensure_model_loaded(req.model_key, "tts-f5")
    input_files = _resolve_input_files(req.input_file_ids)

    result, output_path = _stub_output("tts", key, {
        **req.params,
        "input_files": [str(p) for p in input_files],
    })

    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(
        output_file_id=output_file_id,
        result=result,
        elapsed_seconds=round(time.time() - t0, 3),
    )


@app.post("/infer/lipsync", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_lipsync(req: InferRequest):
    """Lip-sync inference (Wav2Lip)."""
    t0 = time.time()
    key = _ensure_model_loaded(req.model_key, "wav2lip")
    input_files = _resolve_input_files(req.input_file_ids)

    result, output_path = _stub_output("lipsync", key, {
        **req.params,
        "input_files": [str(p) for p in input_files],
    })

    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(
        output_file_id=output_file_id,
        result=result,
        elapsed_seconds=round(time.time() - t0, 3),
    )


@app.post("/infer/t2v", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_t2v(req: InferRequest):
    """Text-to-Video inference."""
    t0 = time.time()
    key = _ensure_model_loaded(req.model_key, "wan-t2v")
    input_files = _resolve_input_files(req.input_file_ids)

    result, output_path = _stub_output("t2v", key, {
        **req.params,
        "input_files": [str(p) for p in input_files],
    })

    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(
        output_file_id=output_file_id,
        result=result,
        elapsed_seconds=round(time.time() - t0, 3),
    )


@app.post("/infer/i2v", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_i2v(req: InferRequest):
    """Image-to-Video inference."""
    t0 = time.time()
    key = _ensure_model_loaded(req.model_key, "wan-i2v")
    input_files = _resolve_input_files(req.input_file_ids)

    result, output_path = _stub_output("i2v", key, {
        **req.params,
        "input_files": [str(p) for p in input_files],
    })

    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(
        output_file_id=output_file_id,
        result=result,
        elapsed_seconds=round(time.time() - t0, 3),
    )


@app.post("/infer/image", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_image(req: InferRequest):
    """Image generation inference (FLUX)."""
    t0 = time.time()
    key = _ensure_model_loaded(req.model_key, "flux-image")
    input_files = _resolve_input_files(req.input_file_ids)

    result, output_path = _stub_output("image", key, {
        **req.params,
        "input_files": [str(p) for p in input_files],
    })

    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(
        output_file_id=output_file_id,
        result=result,
        elapsed_seconds=round(time.time() - t0, 3),
    )


@app.post("/infer/music", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_music(req: InferRequest):
    """Music generation inference (YuE)."""
    t0 = time.time()
    key = _ensure_model_loaded(req.model_key, "yue-music")
    input_files = _resolve_input_files(req.input_file_ids)

    result, output_path = _stub_output("music", key, {
        **req.params,
        "input_files": [str(p) for p in input_files],
    })

    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(
        output_file_id=output_file_id,
        result=result,
        elapsed_seconds=round(time.time() - t0, 3),
    )


@app.post("/infer/transcribe", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_transcribe(req: InferRequest):
    """Audio transcription inference (Whisper)."""
    t0 = time.time()
    key = _ensure_model_loaded(req.model_key, "whisper-large")
    input_files = _resolve_input_files(req.input_file_ids)

    result, output_path = _stub_output("transcribe", key, {
        **req.params,
        "input_files": [str(p) for p in input_files],
    })

    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(
        output_file_id=output_file_id,
        result=result,
        elapsed_seconds=round(time.time() - t0, 3),
    )


# ---------------------------------------------------------------------------
# Phase 4: Video-to-Video & Extend
# ---------------------------------------------------------------------------

@app.post("/infer/v2v", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_v2v(req: InferRequest):
    """Video-to-Video transformation."""
    t0 = time.time()
    key = _ensure_model_loaded(req.model_key, "wan-v2v")
    input_files = _resolve_input_files(req.input_file_ids)
    result, output_path = _stub_output("v2v", key, {**req.params, "input_files": [str(p) for p in input_files]})
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/extend", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_extend(req: InferRequest):
    """Video extend inference."""
    t0 = time.time()
    key = _ensure_model_loaded(req.model_key, "wan-v2v")
    input_files = _resolve_input_files(req.input_file_ids)
    result, output_path = _stub_output("extend", key, {**req.params, "input_files": [str(p) for p in input_files]})
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


# ---------------------------------------------------------------------------
# Phase 5: Upscaling & Enhancement
# ---------------------------------------------------------------------------

@app.post("/infer/upscale", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_upscale(req: InferRequest):
    """Video/image upscaling (Real-ESRGAN)."""
    t0 = time.time()
    key = _ensure_model_loaded(req.model_key, "realesrgan")
    input_files = _resolve_input_files(req.input_file_ids)
    result, output_path = _stub_output("upscale", key, {**req.params, "input_files": [str(p) for p in input_files]})
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/interpolate", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_interpolate(req: InferRequest):
    """Frame interpolation (RIFE)."""
    t0 = time.time()
    key = _ensure_model_loaded(req.model_key, "rife")
    input_files = _resolve_input_files(req.input_file_ids)
    result, output_path = _stub_output("interpolate", key, {**req.params, "input_files": [str(p) for p in input_files]})
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/face-enhance", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_face_enhance(req: InferRequest):
    """Face enhancement (CodeFormer/GFPGAN)."""
    t0 = time.time()
    key = _ensure_model_loaded(req.model_key, "codeformer")
    input_files = _resolve_input_files(req.input_file_ids)
    result, output_path = _stub_output("face_enhance", key, {**req.params, "input_files": [str(p) for p in input_files]})
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


# ---------------------------------------------------------------------------
# Phase 6: Editing
# ---------------------------------------------------------------------------

@app.post("/infer/inpaint", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_inpaint(req: InferRequest):
    """Video/image inpainting (ProPainter)."""
    t0 = time.time()
    key = _ensure_model_loaded(req.model_key, "propainter")
    input_files = _resolve_input_files(req.input_file_ids)
    result, output_path = _stub_output("inpaint", key, {**req.params, "input_files": [str(p) for p in input_files]})
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/bg-remove", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_bg_remove(req: InferRequest):
    """Background removal/replacement."""
    t0 = time.time()
    key = _ensure_model_loaded(req.model_key, "sam2")
    input_files = _resolve_input_files(req.input_file_ids)
    result, output_path = _stub_output("bg_remove", key, {**req.params, "input_files": [str(p) for p in input_files]})
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/segment", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_segment(req: InferRequest):
    """Object segmentation (SAM2)."""
    t0 = time.time()
    key = _ensure_model_loaded(req.model_key, "sam2")
    input_files = _resolve_input_files(req.input_file_ids)
    result, output_path = _stub_output("segment", key, {**req.params, "input_files": [str(p) for p in input_files]})
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/style-transfer", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_style_transfer(req: InferRequest):
    """Style transfer."""
    t0 = time.time()
    key = _ensure_model_loaded(req.model_key, "wan-v2v")
    input_files = _resolve_input_files(req.input_file_ids)
    result, output_path = _stub_output("style_transfer", key, {**req.params, "input_files": [str(p) for p in input_files]})
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


# ---------------------------------------------------------------------------
# Phase 7: Audio
# ---------------------------------------------------------------------------

@app.post("/infer/sfx", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_sfx(req: InferRequest):
    """Sound effect generation (AudioLDM2)."""
    t0 = time.time()
    key = _ensure_model_loaded(req.model_key, "audioldm2")
    input_files = _resolve_input_files(req.input_file_ids)
    result, output_path = _stub_output("sfx", key, {**req.params, "input_files": [str(p) for p in input_files]})
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/voice-convert", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_voice_convert(req: InferRequest):
    """Voice conversion."""
    t0 = time.time()
    key = _ensure_model_loaded(req.model_key, "tts-f5")
    input_files = _resolve_input_files(req.input_file_ids)
    result, output_path = _stub_output("voice_convert", key, {**req.params, "input_files": [str(p) for p in input_files]})
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/stems", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_stems(req: InferRequest):
    """Audio stem separation (Demucs)."""
    t0 = time.time()
    key = _ensure_model_loaded(req.model_key, "demucs")
    input_files = _resolve_input_files(req.input_file_ids)
    result, output_path = _stub_output("stems", key, {**req.params, "input_files": [str(p) for p in input_files]})
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8080")),
        log_level="info",
    )
