"""Decides whether a photo actually shows plants, and how good they are.

The gate is *vegetation*, not strictly lawn: trees and flower beds count, and
Gemini reports how the frame splits between the three kinds so the score and the
glyph can both follow the actual composition. `GrassResult.is_grass` keeps its
name — it is the verified/rejected gate that the whole app already reads.

Two judges share one contract (`GrassResult`):

  Gemini (services/gemini_judge.py)  the real judge whenever GEMINI_API_KEY is
        set — authenticity gate, composition split, per-kind quality scoring,
        feature extraction for the glyphs.
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

    # What the vegetation is made of, as fractions summing to 1, plus the
    # per-kind quality that goes with each. None from the heuristic, which has
    # no way to tell a canopy from a lawn; downstream treats that as all grass.
    grass_fraction: float | None = None
    tree_fraction: float | None = None
    flower_fraction: float | None = None
    tree_quality: float | None = None
    flower_quality: float | None = None


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
# heavily on purpose: variety should beat a boring mowed lawn.
#
# The lushness slot now takes a *composition-weighted* vegetation quality rather
# than lushness alone, so a frame that is mostly trees is scored mostly on how
# good its trees are. A pure-grass photo scores exactly what it always did,
# because its composition collapses to grass 1.0 and the blend returns lushness.
GEMINI_LUSHNESS_WEIGHT = 0.45
GEMINI_BIODIVERSITY_WEIGHT = 0.35
GEMINI_COVERAGE_WEIGHT = 0.20

_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def _composition(verdict: GeminiVerdict) -> tuple[float, float, float]:
    """Gemini's three percentages as fractions summing to 1.

    The model is asked for a sum of 100 and usually obliges, but a strict schema
    can't enforce a cross-field constraint, so this renormalizes instead of
    trusting it. An all-zero answer means it declined to split the frame; that
    falls back to all grass, which is the pre-composition behaviour.
    """
    parts = (
        float(max(0, verdict.grass_percent)),
        float(max(0, verdict.tree_percent)),
        float(max(0, verdict.flower_percent)),
    )
    total = sum(parts)
    if total <= 0:
        return 1.0, 0.0, 0.0
    return tuple(round(p / total, 4) for p in parts)  # type: ignore[return-value]


def merge_gemini(base: GrassResult, verdict: GeminiVerdict) -> GrassResult:
    """Overlays Gemini's judgement on the locally computed pixel signals."""
    is_grass = verdict.authentic and verdict.is_grass

    reason: str | None = None
    if not is_grass:
        reason = (
            verdict.rejection_reason or ""
        ).strip() or "That doesn't look like real plants."

    grass_frac, tree_frac, flower_frac = _composition(verdict)

    # Each kind is judged on its own merits, then weighted by how much of the
    # frame it occupies. A kind that isn't there scores 0 but also weighs 0, so
    # it can neither help nor hurt.
    vegetation_quality = (
        grass_frac * verdict.lushness
        + tree_frac * verdict.tree_quality
        + flower_frac * verdict.flower_quality
    )

    quality = 0.0
    if is_grass:
        quality = round(
            GEMINI_LUSHNESS_WEIGHT * vegetation_quality
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
        grass_fraction=grass_frac,
        tree_fraction=tree_frac,
        flower_fraction=flower_frac,
        tree_quality=float(verdict.tree_quality),
        flower_quality=float(verdict.flower_quality),
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
