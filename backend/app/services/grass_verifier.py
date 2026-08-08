"""Decides whether a photo actually shows grass, and how good the grass is.

Two judges share one contract (`GrassResult`):

  Gemini (services/gemini_judge.py)  the real judge whenever GEMINI_API_KEY is
        set — authenticity gate, lushness/biodiversity scoring, feature
        extraction for the glyphs.
  CV heuristic (this file)  HSV coverage + edge texture + saturation vibrance.
        Judges alone when there is no key, and catches every Gemini failure so
        an API outage never turns into a spinner on stage.

The local pixel signals (coverage / texture / vibrance / dominant color) are
computed on every submission regardless of judge — they cost milliseconds and
keep those DB columns meaningful for re-tuning later.
"""

import logging
import re
from dataclasses import dataclass, replace
from io import BytesIO

import numpy as np
from PIL import Image, ImageFilter

from app.config import settings
from app.services import gemini_judge
from app.services.gemini_judge import GeminiVerdict

logger = logging.getLogger(__name__)

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

    # Gemini-only signals; None when the heuristic judged. Palette and features
    # are what the glyph generator will consume.
    lushness: float | None = None
    biodiversity: float | None = None
    palette: list[str] | None = None
    features: list[str] | None = None
    source: str = "heuristic"  # which judge produced the verdict


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


# Gemini's 0-100 signals -> one 0-100 quality score. Biodiversity is weighted
# heavily on purpose: weeds and flowers should beat a boring mowed lawn.
GEMINI_LUSHNESS_WEIGHT = 0.45
GEMINI_BIODIVERSITY_WEIGHT = 0.35
GEMINI_COVERAGE_WEIGHT = 0.20

_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def merge_gemini(base: GrassResult, verdict: GeminiVerdict) -> GrassResult:
    """Overlays Gemini's judgement on the locally computed pixel signals."""
    is_grass = verdict.authentic and verdict.is_grass

    reason: str | None = None
    if not is_grass:
        reason = (verdict.rejection_reason or "").strip() or "That doesn't look like real grass."

    quality = 0.0
    if is_grass:
        quality = round(
            GEMINI_LUSHNESS_WEIGHT * verdict.lushness
            + GEMINI_BIODIVERSITY_WEIGHT * verdict.biodiversity
            + GEMINI_COVERAGE_WEIGHT * verdict.coverage,
            2,
        )

    palette = [c.lower() for c in verdict.palette if _HEX_COLOR.match(c)][:5]
    features = [f.strip().lower() for f in verdict.features if f.strip()][:8]

    return replace(
        base,
        is_grass=is_grass,
        reason=reason,
        quality=quality,
        lushness=float(verdict.lushness),
        biodiversity=float(verdict.biodiversity),
        palette=palette or None,
        features=features or None,
        source="gemini",
    )


def verify_grass(image_bytes: bytes) -> tuple[GrassResult, Image.Image]:
    """Returns the verdict plus the decoded image (so callers don't decode twice).

    Blocking (Gemini is a network round trip) — call it off the event loop.
    """
    image = Image.open(BytesIO(image_bytes))
    image.load()

    result = analyze_image(image)
    if settings.gemini_api_key:
        try:
            result = merge_gemini(result, gemini_judge.judge(image))
        except Exception:
            logger.warning("Gemini judge failed; falling back to CV heuristic", exc_info=True)
    return result, image
