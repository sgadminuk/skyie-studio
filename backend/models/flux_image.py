"""FLUX.1 Schnell — fast image generation (1-4 step)."""

import logging
from pathlib import Path
from PIL import Image
from config import settings
from models.model_manager import model_manager

logger = logging.getLogger(__name__)

MODEL_NAME = "flux"


class FluxImageWrapper:
    async def generate(
        self,
        prompt: str,
        output_path: str,
        width: int = 1080,
        height: int = 1920,
        steps: int = 4,
    ) -> str:
        """Generate an image from a text prompt."""
        if settings.MOCK_MODE:
            return self._mock_generate(prompt, output_path, width, height)
        return await self._real_generate(prompt, output_path, width, height, steps)

    def _mock_generate(self, prompt: str, output_path: str, width: int, height: int) -> str:
        logger.info(f"[MOCK] FLUX: '{prompt[:50]}...' → {output_path}")
        # Create a solid color placeholder image with text
        img = Image.new("RGB", (width, height), color=(26, 26, 46))
        img.save(output_path)
        return output_path

    async def _real_generate(
        self,
        prompt: str,
        output_path: str,
        width: int,
        height: int,
        steps: int,
    ) -> str:
        await model_manager.load_model(MODEL_NAME)
        model_path = model_manager.get_model_path(MODEL_NAME)
        raise NotImplementedError("Real FLUX inference requires GPU server")


flux_image_wrapper = FluxImageWrapper()
