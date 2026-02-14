"""FLUX.1 Schnell — fast image generation (1-4 step)."""

import logging
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
        import httpx
        from pathlib import Path

        if not settings.HF_API_KEY:
            raise RuntimeError("HF_API_KEY not configured")
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell",
                headers={"Authorization": f"Bearer {settings.HF_API_KEY}"},
                json={"inputs": prompt, "parameters": {"width": width, "height": height}},
            )
            response.raise_for_status()
            Path(output_path).write_bytes(response.content)
        return output_path


flux_image_wrapper = FluxImageWrapper()
