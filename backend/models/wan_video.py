"""Wan 2.2 — video generation models (T2V, I2V, TI2V, Animate, S2V)."""

import logging
from config import settings
from models.model_manager import model_manager
from services.ffmpeg_service import generate_test_video

logger = logging.getLogger(__name__)


class WanVideoWrapper:
    async def text_to_video(
        self,
        prompt: str,
        output_path: str,
        duration: float = 5.0,
        width: int = 1280,
        height: int = 720,
    ) -> str:
        """Generate video from text prompt (T2V-A14B)."""
        if settings.MOCK_MODE:
            logger.info(f"[MOCK] Wan T2V: '{prompt[:50]}...' → {output_path}")
            generate_test_video(output_path, duration, width, height)
            return output_path

        await model_manager.load_model("wan_t2v")
        raise NotImplementedError("Real Wan T2V inference requires GPU server")

    async def image_to_video(
        self,
        image_path: str,
        output_path: str,
        prompt: str = "",
        duration: float = 5.0,
    ) -> str:
        """Animate an image into a video clip (I2V-A14B)."""
        if settings.MOCK_MODE:
            logger.info(f"[MOCK] Wan I2V: {image_path} → {output_path}")
            generate_test_video(output_path, duration)
            return output_path

        await model_manager.load_model("wan_i2v")
        raise NotImplementedError("Real Wan I2V inference requires GPU server")

    async def text_image_to_video(
        self,
        text: str,
        image_path: str,
        output_path: str,
        duration: float = 5.0,
    ) -> str:
        """Fast text+image to video (TI2V-5B)."""
        if settings.MOCK_MODE:
            logger.info(f"[MOCK] Wan TI2V: '{text[:50]}' + {image_path} → {output_path}")
            generate_test_video(output_path, duration)
            return output_path

        await model_manager.load_model("wan_ti2v")
        raise NotImplementedError("Real Wan TI2V inference requires GPU server")

    async def animate_character(
        self,
        character_image: str,
        motion_prompt: str,
        output_path: str,
        duration: float = 5.0,
    ) -> str:
        """Character animation/replacement (Animate-14B)."""
        if settings.MOCK_MODE:
            logger.info(f"[MOCK] Wan Animate: {character_image} → {output_path}")
            generate_test_video(output_path, duration)
            return output_path

        await model_manager.load_model("wan_animate")
        raise NotImplementedError("Real Wan Animate inference requires GPU server")

    async def audio_to_video(
        self,
        audio_path: str,
        output_path: str,
        prompt: str = "",
        duration: float = 5.0,
    ) -> str:
        """Audio-driven video generation (S2V-14B)."""
        if settings.MOCK_MODE:
            logger.info(f"[MOCK] Wan S2V: {audio_path} → {output_path}")
            generate_test_video(output_path, duration)
            return output_path

        await model_manager.load_model("wan_s2v")
        raise NotImplementedError("Real Wan S2V inference requires GPU server")


wan_video_wrapper = WanVideoWrapper()
