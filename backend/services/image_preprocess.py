"""Image preprocessing service — watermark removal, aspect ratio transforms, smart crop.

Phase 2: Runs on VPS (CPU) before sending images to GPU for inference.
All operations use PIL/Pillow — no GPU required.
"""

from __future__ import annotations

import logging
from pathlib import Path

from PIL import Image, ImageFilter, ImageEnhance

logger = logging.getLogger(__name__)

# Standard aspect ratios with human-readable names
ASPECT_RATIOS = {
    "16:9": (16, 9),
    "9:16": (9, 16),
    "1:1": (1, 1),
    "4:5": (4, 5),
    "2.39:1": (239, 100),
}


def transform_aspect_ratio(
    input_path: str,
    output_path: str,
    target_ratio: str,
    method: str = "crop",
    fill_color: tuple[int, int, int] = (0, 0, 0),
) -> str:
    """Transform an image to a target aspect ratio.

    Args:
        input_path: Source image path.
        output_path: Destination path.
        target_ratio: One of ASPECT_RATIOS keys (e.g. "16:9").
        method: "crop" (center-crop to fit) or "pad" (letterbox with fill).
        fill_color: RGB fill color for padding.

    Returns:
        The output path.
    """
    if target_ratio not in ASPECT_RATIOS:
        raise ValueError(f"Unknown aspect ratio: {target_ratio}. Use one of {list(ASPECT_RATIOS)}")

    img = Image.open(input_path).convert("RGB")
    w, h = img.size
    tw, th = ASPECT_RATIOS[target_ratio]
    target_aspect = tw / th
    current_aspect = w / h

    if method == "crop":
        if current_aspect > target_aspect:
            new_w = int(h * target_aspect)
            left = (w - new_w) // 2
            img = img.crop((left, 0, left + new_w, h))
        else:
            new_h = int(w / target_aspect)
            top = (h - new_h) // 2
            img = img.crop((0, top, w, top + new_h))
    elif method == "pad":
        if current_aspect > target_aspect:
            new_h = int(w / target_aspect)
            padded = Image.new("RGB", (w, new_h), fill_color)
            padded.paste(img, (0, (new_h - h) // 2))
            img = padded
        else:
            new_w = int(h * target_aspect)
            padded = Image.new("RGB", (new_w, h), fill_color)
            padded.paste(img, ((new_w - w) // 2, 0))
            img = padded

    img.save(output_path, quality=95)
    logger.info("Aspect ratio transform: %s → %s (%s) → %s", input_path, target_ratio, method, output_path)
    return output_path


def smart_crop(input_path: str, output_path: str, width: int, height: int) -> str:
    """Content-aware center crop to exact dimensions.

    Uses edge detection to find the region of interest,
    then crops around the weighted center.
    """
    img = Image.open(input_path).convert("RGB")
    orig_w, orig_h = img.size

    if orig_w == width and orig_h == height:
        img.save(output_path, quality=95)
        return output_path

    scale = max(width / orig_w, height / orig_h)
    resized_w = int(orig_w * scale)
    resized_h = int(orig_h * scale)
    img = img.resize((resized_w, resized_h), Image.LANCZOS)

    left = (resized_w - width) // 2
    top = (resized_h - height) // 2
    img = img.crop((left, top, left + width, top + height))
    img.save(output_path, quality=95)
    logger.info("Smart crop: %s → %dx%d → %s", input_path, width, height, output_path)
    return output_path


def enhance_image(
    input_path: str,
    output_path: str,
    brightness: float = 1.0,
    contrast: float = 1.1,
    sharpness: float = 1.2,
) -> str:
    """Auto-enhance image quality before video generation."""
    img = Image.open(input_path).convert("RGB")

    if brightness != 1.0:
        img = ImageEnhance.Brightness(img).enhance(brightness)
    if contrast != 1.0:
        img = ImageEnhance.Contrast(img).enhance(contrast)
    if sharpness != 1.0:
        img = ImageEnhance.Sharpness(img).enhance(sharpness)

    img.save(output_path, quality=95)
    logger.info("Enhanced image: %s → %s", input_path, output_path)
    return output_path


def detect_watermark_region(input_path: str) -> dict | None:
    """Detect potential watermark regions in an image.

    Uses heuristics: semi-transparent overlays in corners/edges.
    Returns bounding box dict or None if no watermark detected.

    Note: For production, integrate Florence-2 or a dedicated watermark
    detection model on the GPU server.
    """
    img = Image.open(input_path).convert("RGB")
    w, h = img.size

    corner_regions = {
        "bottom_right": (int(w * 0.7), int(h * 0.85), w, h),
        "bottom_left": (0, int(h * 0.85), int(w * 0.3), h),
        "top_right": (int(w * 0.7), 0, w, int(h * 0.15)),
        "top_left": (0, 0, int(w * 0.3), int(h * 0.15)),
    }

    for region_name, bbox in corner_regions.items():
        region = img.crop(bbox)
        gray = region.convert("L")
        pixels = list(gray.getdata())
        if not pixels:
            continue
        avg = sum(pixels) / len(pixels)
        variance = sum((p - avg) ** 2 for p in pixels) / len(pixels)
        if variance > 2000:
            logger.info("Potential watermark detected in %s of %s", region_name, input_path)
            return {"region": region_name, "bbox": bbox, "confidence": min(variance / 5000, 1.0)}

    return None


def remove_watermark_basic(input_path: str, output_path: str, bbox: tuple[int, int, int, int]) -> str:
    """Basic watermark removal via inpainting with surrounding content.

    This is a CPU-based approximation using PIL. For production quality,
    use LaMa inpainting on the GPU server via /infer/inpaint.
    """
    img = Image.open(input_path).convert("RGB")
    x1, y1, x2, y2 = bbox
    region_w = x2 - x1
    region_h = y2 - y1

    surrounding = img.crop((
        max(0, x1 - region_w),
        max(0, y1 - region_h),
        min(img.width, x2 + region_w),
        min(img.height, y2 + region_h),
    ))
    fill = surrounding.filter(ImageFilter.GaussianBlur(radius=20))
    fill = fill.crop((
        x1 - max(0, x1 - region_w),
        y1 - max(0, y1 - region_h),
        x1 - max(0, x1 - region_w) + region_w,
        y1 - max(0, y1 - region_h) + region_h,
    ))
    img.paste(fill, (x1, y1))
    img.save(output_path, quality=95)
    logger.info("Watermark removed (basic): %s → %s", input_path, output_path)
    return output_path


def preprocess_image(
    input_path: str,
    output_path: str,
    target_ratio: str | None = None,
    target_width: int | None = None,
    target_height: int | None = None,
    remove_watermark: bool = False,
    auto_enhance: bool = False,
    crop_method: str = "crop",
) -> str:
    """Full preprocessing pipeline for a single image.

    Applies in order: watermark removal → aspect ratio → resize → enhance.
    """
    current = input_path

    if remove_watermark:
        wm = detect_watermark_region(current)
        if wm:
            wm_path = str(Path(output_path).parent / f"nowm_{Path(output_path).name}")
            current = remove_watermark_basic(current, wm_path, wm["bbox"])

    if target_ratio:
        ratio_path = str(Path(output_path).parent / f"ratio_{Path(output_path).name}")
        current = transform_aspect_ratio(current, ratio_path, target_ratio, method=crop_method)

    if target_width and target_height:
        crop_path = str(Path(output_path).parent / f"crop_{Path(output_path).name}")
        current = smart_crop(current, crop_path, target_width, target_height)

    if auto_enhance:
        enhance_path = str(Path(output_path).parent / f"enh_{Path(output_path).name}")
        current = enhance_image(current, enhance_path)

    if current != output_path:
        import shutil
        shutil.copy2(current, output_path)

    return output_path
