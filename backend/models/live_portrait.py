"""LivePortrait — talking head face animation. Photo + audio → video."""

import logging
from config import settings
from models.model_manager import model_manager
from services.ffmpeg_service import generate_test_video

logger = logging.getLogger(__name__)

MODEL_NAME = "live_portrait"


class LivePortraitWrapper:
    async def animate(
        self,
        avatar_path: str,
        audio_path: str,
        output_path: str,
    ) -> str:
        """Animate a face photo synced to audio."""
        if settings.MOCK_MODE:
            return self._mock_animate(avatar_path, audio_path, output_path)
        return await self._real_animate(avatar_path, audio_path, output_path)

    def _mock_animate(self, avatar_path: str, audio_path: str, output_path: str) -> str:
        logger.info(f"[MOCK] LivePortrait: {avatar_path} + {audio_path} → {output_path}")
        generate_test_video(output_path, duration=5.0, width=512, height=512)
        return output_path

    async def _real_animate(
        self,
        avatar_path: str,
        audio_path: str,
        output_path: str,
    ) -> str:
        await model_manager.load_model(MODEL_NAME)
        model_path = model_manager.get_model_path(MODEL_NAME)
        raise NotImplementedError("Real LivePortrait inference requires GPU server")


live_portrait_wrapper = LivePortraitWrapper()
