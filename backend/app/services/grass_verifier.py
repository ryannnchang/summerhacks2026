"""Decides whether a photo actually shows grass, and how good the grass is.

Pure-CV heuristic, no model download required — good enough for a demo and fast.
Three signals:
  coverage  fraction of pixels that are "vegetation green" in HSV
  texture   local variance inside the green region (real grass is noisy;
            a green wall, a screenshot, or a foam soccer field is flat)
  vibrance  mean saturation of the green region (healthy grass vs. dead/washed out)

Swap `verify_grass` for a model call later; the return shape is the contract.
"""

from dataclasses import dataclass
from io import BytesIO

import numpy as np
from PIL import Image, ImageFilter

from app.config import settings

# Vegetation band in HSV. PIL hue is 0-255, so green sits around 60-110.
HUE_MIN, HUE_MAX = 55, 115
SAT_MIN = 40
VAL_MIN, VAL_MAX = 25, 245

ANALYSIS_SIZE = (256, 256)


@dataclass
class GrassResult:
    is_grass: bool
    coverage: float
    texture: float
    vibrance: float
    quality: float  # 0-100
    reason: str | None
    dominant_color: str


def _dominant_green_hex(rgb: np.ndarray, mask: np.ndarray) -> str:
    pixels = rgb[mask] if mask.any() else rgb.reshape(-1, 3)
    r, g, b = (int(c) for c in pixels.mean(axis=0))
    return f"#{r:02x}{g:02x}{b:02x}"


def analyze_image(image: Image.Image) -> GrassResult:
    image = image.convert("RGB")
    small = image.copy()
    small.thumbnail(ANALYSIS_SIZE)

    rgb = np.asarray(small, dtype=np.uint8)
    hsv = np.asarray(small.convert("HSV"), dtype=np.uint8)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]

    mask = (h >= HUE_MIN) & (h <= HUE_MAX) & (s >= SAT_MIN) & (v >= VAL_MIN) & (v <= VAL_MAX)
    coverage = float(mask.mean())

    # Texture: high-pass the luminance and measure energy inside the green region.
    gray = small.convert("L")
    edges = np.asarray(gray.filter(ImageFilter.FIND_EDGES), dtype=np.float32) / 255.0
    texture = float(edges[mask].mean()) if mask.any() else 0.0

    vibrance = float(s[mask].mean() / 255.0) if mask.any() else 0.0

    reason: str | None = None
    if coverage < settings.min_grass_coverage:
        reason = f"Only {coverage:.0%} of that photo is green. Find more grass."
    elif texture < settings.min_texture_score:
        reason = "That green is suspiciously flat. Turf, a wall, or a screen won't count."

    # Quality: coverage carries it, texture and vibrance are multipliers.
    quality = 0.0
    if reason is None:
        coverage_pts = min(coverage / 0.75, 1.0) * 60
        texture_pts = min(texture / 0.25, 1.0) * 25
        vibrance_pts = min(vibrance / 0.55, 1.0) * 15
        quality = round(coverage_pts + texture_pts + vibrance_pts, 2)

    return GrassResult(
        is_grass=reason is None,
        coverage=round(coverage, 4),
        texture=round(texture, 4),
        vibrance=round(vibrance, 4),
        quality=quality,
        reason=reason,
        dominant_color=_dominant_green_hex(rgb, mask),
    )


def verify_grass(image_bytes: bytes) -> tuple[GrassResult, Image.Image]:
    """Returns the verdict plus the decoded image (so callers don't decode twice)."""
    image = Image.open(BytesIO(image_bytes))
    image.load()
    return analyze_image(image), image
