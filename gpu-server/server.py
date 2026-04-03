"""
Skyie Studio — GPU Inference Server (FastAPI)

Runs on the RunPod GPU pod and exposes inference endpoints that the VPS
backend calls via HTTP.  Authentication is via a shared API key in the
X-API-Key header.
"""

import gc
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Any

import aiofiles
import torch
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

VRAM_LIMIT_GB = float(os.getenv("VRAM_LIMIT_GB", "30.0"))
registry.vram_limit_gb = VRAM_LIMIT_GB

os.environ["HF_HOME"] = "/workspace/models/.hf_cache"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("gpu-server")

# ---------------------------------------------------------------------------
# Global pipeline cache
# ---------------------------------------------------------------------------
_pipelines: dict[str, Any] = {}


def _get_pipeline(name: str):
    """Get or load a pipeline by name. Cached globally."""
    if name in _pipelines:
        return _pipelines[name]
    return None


def _unload_pipeline(name: str):
    """Unload a pipeline and free VRAM."""
    if name in _pipelines:
        del _pipelines[name]
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("Unloaded pipeline: %s", name)


def _unload_all():
    """Unload all pipelines."""
    for name in list(_pipelines.keys()):
        _unload_pipeline(name)


# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Skyie Studio GPU Inference Server",
    description="GPU inference endpoints for video generation and more.",
    version="0.2.0",
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
    file_id = str(uuid.uuid4())
    _file_registry[file_id] = path
    return file_id


