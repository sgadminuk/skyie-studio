"""VRAM-aware model manager. Only ONE heavy model in VRAM at a time."""

from __future__ import annotations

import gc
import logging
from dataclasses import dataclass, field
from config import settings

logger = logging.getLogger(__name__)

HEAVY_VRAM_THRESHOLD = 8  # GB — models above this can't coexist


@dataclass
class ModelInfo:
    name: str
    path: str
    vram_gb: float
    is_heavy: bool = field(init=False)

    def __post_init__(self):
        self.is_heavy = self.vram_gb >= HEAVY_VRAM_THRESHOLD


MODEL_REGISTRY: dict[str, ModelInfo] = {
    "wan_t2v": ModelInfo("wan_t2v", "wan2.2-t2v-a14b", 14),
    "wan_i2v": ModelInfo("wan_i2v", "wan2.2-i2v-a14b", 14),
    "wan_ti2v": ModelInfo("wan_ti2v", "wan2.2-ti2v-5b", 8),
    "wan_animate": ModelInfo("wan_animate", "wan2.2-animate-14b", 14),
    "wan_s2v": ModelInfo("wan_s2v", "wan2.2-s2v-14b", 14),
    "flux": ModelInfo("flux", "flux-schnell", 10),
    "live_portrait": ModelInfo("live_portrait", "liveportrait", 4),
    "fish_speech": ModelInfo("fish_speech", "fish-speech", 4),
    "cosy_voice": ModelInfo("cosy_voice", "cosyvoice", 4),
    "music_gen": ModelInfo("music_gen", "musicgen", 6),
    "whisper": ModelInfo("whisper", "whisper-large-v3", 4),
}


class ModelManager:
    def __init__(self):
        self._loaded: dict[str, object] = {}  # name → model instance
        self._loaded_vram: float = 0.0

    @property
    def loaded_models(self) -> list[str]:
        return list(self._loaded.keys())

    @property
    def vram_used(self) -> float:
        return self._loaded_vram

    def get_model_path(self, model_name: str) -> str:
        info = MODEL_REGISTRY[model_name]
        return str(settings.MODEL_BASE_PATH / info.path)

    async def load_model(self, model_name: str) -> object | None:
        """Load a model, unloading heavy models if needed to fit in VRAM."""
        if model_name in self._loaded:
            logger.info(f"Model {model_name} already loaded")
            return self._loaded[model_name]

        if model_name not in MODEL_REGISTRY:
            raise ValueError(f"Unknown model: {model_name}")

        info = MODEL_REGISTRY[model_name]

        if settings.MOCK_MODE:
            logger.info(f"[MOCK] Loading {model_name} ({info.vram_gb}GB VRAM)")
            self._loaded[model_name] = f"mock_{model_name}"
            self._loaded_vram += info.vram_gb
            return self._loaded[model_name]

        # If GPU_SERVER_URL is configured, skip local model loading
        if settings.GPU_SERVER_URL:
            logger.info(
                f"Remote GPU configured — skipping local load for {model_name}"
            )
            self._loaded[model_name] = f"remote_{model_name}"
            return self._loaded[model_name]

        # Check if we need to free VRAM
        if info.is_heavy:
            # Unload ALL heavy models first
            await self._unload_heavy_models()
        elif self._loaded_vram + info.vram_gb > settings.VRAM_LIMIT_GB:
            # Need space — unload heavy models first
            await self._unload_heavy_models()

        # Actual model loading happens in the individual model wrappers
        # The manager tracks what's loaded for VRAM accounting
        logger.info(f"Loading {model_name} ({info.vram_gb}GB VRAM)")
        self._loaded[model_name] = True  # Placeholder — real model set by wrapper
        self._loaded_vram += info.vram_gb
        return None

    def register_loaded(self, model_name: str, model_instance: object):
        """Called by model wrappers after actual model loading."""
        self._loaded[model_name] = model_instance

    async def unload_model(self, model_name: str):
        """Unload a specific model and free VRAM."""
        if model_name not in self._loaded:
            return

        info = MODEL_REGISTRY.get(model_name)
        model = self._loaded.pop(model_name)

        if not settings.MOCK_MODE:
            del model
            try:
                import torch
                torch.cuda.empty_cache()
            except ImportError:
                pass
            gc.collect()

        if info:
            self._loaded_vram = max(0, self._loaded_vram - info.vram_gb)
        logger.info(f"Unloaded {model_name}, VRAM: {self._loaded_vram:.1f}GB")

    async def _unload_heavy_models(self):
        """Unload all heavy models (>= threshold) to make room."""
        heavy = [
            name for name in list(self._loaded.keys())
            if MODEL_REGISTRY.get(name, ModelInfo("", "", 0)).is_heavy
        ]
        for name in heavy:
            await self.unload_model(name)

    async def unload_all(self):
        """Unload everything."""
        for name in list(self._loaded.keys()):
            await self.unload_model(name)

    def get_status(self) -> dict:
        return {
            "loaded_models": self.loaded_models,
            "vram_used_gb": round(self._loaded_vram, 1),
            "vram_limit_gb": settings.VRAM_LIMIT_GB,
            "vram_available_gb": round(settings.VRAM_LIMIT_GB - self._loaded_vram, 1),
            "mock_mode": settings.MOCK_MODE,
            "registry": {
                name: {
                    "vram_gb": info.vram_gb,
                    "is_heavy": info.is_heavy,
                    "loaded": name in self._loaded,
                }
                for name, info in MODEL_REGISTRY.items()
            },
        }


# Singleton
model_manager = ModelManager()
