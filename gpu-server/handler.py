"""Skyie Forge — RunPod Serverless GPU handler.

Entry point baked into the Docker image. Loads FLUX-dev once at boot,
keeps PuLID + LoRA loader ready, and processes serverless jobs from
RunPod's queue.

Job payload (from `event["input"]`):
{
  "prompt": str,                          # required
  "negative_prompt": str | null,
  "width": int,                           # default 1024
  "height": int,                          # default 1024
  "num_inference_steps": int,             # default 28
  "guidance_scale": float,                # default 3.5
  "seed": int | null,
  "reference_image_url": str | null,      # if present → enable PuLID identity
  "id_weight": float,                     # PuLID strength (0-1.5), default 1.0
  "loras": [                              # optional, list of LoRAs to fuse
    {"url": "https://...", "weight": 0.8, "name": "optional-cache-key"}
  ]
}

Response: {"image_b64": <png>, "width": int, "height": int, "seed": int}
        | {"error": str}
"""
from __future__ import annotations

import base64
import gc
import io
import logging
import os
import time
import traceback
from pathlib import Path

import requests
import runpod
import torch
from PIL import Image

logger = logging.getLogger("forge.handler")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DTYPE = torch.bfloat16

# ── Cache + token resolution ─────────────────────────────────────────────────
# RunPod mounts the network volume at /runpod-volume. We piggyback on the
# legacy pod's existing HuggingFace cache layout under
# /runpod-volume/models/.hf_cache so any model already downloaded by the
# always-on pod (Wan, LivePortrait, AudioLDM2, etc.) is reused for free,
# and anything we download (FLUX) lands in the same place for next time.
_VOLUME = Path("/runpod-volume")
if _VOLUME.exists():
    HF_CACHE_DIR = _VOLUME / "models" / ".hf_cache"
else:
    # Local dev / no-volume fallback
    HF_CACHE_DIR = Path("/opt/hf-cache")
HF_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Tell HF + transformers to use the volume-backed cache before any model
# library actually inspects these env vars.
os.environ["HF_HOME"] = str(HF_CACHE_DIR)
os.environ["HF_HUB_CACHE"] = str(HF_CACHE_DIR / "hub")
os.environ["TRANSFORMERS_CACHE"] = str(HF_CACHE_DIR / "hub")

HF_TOKEN = os.environ.get("HF_TOKEN") or None

# ── One-time pipeline boot (cold start) ──────────────────────────────────────


def _load_pipeline():
    """Load FLUX.1-dev into VRAM once. Reused across every invocation while
    the worker is warm. First-ever cold start downloads ~24 GB of FLUX-dev
    weights to the network volume; subsequent workers reuse the cache.
    """
    from diffusers import FluxPipeline

    logger.info(
        "Loading FLUX.1-dev cache_dir=%s token=%s device=%s dtype=%s",
        HF_CACHE_DIR, "set" if HF_TOKEN else "unset", DEVICE, DTYPE,
    )
    t0 = time.time()
    pipe = FluxPipeline.from_pretrained(
        "black-forest-labs/FLUX.1-dev",
        torch_dtype=DTYPE,
        cache_dir=str(HF_CACHE_DIR / "hub"),
        token=HF_TOKEN,
    )
    pipe.to(DEVICE)
    pipe.set_progress_bar_config(disable=True)
    logger.info("FLUX loaded in %.1fs (VRAM=%.1fGB)", time.time() - t0, _vram_gb())
    return pipe


def _vram_gb() -> float:
    if not torch.cuda.is_available():
        return 0.0
    return torch.cuda.memory_allocated() / 1e9


# Cold-start once. Module-level so RunPod's worker keeps it warm across jobs.
PIPE = _load_pipeline()

# Cache of fused LoRAs keyed by URL → weight, so repeated calls with the same
# LoRA don't re-download. Bounded so we don't grow forever.
_LORA_CACHE: dict[str, float] = {}
_LORA_CACHE_LIMIT = 8

# PuLID identity wrapper is loaded lazily on first reference-image request,
# because not every job needs it and it adds 2-3s to cold start.
_PULID = None


def _get_pulid():
    """Lazy-load PuLID-FLUX. Returns the identity-conditioning module.

    Wrapped in try/except so a PuLID load failure on the first identity
    request returns a clean error instead of crashing the worker process.
    """
    global _PULID
    if _PULID is not None:
        return _PULID
    try:
        from pulid.pipeline_flux import PuLIDPipeline  # type: ignore

        logger.info("Loading PuLID-FLUX (lazy)...")
        _PULID = PuLIDPipeline(
            pipe=PIPE,
            device=DEVICE,
            weight_dtype=DTYPE,
            cache_dir=str(HF_CACHE_DIR / "hub"),
        )
        logger.info("PuLID ready")
        return _PULID
    except ImportError as e:
        # The `pulid` package isn't pip-installable as-is; fall back to a
        # vendored implementation if/when we add one. For now, identity
        # mode returns an explicit error.
        raise RuntimeError(
            f"PuLID identity preservation isn't available in this image: {e}. "
            "Reference-image jobs will fail until the PuLID module is bundled."
        )


