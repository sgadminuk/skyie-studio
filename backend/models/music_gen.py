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
        await model_manager.load_model(MODEL_NAME)
        model_manager.get_model_path(MODEL_NAME)
        raise NotImplementedError("Real MusicGen inference requires GPU server")


music_gen_wrapper = MusicGenWrapper()
