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
        from services.gpu_client import gpu_client

        await gpu_client.infer(
            endpoint="/infer/lipsync",
            params={},
            input_files={"avatar": avatar_path, "audio": audio_path},
            output_path=output_path,
            timeout=300,
        )
        return output_path


live_portrait_wrapper = LivePortraitWrapper()