def _resolve_file(file_id: str) -> Path:
    path = _file_registry.get(file_id)
    if path is None or not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {file_id}")
    return path


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class InferRequest(BaseModel):
    model_key: str | None = None
    params: dict[str, Any] = {}
    input_file_ids: list[str] = []


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
    vram_used = torch.cuda.memory_allocated() / 1e9 if torch.cuda.is_available() else 0
    vram_total = torch.cuda.get_device_properties(0).total_memory / 1e9 if torch.cuda.is_available() else 0
    return {
        "status": "healthy",
        "uptime_seconds": round(time.time() - _start_time, 1),
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "none",
        "vram_used_gb": round(vram_used, 2),
        "vram_total_gb": round(vram_total, 2),
        "loaded_pipelines": list(_pipelines.keys()),
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


# ---------------------------------------------------------------------------
# File upload / download
# ---------------------------------------------------------------------------


@app.post("/files/upload", dependencies=[Depends(verify_api_key)])
async def upload_file(file: UploadFile = File(...)):
    ext = Path(file.filename or "file").suffix
    dest = UPLOAD_DIR / f"{uuid.uuid4()}{ext}"
    async with aiofiles.open(dest, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            await f.write(chunk)
    file_id = _register_file(dest)
    logger.info("File uploaded: %s -> %s", file_id, dest.name)
    return {"file_id": file_id, "filename": dest.name, "size_bytes": dest.stat().st_size}


@app.get("/files/{file_id}", dependencies=[Depends(verify_api_key)])
async def download_file(file_id: str):
    path = _resolve_file(file_id)
    return FileResponse(path, filename=path.name)


# ---------------------------------------------------------------------------
# I2V Inference — Wan 2.2 TI2V-5B (the real deal)
# ---------------------------------------------------------------------------


def _load_i2v_pipeline():
    """Load Wan2.2 TI2V-5B for image-to-video generation."""
    if "i2v" in _pipelines:
        return _pipelines["i2v"]

    _unload_all()  # Free VRAM first
    logger.info("Loading Wan2.2-TI2V-5B pipeline...")

    from diffusers import WanImageToVideoPipeline

    pipe = WanImageToVideoPipeline.from_pretrained(
        "Wan-AI/Wan2.2-TI2V-5B-Diffusers",
        torch_dtype=torch.bfloat16,
    )
    pipe.to("cuda")
    _pipelines["i2v"] = pipe

    vram = torch.cuda.memory_allocated() / 1e9
    logger.info("I2V pipeline loaded. VRAM: %.1f GB", vram)
    return pipe


@app.post("/infer/i2v", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_i2v(req: InferRequest):
    """Image-to-Video inference using Wan 2.2 TI2V-5B."""
    t0 = time.time()
    input_files = [_resolve_file(fid) for fid in req.input_file_ids]

    if not input_files:
        raise HTTPException(status_code=400, detail="No input image provided")

    pipe = _load_i2v_pipeline()

    from PIL import Image
    from diffusers.utils import export_to_video

    image = Image.open(str(input_files[0])).convert("RGB")
    orig_w, orig_h = image.size

    prompt = req.params.get("prompt", "cinematic motion, smooth camera movement")
    neg_prompt = req.params.get(
        "negative_prompt",
        "distorted face, deformed, blurry, low quality, watermark, static",
    )
    num_frames = min(int(req.params.get("num_frames", 81)), 81)
    steps = int(req.params.get("num_inference_steps", 30))
    guidance = float(req.params.get("guidance_scale", 5.0))

    # Scale image to fit VRAM — max 720p, dimensions must be divisible by 16
    max_pixels = 720 * 1280
    scale = min(1.0, (max_pixels / (orig_w * orig_h)) ** 0.5)
    width = int(orig_w * scale) // 16 * 16
    height = int(orig_h * scale) // 16 * 16
    width = max(width, 256)
    height = max(height, 256)

    image = image.resize((width, height), Image.LANCZOS)

    logger.info(
        "I2V: %dx%d (from %dx%d), %d frames, %d steps, prompt='%s'",
        width, height, orig_w, orig_h, num_frames, steps, prompt[:80],
    )

    output = pipe(
        image=image,
        prompt=prompt,
        negative_prompt=neg_prompt,
        num_frames=num_frames,
        height=height,
        width=width,
        num_inference_steps=steps,
        guidance_scale=guidance,
    ).frames[0]

    # Export at 16fps
    output_path = UPLOAD_DIR / f"{uuid.uuid4()}.mp4"
    export_to_video(output, str(output_path), fps=16)
    output_file_id = _register_file(output_path)

    elapsed = round(time.time() - t0, 2)
    logger.info("I2V complete: %d frames, %.1fs, %s", len(output), elapsed, output_path.name)

    return InferResponse(
        output_file_id=output_file_id,
        result={"frames": len(output), "width": width, "height": height},
        elapsed_seconds=elapsed,
    )


# ---------------------------------------------------------------------------
# T2V Inference — Wan 2.2 TI2V-5B (text only, no input image needed)
# ---------------------------------------------------------------------------


def _load_t2v_pipeline():
    """Load Wan2.2-T2V pipeline for text-to-video."""
    if "t2v" in _pipelines:
        return _pipelines["t2v"]

    _unload_all()
    logger.info("Loading Wan2.2-T2V pipeline (using TI2V-5B)...")

    from diffusers import WanPipeline

    pipe = WanPipeline.from_pretrained(
        "Wan-AI/Wan2.2-T2V-A14B-Diffusers",
        torch_dtype=torch.bfloat16,
    )
    pipe.enable_model_cpu_offload()
    _pipelines["t2v"] = pipe

    logger.info("T2V pipeline loaded with CPU offloading")
    return pipe


@app.post("/infer/t2v", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_t2v(req: InferRequest):
    """Text-to-Video inference."""
    t0 = time.time()
    pipe = _load_t2v_pipeline()

    from diffusers.utils import export_to_video

    prompt = req.params.get("prompt", "a beautiful landscape")
    neg_prompt = req.params.get("negative_prompt", "blurry, distorted")
    num_frames = min(int(req.params.get("num_frames", 33)), 81)
    height = int(req.params.get("height", 480))
    width = int(req.params.get("width", 832))
    steps = int(req.params.get("num_inference_steps", 20))

    logger.info("T2V: %dx%d, %d frames, prompt='%s'", width, height, num_frames, prompt[:80])

    output = pipe(
        prompt=prompt,
        negative_prompt=neg_prompt,
        num_frames=num_frames,
        height=height,
        width=width,
        num_inference_steps=steps,
    ).frames[0]

    output_path = UPLOAD_DIR / f"{uuid.uuid4()}.mp4"
    export_to_video(output, str(output_path), fps=16)
    output_file_id = _register_file(output_path)

    elapsed = round(time.time() - t0, 2)
    logger.info("T2V complete: %d frames, %.1fs", len(output), elapsed)

    return InferResponse(
        output_file_id=output_file_id,
        result={"frames": len(output)},
        elapsed_seconds=elapsed,
    )


# ---------------------------------------------------------------------------
# Stub endpoints (for features not yet backed by real models)
# ---------------------------------------------------------------------------


def _stub_output(task_type: str, params: dict) -> tuple[dict, Path | None]:
    logger.info("STUB inference: type=%s params=%s", task_type, {k: str(v)[:50] for k, v in params.items()})
    return {"stub": True, "task": task_type}, None


@app.post("/infer/tts", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_tts(req: InferRequest):
    t0 = time.time()
    result, output_path = _stub_output("tts", req.params)
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/lipsync", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_lipsync(req: InferRequest):
    t0 = time.time()
    result, output_path = _stub_output("lipsync", req.params)
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/image", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_image(req: InferRequest):
    t0 = time.time()
    result, output_path = _stub_output("image", req.params)
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/music", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_music(req: InferRequest):
    t0 = time.time()
    result, output_path = _stub_output("music", req.params)
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/transcribe", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_transcribe(req: InferRequest):
    t0 = time.time()
    result, output_path = _stub_output("transcribe", req.params)
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/v2v", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_v2v(req: InferRequest):
    t0 = time.time()
    result, output_path = _stub_output("v2v", req.params)
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/extend", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_extend(req: InferRequest):
    t0 = time.time()
    result, output_path = _stub_output("extend", req.params)
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/upscale", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_upscale(req: InferRequest):
    t0 = time.time()
    result, output_path = _stub_output("upscale", req.params)
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/interpolate", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_interpolate(req: InferRequest):
    t0 = time.time()
    result, output_path = _stub_output("interpolate", req.params)
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/face-enhance", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_face_enhance(req: InferRequest):
    t0 = time.time()
    result, output_path = _stub_output("face_enhance", req.params)
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/inpaint", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_inpaint(req: InferRequest):
    t0 = time.time()
    result, output_path = _stub_output("inpaint", req.params)
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/bg-remove", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_bg_remove(req: InferRequest):
    t0 = time.time()
    result, output_path = _stub_output("bg_remove", req.params)
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/segment", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_segment(req: InferRequest):
    t0 = time.time()
    result, output_path = _stub_output("segment", req.params)
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/style-transfer", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_style_transfer(req: InferRequest):
    t0 = time.time()
    result, output_path = _stub_output("style_transfer", req.params)
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/sfx", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_sfx(req: InferRequest):
    t0 = time.time()
    result, output_path = _stub_output("sfx", req.params)
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/voice-convert", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_voice_convert(req: InferRequest):
    t0 = time.time()
    result, output_path = _stub_output("voice_convert", req.params)
    output_file_id = _register_file(output_path) if output_path else None
    return InferResponse(output_file_id=output_file_id, result=result, elapsed_seconds=round(time.time() - t0, 3))


@app.post("/infer/stems", dependencies=[Depends(verify_api_key)], response_model=InferResponse)
async def infer_stems(req: InferRequest):
    t0 = time.time()
    result, output_path = _stub_output("stems", req.params)
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
