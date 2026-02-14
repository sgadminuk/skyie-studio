"""Whisper Large-v3 — speech-to-text / auto-captioning."""

import logging
from config import settings
from models.model_manager import model_manager
from services.caption_service import generate_mock_srt

logger = logging.getLogger(__name__)

MODEL_NAME = "whisper"


class WhisperWrapper:
    async def transcribe(
        self,
        audio_path: str,
        output_srt: str,
        language: str | None = None,
    ) -> str:
        """Transcribe audio to SRT captions."""
        if settings.MOCK_MODE:
            return self._mock_transcribe(audio_path, output_srt)
        return await self._real_transcribe(audio_path, output_srt, language)

    def _mock_transcribe(self, audio_path: str, output_srt: str) -> str:
        logger.info(f"[MOCK] Whisper: {audio_path} → {output_srt}")
        return generate_mock_srt(
            output_srt,
            "This is an automatically generated caption for the Skyie Studio video.",
            duration=10.0,
        )

    async def _real_transcribe(
        self,
        audio_path: str,
        output_srt: str,
        language: str | None,
    ) -> str:
        await model_manager.load_model(MODEL_NAME)
        model_manager.get_model_path(MODEL_NAME)
        raise NotImplementedError("Real Whisper inference requires GPU server")


whisper_wrapper = WhisperWrapper()
