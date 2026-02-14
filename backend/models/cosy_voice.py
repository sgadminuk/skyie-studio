"""CosyVoice — multi-language TTS with native Wan integration."""

import logging
from config import settings
from models.model_manager import model_manager
from services.ffmpeg_service import generate_silent_audio

logger = logging.getLogger(__name__)

MODEL_NAME = "cosy_voice"


class CosyVoiceWrapper:
    async def generate(
        self,
        text: str,
        output_path: str,
        speaker: str = "default",
        language: str = "en",
    ) -> str:
        """Generate speech audio from text."""
        if settings.MOCK_MODE:
            return self._mock_generate(text, output_path)
        return await self._real_generate(text, output_path, speaker, language)

    def _mock_generate(self, text: str, output_path: str) -> str:
        logger.info(f"[MOCK] CosyVoice TTS: {len(text)} chars → {output_path}")
        duration = max(2.0, len(text) * 0.06)
        generate_silent_audio(output_path, duration)
        return output_path

    async def _real_generate(
        self,
        text: str,
        output_path: str,
        speaker: str,
        language: str,
    ) -> str:
        await model_manager.load_model(MODEL_NAME)
        model_manager.get_model_path(MODEL_NAME)
        raise NotImplementedError("Real CosyVoice inference requires GPU server")


cosy_voice_wrapper = CosyVoiceWrapper()
