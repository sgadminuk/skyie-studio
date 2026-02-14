"""MusicGen (Meta) — background music generation."""

import logging
from config import settings
from models.model_manager import model_manager
from services.ffmpeg_service import generate_silent_audio

logger = logging.getLogger(__name__)

MODEL_NAME = "music_gen"


class MusicGenWrapper:
    async def generate(
        self,
        prompt: str,
        output_path: str,
        duration: float = 30.0,
    ) -> str:
        """Generate background music from a text description."""
        if settings.MOCK_MODE:
            return self._mock_generate(prompt, output_path, duration)
        return await self._real_generate(prompt, output_path, duration)

    def _mock_generate(self, prompt: str, output_path: str, duration: float) -> str:
        logger.info(f"[MOCK] MusicGen: '{prompt[:50]}' ({duration}s) → {output_path}")
        generate_silent_audio(output_path, duration)
        return output_path

    async def _real_generate(
        self,
        prompt: str,
        output_path: str,
        duration: float,
    ) -> str:
        from services.gpu_client import gpu_client

        await gpu_client.infer(
            endpoint="/infer/music",
            params={"prompt": prompt, "duration": duration},
            output_path=output_path,
            timeout=120,
        )
        return output_path


music_gen_wrapper = MusicGenWrapper()
