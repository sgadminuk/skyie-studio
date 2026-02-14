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

        from services.gpu_client import gpu_client

        await gpu_client.infer(
            endpoint="/infer/t2v",
            params={"prompt": prompt, "duration": duration, "width": width, "height": height},
            output_path=output_path,
            timeout=300,
        )
        return output_path

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

        from services.gpu_client import gpu_client

        await gpu_client.infer(
            endpoint="/infer/i2v",
            params={"prompt": prompt, "duration": duration},
            input_files={"image": image_path},
            output_path=output_path,
            timeout=300,
        )
        return output_path

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

        from services.gpu_client import gpu_client

        await gpu_client.infer(
            endpoint="/infer/ti2v",
            params={"text": text, "duration": duration},
            input_files={"image": image_path},
            output_path=output_path,
            timeout=300,
        )
        return output_path

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

        from services.gpu_client import gpu_client

        await gpu_client.infer(
            endpoint="/infer/animate",
            params={"motion_prompt": motion_prompt, "duration": duration},
            input_files={"character": character_image},
            output_path=output_path,
            timeout=300,
        )
        return output_path

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

        from services.gpu_client import gpu_client

        await gpu_client.infer(
            endpoint="/infer/s2v",
            params={"prompt": prompt, "duration": duration},
            input_files={"audio": audio_path},
            output_path=output_path,
            timeout=300,
        )
        return output_path


wan_video_wrapper = WanVideoWrapper()