def _download_image(url: str) -> Image.Image:
    if url.startswith("data:image"):
        # data: URI — split off the base64 payload
        _, b64 = url.split(",", 1)
        return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
    resp = requests.get(url, timeout=30, stream=True)
    resp.raise_for_status()
    return Image.open(io.BytesIO(resp.content)).convert("RGB")


def _apply_loras(loras: list[dict]):
    """Fuse a list of LoRA adapters onto FLUX. Each entry: {url, weight, name?}.

    URLs are downloaded to a tmp dir (not persisted across cold starts in
    serverless) and fused with the given weight. Multiple LoRAs are fused
    additively — diffusers handles the math.
    """
    if not loras:
        return

    tmp = Path("/tmp/forge-loras")
    tmp.mkdir(exist_ok=True)
    adapter_names = []
    weights = []

    for i, lora in enumerate(loras[:3]):  # cap at 3 fused at once
        url = lora.get("url")
        weight = float(lora.get("weight", 1.0))
        name = lora.get("name") or f"lora_{i}"
        if not url:
            continue

        local = tmp / f"{name}.safetensors"
        if not local.exists():
            logger.info("Downloading LoRA %s → %s", url, local)
            r = requests.get(url, timeout=120, stream=True)
            r.raise_for_status()
            with open(local, "wb") as f:
                for chunk in r.iter_content(chunk_size=1 << 20):
                    f.write(chunk)

        # Diffusers' load_lora_weights with adapter_name supports stacking.
        try:
            PIPE.load_lora_weights(str(local), adapter_name=name)
            adapter_names.append(name)
            weights.append(weight)
            _LORA_CACHE[url] = weight
        except Exception as e:
            logger.warning("Failed to load LoRA %s: %s", url, e)

    if adapter_names:
        PIPE.set_adapters(adapter_names, adapter_weights=weights)
        logger.info("Activated LoRAs: %s with weights %s", adapter_names, weights)


def _reset_loras():
    try:
        PIPE.unfuse_lora()
    except Exception:
        pass
    try:
        PIPE.unload_lora_weights()
    except Exception:
        pass


def handler(event):
    """RunPod serverless invocation. One job per call."""
    inp = event.get("input") or {}
    prompt = (inp.get("prompt") or "").strip()
    if not prompt:
        return {"error": "prompt is required"}

    negative_prompt = inp.get("negative_prompt") or None
    width = int(inp.get("width") or 1024)
    height = int(inp.get("height") or 1024)
    steps = int(inp.get("num_inference_steps") or 28)
    guidance = float(inp.get("guidance_scale") or 3.5)
    seed = inp.get("seed")
    if seed is not None:
        seed = int(seed)
    else:
        seed = int(torch.randint(0, 2**31 - 1, (1,)).item())

    reference_url = inp.get("reference_image_url")
    id_weight = float(inp.get("id_weight") or 1.0)
    loras = inp.get("loras") or []

    logger.info(
        "Job start: prompt[:60]=%r w=%d h=%d steps=%d seed=%d ref=%s loras=%d",
        prompt[:60], width, height, steps, seed, bool(reference_url), len(loras),
    )

    try:
        _apply_loras(loras)

        generator = torch.Generator(device=DEVICE).manual_seed(seed)

        if reference_url:
            # Identity-preserving generation via PuLID
            ref_img = _download_image(reference_url)
            pulid = _get_pulid()
            image = pulid.generate(
                prompt=prompt,
                negative_prompt=negative_prompt,
                id_image=ref_img,
                id_weight=id_weight,
                width=width,
                height=height,
                num_inference_steps=steps,
                guidance_scale=guidance,
                generator=generator,
            )
        else:
            # Vanilla FLUX text-to-image
            result = PIPE(
                prompt=prompt,
                negative_prompt=negative_prompt,
                width=width,
                height=height,
                num_inference_steps=steps,
                guidance_scale=guidance,
                generator=generator,
            )
            image = result.images[0]

        buf = io.BytesIO()
        image.save(buf, format="PNG", optimize=False)
        b64 = base64.b64encode(buf.getvalue()).decode()

        logger.info("Job complete: vram=%.1fGB", _vram_gb())
        return {
            "image_b64": b64,
            "width": image.width,
            "height": image.height,
            "seed": seed,
            "mime_type": "image/png",
        }

    except Exception as e:
        tb = traceback.format_exc()
        logger.error("Job failed: %s\n%s", e, tb)
        return {"error": str(e), "traceback": tb}

    finally:
        _reset_loras()
        # Free transient tensors so we don't drift toward OOM over many jobs.
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
