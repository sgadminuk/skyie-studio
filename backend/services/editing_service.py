from __future__ import annotations
"""Advanced video editing service (Phase 6).

Handles: inpainting, background removal, segmentation, object replacement.
All GPU-intensive operations delegate to the inference server.
"""

import logging

from config import settings

logger = logging.getLogger(__name__)


class EditingService:
    """Advanced video and image editing operations."""

    async def inpaint_video(
        self,
        video_path: str,
        mask_path: str,
        output_path: str,
        prompt: str = "",
    ) -> str:
        """Remove or replace objects in video using inpainting mask.

        Args:
            video_path: Source video.
            mask_path: Binary mask (white = inpaint region).
            output_path: Result path.
            prompt: Optional prompt for what to fill with.
        """
        if settings.MOCK_MODE:
            logger.info("[MOCK] Video inpaint: %s (mask: %s)", video_path, mask_path)
            import shutil
            shutil.copy2(video_path, output_path)
            return output_path

        from services.gpu_client import gpu_client
        await gpu_client.infer(
            endpoint="/infer/inpaint",
            params={"prompt": prompt},
            input_files=[video_path, mask_path],
            output_path=output_path,
            timeout=600,
        )
        return output_path

    async def remove_background(
        self,
        input_path: str,
        output_path: str,
        replacement: str | None = None,
    ) -> str:
        """Remove background from video/image.

        Args:
            input_path: Source file.
            output_path: Result path.
            replacement: Optional replacement background (image path or prompt).
        """
        if settings.MOCK_MODE:
            logger.info("[MOCK] Background removal: %s", input_path)
            import shutil
            shutil.copy2(input_path, output_path)
            return output_path

        from services.gpu_client import gpu_client
        params = {}
        input_files = [input_path]
        if replacement and not replacement.startswith("/"):
            params["replacement_prompt"] = replacement
        elif replacement:
            input_files.append(replacement)

        await gpu_client.infer(
            endpoint="/infer/bg-remove",
            params=params,
            input_files=input_files,
            output_path=output_path,
            timeout=300,
        )
        return output_path

    async def segment_objects(
        self,
        input_path: str,
        output_path: str,
        point: tuple[int, int] | None = None,
        label: str | None = None,
    ) -> str:
        """Segment objects in image/video using SAM2.

        Args:
            input_path: Source file.
            output_path: Mask output path.
            point: Click point (x, y) for interactive segmentation.
            label: Text label for text-guided segmentation.
        """
        if settings.MOCK_MODE:
            logger.info("[MOCK] Segmentation: %s (point=%s, label=%s)", input_path, point, label)
            from PIL import Image
            img = Image.open(input_path).convert("L")
            w, h = img.size
            mask = Image.new("L", (w, h), 0)
            mask.paste(255, (w // 4, h // 4, 3 * w // 4, 3 * h // 4))
            mask.save(output_path)
            return output_path

        from services.gpu_client import gpu_client
        params = {}
        if point:
            params["point_x"], params["point_y"] = point
        if label:
            params["label"] = label

        await gpu_client.infer(
            endpoint="/infer/segment",
            params=params,
            input_files=[input_path],
            output_path=output_path,
            timeout=120,
        )
        return output_path

    async def style_transfer(
        self,
        content_path: str,
        output_path: str,
        style: str = "",
        style_image: str | None = None,
        strength: float = 0.7,
    ) -> str:
        """Apply style transfer to video/image."""
        if settings.MOCK_MODE:
            logger.info("[MOCK] Style transfer: %s → %s", content_path, style)
            import shutil
            shutil.copy2(content_path, output_path)
            return output_path

        from services.gpu_client import gpu_client
        input_files = [content_path]
        if style_image:
            input_files.append(style_image)

        await gpu_client.infer(
            endpoint="/infer/style-transfer",
            params={"style": style, "strength": strength},
            input_files=input_files,
            output_path=output_path,
            timeout=300,
        )
        return output_path


editing_service = EditingService()
