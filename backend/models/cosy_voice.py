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
        from services.gpu_client import gpu_client

        input_files = {}
        if speaker and speaker != "default":
            input_files["voice_reference"] = speaker
        await gpu_client.infer(
            endpoint="/infer/tts",
            params={"text": text, "language": language, "engine": "cosy_voice"},
            input_files=input_files or None,
            output_path=output_path,
            timeout=120,
        )
        return output_path


cosy_voice_wrapper = CosyVoiceWrapper()
