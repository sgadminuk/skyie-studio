from __future__ import annotations
"""Video upscaling and enhancement service (Phase 5).

Handles: 4K upscale, face enhancement, frame interpolation.
Orchestrates GPU calls for model inference, FFmpeg for post-processing.
"""

import logging

from config import settings

logger = logging.getLogger(__name__)


class UpscaleService:
    """Upscale and enhance video quality."""

    async def upscale_video(
        self,
        input_path: str,
        output_path: str,
        scale: int = 2,
        face_enhance: bool = False,
    ) -> str:
        """Upscale a video using Real-ESRGAN on GPU.

        Args:
            input_path: Source video.
            output_path: Destination path.
            scale: Upscale factor (2 or 4).
            face_enhance: Whether to apply GFPGAN face restoration.
        """
        if settings.MOCK_MODE:
            logger.info("[MOCK] Upscale: %s → %s (×%d, face=%s)", input_path, output_path, scale, face_enhance)
            import shutil
            shutil.copy2(input_path, output_path)
            return output_path

        from services.gpu_client import gpu_client
        await gpu_client.infer(
            endpoint="/infer/upscale",
            params={"scale": scale, "face_enhance": face_enhance},
            input_files=[input_path],
            output_path=output_path,
            timeout=600,
        )
        return output_path

    async def interpolate_frames(
        self,
        input_path: str,
        output_path: str,
        target_fps: int = 60,
    ) -> str:
        """Increase frame rate using RIFE frame interpolation.

        Args:
            input_path: Source video.
            output_path: Destination path.
            target_fps: Target frame rate (30, 48, or 60).
        """
        if settings.MOCK_MODE:
            logger.info("[MOCK] Frame interpolation: %s → %dfps", input_path, target_fps)
            import shutil
            shutil.copy2(input_path, output_path)
            return output_path

        from services.gpu_client import gpu_client
        await gpu_client.infer(
            endpoint="/infer/interpolate",
            params={"target_fps": target_fps},
            input_files=[input_path],
            output_path=output_path,
            timeout=600,
        )
        return output_path

    async def enhance_faces(
        self,
        input_path: str,
        output_path: str,
    ) -> str:
        """Enhance faces in video using CodeFormer/GFPGAN."""
        if settings.MOCK_MODE:
            logger.info("[MOCK] Face enhance: %s", input_path)
            import shutil
            shutil.copy2(input_path, output_path)
            return output_path

        from services.gpu_client import gpu_client
        await gpu_client.infer(
            endpoint="/infer/face-enhance",
            params={},
            input_files=[input_path],
            output_path=output_path,
            timeout=300,
        )
        return output_path


upscale_service = UpscaleService()
