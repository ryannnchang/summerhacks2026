"""Procedural nature glyphs — every verified patch becomes a small SVG tuft.

Deliberately NOT per-submission AI image generation: a seeded PRNG draws
blades, clover, flowers and moss from the judge's signals, so glyphs are free,
instant, deterministic (same submission always draws the same tuft) and can't
fail on stage.

Style: flat vector, matching the app's fruit-sticker look — chunky filled
shapes, no outlines, white oval speck highlights.

Signal -> parameter map:
  lushness      blade count and height
  biodiversity  lean/curve wildness, bonus wildflower
  palette       blade colors (Gemini) or shades derived from dominant_color
  features      which flora appear: clover, dandelion, flower/daisy, moss
  quality       marker size on the map (applied frontend-side)

Safety note: nothing user-controlled is embedded in the SVG. Palette hexes are
regex-validated in merge_gemini; feature tags are only *matched* here, never
written into the markup.
"""

import json
import math
import random

from app.models import Submission

VIEW = 64  # square viewBox
BASE_Y = 58.0  # where the tuft meets the ground

DEFAULT_GREENS = ["#2d5a27", "#4a7c3c", "#6b9955"]

FLOWER_YELLOW = "#f2c94c"
PETAL_WHITE = "#f5f1e4"
SPECK_WHITE = "#ffffff"


def _hex_to_rgb(color: str) -> tuple[int, int, int]:
    return int(color[1:3], 16), int(color[3:5], 16), int(color[5:7], 16)


