"""Fish Speech — zero-shot voice cloning TTS. Script → audio WAV."""

import logging
from config import settings
from models.model_manager import model_manager
from services.ffmpeg_service import generate_silent_audio

logger = logging.getLogger(__name__)

MODEL_NAME = "fish_speech"


class FishSpeechWrapper:
    async def generate(
        self,
        text: str,
        output_path: str,
        voice_reference: str | None = None,
        language: str = "en",
    ) -> str:
        """Generate speech audio from text."""
        if settings.MOCK_MODE:
            return self._mock_generate(text, output_path)
        return await self._real_generate(text, output_path, voice_reference, language)

    def _mock_generate(self, text: str, output_path: str) -> str:
        logger.info(f"[MOCK] Fish Speech TTS: {len(text)} chars → {output_path}")
        duration = max(2.0, len(text) * 0.06)  # ~60ms per character
        generate_silent_audio(output_path, duration)
        return output_path

    async def _real_generate(
        self,
        text: str,
        output_path: str,
        voice_reference: str | None,
        language: str,
    ) -> str:
        await model_manager.load_model(MODEL_NAME)
        model_manager.get_model_path(MODEL_NAME)

        # Real Fish Speech inference — to be implemented on GPU server
        # from fish_speech import ...
        raise NotImplementedError("Real Fish Speech inference requires GPU server")


fish_speech_wrapper = FishSpeechWrapper()
