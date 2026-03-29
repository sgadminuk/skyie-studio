"""
Model Registry for Skyie Studio GPU Inference Server.

Tracks loaded models, VRAM usage, and provides load/unload methods.
Actual model loading requires real GPU libraries (torch, diffusers, etc.)
— stubs are provided here for the server skeleton.
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Known model catalogue — maps a human-readable key to metadata.
# VRAM estimates are rough and used for bookkeeping only.
# ---------------------------------------------------------------------------
MODEL_CATALOGUE: dict[str, dict[str, Any]] = {
    "tts-f5": {
        "name": "F5-TTS",
        "type": "tts",
        "vram_gb": 2.0,
        "hf_repo": "SWivid/F5-TTS",
    },
    "wav2lip": {
        "name": "Wav2Lip",
        "type": "lipsync",
        "vram_gb": 2.5,
        "hf_repo": "wav2lip/wav2lip",
    },
    "wan-t2v": {
        "name": "Wan2.1-T2V-14B",
        "type": "t2v",
        "vram_gb": 14.0,
        "hf_repo": "Wan-AI/Wan2.1-T2V-14B",
    },
    "wan-i2v": {
        "name": "Wan2.1-I2V-14B",
        "type": "i2v",
        "vram_gb": 14.0,
        "hf_repo": "Wan-AI/Wan2.1-I2V-14B-480P",
    },
    "flux-image": {
        "name": "FLUX.1-dev",
        "type": "image",
        "vram_gb": 12.0,
        "hf_repo": "black-forest-labs/FLUX.1-dev",
    },
    "yue-music": {
        "name": "YuE-s1-7B",
        "type": "music",
        "vram_gb": 8.0,
        "hf_repo": "m-a-p/YuE-s1-7B-anneal-en-cot",
    },
    "whisper-large": {
        "name": "Whisper-Large-V3-Turbo",
        "type": "transcribe",
        "vram_gb": 3.0,
        "hf_repo": "openai/whisper-large-v3-turbo",
    },
    # Phase 4: Video-to-Video & Extend
    "wan-v2v": {
        "name": "Wan2.2-V2V",
        "type": "v2v",
        "vram_gb": 14.0,
        "hf_repo": "Wan-AI/Wan2.2-T2V-A14B",
    },
    # Phase 5: Upscaling & Enhancement
    "realesrgan": {
        "name": "Real-ESRGAN-x4",
        "type": "upscale",
        "vram_gb": 2.0,
        "hf_repo": "ai-forever/Real-ESRGAN",
    },
    "rife": {
        "name": "RIFE-v4.22",
        "type": "interpolation",
        "vram_gb": 2.0,
        "hf_repo": "hzwer/Practical-RIFE",
    },
    "codeformer": {
        "name": "CodeFormer",
        "type": "face_enhance",
        "vram_gb": 2.0,
        "hf_repo": "sczhou/CodeFormer",
    },
    # Phase 6: Editing
    "propainter": {
        "name": "ProPainter",
        "type": "inpaint",
        "vram_gb": 4.0,
        "hf_repo": "MCG-NJU/ProPainter",
    },
    "sam2": {
        "name": "SAM2-Large",
        "type": "segment",
        "vram_gb": 3.0,
        "hf_repo": "facebook/sam2-hiera-large",
    },
    # Phase 7: Audio
    "audioldm2": {
        "name": "AudioLDM2",
        "type": "sfx",
        "vram_gb": 4.0,
        "hf_repo": "cvssp/audioldm2-large",
    },
    "demucs": {
        "name": "Demucs-v4",
        "type": "stems",
        "vram_gb": 2.0,
        "hf_repo": "facebook/demucs",
    },
    # Phase 10: Character Consistency
    "ip-adapter": {
        "name": "IP-Adapter-FaceID",
        "type": "character",
        "vram_gb": 4.0,
        "hf_repo": "h94/IP-Adapter-FaceID",
    },
}


@dataclass
class LoadedModel:
    """Represents a model that is currently loaded in VRAM."""

    key: str
    name: str
    model_type: str
    vram_gb: float
    loaded_at: float = field(default_factory=time.time)
    handle: Any = None  # Actual model / pipeline object


class ModelRegistry:
    """Manages model lifecycle: load, unload, and VRAM accounting."""

    def __init__(self, vram_limit_gb: float = 23.0):
        self.vram_limit_gb = vram_limit_gb
        self._loaded: dict[str, LoadedModel] = {}

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    @property
    def vram_used_gb(self) -> float:
        return sum(m.vram_gb for m in self._loaded.values())

    @property
    def vram_free_gb(self) -> float:
        return max(0.0, self.vram_limit_gb - self.vram_used_gb)

    def is_loaded(self, model_key: str) -> bool:
        return model_key in self._loaded

    def get_loaded_models(self) -> list[dict[str, Any]]:
        return [
            {
                "key": m.key,
                "name": m.name,
                "type": m.model_type,
                "vram_gb": m.vram_gb,
                "loaded_at": m.loaded_at,
            }
            for m in self._loaded.values()
        ]

    def get_status(self) -> dict[str, Any]:
        return {
            "vram_limit_gb": self.vram_limit_gb,
            "vram_used_gb": round(self.vram_used_gb, 2),
            "vram_free_gb": round(self.vram_free_gb, 2),
            "loaded_models": self.get_loaded_models(),
        }

    def get_catalogue(self) -> list[dict[str, Any]]:
        """Return the full model catalogue with loaded status."""
        result = []
        for key, meta in MODEL_CATALOGUE.items():
            entry = {
                "key": key,
                "name": meta["name"],
                "type": meta["type"],
                "vram_gb": meta["vram_gb"],
                "hf_repo": meta["hf_repo"],
                "loaded": self.is_loaded(key),
            }
            result.append(entry)
        return result

    # ------------------------------------------------------------------
    # Load / Unload
    # ------------------------------------------------------------------

    def load_model(self, model_key: str) -> LoadedModel:
        """
        Load a model into VRAM (stub).

        In production this would call torch / diffusers / transformers to
        actually instantiate the model on GPU.  Here we just do bookkeeping.
        """
        if model_key in self._loaded:
            logger.info("Model %s already loaded", model_key)
            return self._loaded[model_key]

        if model_key not in MODEL_CATALOGUE:
            raise ValueError(f"Unknown model key: {model_key}")

        meta = MODEL_CATALOGUE[model_key]
        required = meta["vram_gb"]

        if required > self.vram_free_gb:
            raise RuntimeError(
                f"Not enough VRAM to load {model_key}: "
                f"need {required:.1f} GB, have {self.vram_free_gb:.1f} GB free"
            )

        logger.info(
            "Loading model %s (%s) — %.1f GB VRAM",
            model_key,
            meta["name"],
            required,
        )

        # --- STUB: actual model loading would go here ---
        handle = self._create_model_stub(model_key, meta)

        loaded = LoadedModel(
            key=model_key,
            name=meta["name"],
            model_type=meta["type"],
            vram_gb=required,
            handle=handle,
        )
        self._loaded[model_key] = loaded
        logger.info(
            "Model %s loaded. VRAM: %.1f / %.1f GB",
            model_key,
            self.vram_used_gb,
            self.vram_limit_gb,
        )
        return loaded

    def unload_model(self, model_key: str) -> None:
        """Unload a model and free VRAM."""
        if model_key not in self._loaded:
            logger.warning("Model %s is not loaded — nothing to unload", model_key)
            return

        model = self._loaded.pop(model_key)
        # --- STUB: in production, delete the model and call torch.cuda.empty_cache() ---
        del model.handle
        logger.info(
            "Model %s unloaded. VRAM: %.1f / %.1f GB",
            model_key,
            self.vram_used_gb,
            self.vram_limit_gb,
        )

    def unload_all(self) -> None:
        """Unload every loaded model."""
        keys = list(self._loaded.keys())
        for key in keys:
            self.unload_model(key)

    def get_handle(self, model_key: str) -> Any:
        """Return the raw model/pipeline handle, or None."""
        loaded = self._loaded.get(model_key)
        return loaded.handle if loaded else None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _create_model_stub(model_key: str, meta: dict) -> dict:
        """
        Placeholder that returns a dict instead of a real model.
        Replace with actual pipeline construction per model type.
        """
        return {
            "stub": True,
            "key": model_key,
            "type": meta["type"],
            "hf_repo": meta["hf_repo"],
        }


# Singleton instance
registry = ModelRegistry()