def _shade(color: str, factor: float) -> str:
    """factor < 1 darkens, > 1 lightens toward white-ish."""
    r, g, b = (min(255, max(0, round(c * factor))) for c in _hex_to_rgb(color))
    return f"#{r:02x}{g:02x}{b:02x}"


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def make_glyph(
    *,
    seed: int,
    palette: list[str],
    features: list[str],
    lushness: float,
    biodiversity: float,
) -> str:
    rng = random.Random(seed)
    lush = _clamp01(lushness / 100.0)
    bio = _clamp01(biodiversity / 100.0)

    colors = palette or DEFAULT_GREENS
    darkest = _shade(min(colors, key=lambda c: sum(_hex_to_rgb(c))), 0.8)
    tags = [f.lower() for f in features]

    def has(*words: str) -> bool:
        return any(word in tag for tag in tags for word in words)

    parts: list[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VIEW} {VIEW}">'
    ]

    # Ground shadow, so the tuft sits on something.
    ground_rx = 13 + 6 * lush
    parts.append(
        f'<ellipse cx="32" cy="{BASE_Y + 0.5:.1f}" rx="{ground_rx:.1f}" ry="2.2" '
        f'fill="{darkest}" opacity="0.3"/>'
    )

    # Moss: chunky flat dots along the baseline, drawn under the blades.
    if has("moss", "lichen"):
        for _ in range(rng.randint(4, 7)):
            mx = rng.uniform(18, 46)
            my = rng.uniform(BASE_Y - 1.0, BASE_Y + 1.5)
            mr = rng.uniform(1.6, 2.6)
            parts.append(
                f'<circle cx="{mx:.1f}" cy="{my:.1f}" r="{mr:.1f}" '
                f'fill="{darkest}" opacity="0.85"/>'
            )

    # Blades: fat filled leaf shapes (base width tapering to a point), no
    # strokes — this is what makes the tuft read as flat-vector rather than
    # line art.
    blades: list[tuple[float, float, float, float]] = []
    n_blades = 5 + round(4 * lush)
    for i in range(n_blades):
        t = i / max(1, n_blades - 1)
        x0 = 32 + (t - 0.5) * 2 * rng.uniform(0.7, 1.0) * 9
        height = (16 + 24 * lush) * rng.uniform(0.75, 1.05)
        lean = rng.uniform(-1, 1) * (2.5 + 8 * bio)
        half = rng.uniform(1.7, 3.0)
        tip_x, tip_y = x0 + lean, BASE_Y - height
        mid_y = BASE_Y - height * 0.5
        color = rng.choice(colors)
        parts.append(
            f'<path d="M{x0 - half:.1f} {BASE_Y:.0f} '
            f'Q{x0 - half + lean * 0.4:.1f} {mid_y:.1f} {tip_x:.1f} {tip_y:.1f} '
            f'Q{x0 + half + lean * 0.4:.1f} {mid_y:.1f} {x0 + half:.1f} {BASE_Y:.0f} Z" '
            f'fill="{color}"/>'
        )
        blades.append((x0, height, lean, tip_x))

    # White speck highlights — the signature of the sticker style.
    for x0, height, lean, tip_x in rng.sample(blades, k=min(3, len(blades))):
        frac = rng.uniform(0.4, 0.65)
        hx = x0 + (tip_x - x0) * frac
        hy = BASE_Y - height * frac
        angle = math.degrees(math.atan2(-height, lean))  # long axis along the blade
        rx = rng.uniform(1.0, 1.6)
        parts.append(
            f'<ellipse cx="{hx:.1f}" cy="{hy:.1f}" rx="{rx:.1f}" ry="0.6" '
            f'transform="rotate({angle:.0f} {hx:.1f} {hy:.1f})" '
            f'fill="{SPECK_WHITE}" opacity="0.85"/>'
        )

    def stem_to(x: float, y: float) -> None:
        root = x + rng.uniform(-2, 2)
        parts.append(
            f'<path d="M{root:.1f} {BASE_Y:.0f} Q{(root + x) / 2:.1f} '
            f'{(BASE_Y + y) / 2:.1f} {x:.1f} {y:.1f}" fill="none" '
            f'stroke="{darkest}" stroke-width="1.7" stroke-linecap="round"/>'
        )

    # Clover: up to two chunky three-leaf clusters tucked low in the tuft.
    if has("clover", "shamrock"):
        for _ in range(rng.randint(1, 2)):
            cx = 32 + rng.uniform(-10, 10)
            cy = BASE_Y - rng.uniform(9, 15)
            stem_to(cx, cy + 2.5)
            leaf = _shade(rng.choice(colors), 0.9)
            for dx, dy in ((0.0, -2.7), (-2.6, 1.6), (2.6, 1.6)):
                parts.append(
                    f'<circle cx="{cx + dx:.1f}" cy="{cy + dy:.1f}" r="3.0" '
                    f'fill="{leaf}"/>'
                )
            parts.append(
                f'<ellipse cx="{cx - 1.2:.1f}" cy="{cy - 2.9:.1f}" rx="1.0" ry="0.55" '
                f'transform="rotate(-35 {cx - 1.2:.1f} {cy - 2.9:.1f})" '
                f'fill="{SPECK_WHITE}" opacity="0.85"/>'
            )

    # Flowers: dandelions get a fat yellow head with a speck, daisies get
    # petals. High biodiversity earns a wildflower even without a tag.
    wants_flower = has("dandelion", "flower", "daisy", "bloom", "wildflower")
    if wants_flower or bio >= 0.6:
        for _ in range(rng.randint(1, 2 if bio >= 0.5 else 1)):
            fx = 32 + rng.uniform(-11, 11)
            fy = BASE_Y - (20 + 22 * lush) * rng.uniform(0.8, 1.0)
            stem_to(fx, fy + 2.5)
            if has("daisy") or (not has("dandelion") and rng.random() < 0.4):
                for p in range(5):
                    petal_angle = p * (2 * math.pi / 5) + rng.uniform(-0.2, 0.2)
                    px = fx + 3.0 * math.cos(petal_angle)
                    py = fy + 3.0 * math.sin(petal_angle)
                    parts.append(
                        f'<circle cx="{px:.1f}" cy="{py:.1f}" r="2.2" '
                        f'fill="{PETAL_WHITE}"/>'
                    )
                parts.append(
                    f'<circle cx="{fx:.1f}" cy="{fy:.1f}" r="2.0" fill="{FLOWER_YELLOW}"/>'
                )
            else:
                parts.append(
                    f'<circle cx="{fx:.1f}" cy="{fy:.1f}" r="4.0" fill="{FLOWER_YELLOW}"/>'
                )
                parts.append(
                    f'<ellipse cx="{fx - 1.3:.1f}" cy="{fy - 1.5:.1f}" rx="1.1" ry="0.6" '
                    f'transform="rotate(-35 {fx - 1.3:.1f} {fy - 1.5:.1f})" '
                    f'fill="{SPECK_WHITE}" opacity="0.9"/>'
                )

    parts.append("</svg>")
    return "".join(parts)


def for_submission(submission: Submission) -> str:
    """Draws the glyph for a row, with fallbacks for heuristic-judged rows."""
    palette: list[str] = []
    features: list[str] = []
    if submission.features_json:
        extras = json.loads(submission.features_json)
        palette = extras.get("palette") or []
        features = extras.get("features") or []

    if not palette:
        base = submission.dominant_color
        palette = (
            [_shade(base, 0.75), base, _shade(base, 1.25)] if base else DEFAULT_GREENS
        )

    lushness = (
        submission.lushness if submission.lushness is not None else submission.quality_score
    )
    biodiversity = (
        submission.biodiversity
        if submission.biodiversity is not None
        # The heuristic has no biodiversity signal; edge texture is the nearest
        # proxy (mixed flora is noisier than a mowed monoculture).
        else max(20.0, min(70.0, submission.texture_score * 300))
    )

    return make_glyph(
        seed=submission.id,
        palette=palette,
        features=features,
        lushness=lushness,
        biodiversity=biodiversity,
    )
