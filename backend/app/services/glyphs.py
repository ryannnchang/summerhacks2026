"""Procedural nature glyphs — every verified patch becomes a small SVG tuft.

Deliberately NOT per-submission AI image generation: a seeded PRNG draws
blades, clover, flowers and moss from the judge's signals, so glyphs are free,
instant, deterministic (same submission always draws the same tuft) and can't
fail on stage.

Style: flat vector, matching the app's fruit-sticker look — chunky filled
shapes, no outlines, white oval speck highlights.

Signal -> parameter map:
  grass/tree/flower_fraction
                how many blades, trees and blooms are drawn. A frame that is
                mostly canopy draws mostly canopy. Defaults to all grass, which
                is what heuristic-judged rows and pre-composition rows get.
  lushness      blade count and height; below WILT_BELOW it also drives the
                straw palette, the droop, and the loss of sheen
  tree_quality  trunk height, canopy size and density. Below WILT_BELOW the
                canopy is replaced by bare branches — a dead tree has to read
                as dead at 24 pixels, and a brown blob doesn't.
  flower_quality bloom size and petal count, withering toward straw
  biodiversity  lean/curve wildness, bonus wildflower
  palette       blade and canopy colors (Gemini) or shades of dominant_color
  features      which extra flora appear: clover, dandelion, flower/daisy, moss
  quality       marker size on the map (applied frontend-side)

Safety note: nothing user-controlled is embedded in the SVG. Palette hexes are
regex-validated in merge_gemini; feature tags are only *matched* here, never
written into the markup.
"""

import json
import math
import random

from app.models import Submission, SubmissionStatus

VIEW = 64  # square viewBox
BASE_Y = 58.0  # where the tuft meets the ground

DEFAULT_GREENS = ["#2d5a27", "#4a7c3c", "#6b9955"]

FLOWER_YELLOW = "#f2c94c"
PETAL_WHITE = "#f5f1e4"
SPECK_WHITE = "#ffffff"
TRUNK_BROWN = "#6b4a2f"

# Wilting. A quality at or above this draws a healthy plant; below it colors
# fade toward straw and forms sag, reaching full wilt at 0. Shared by all three
# kinds, so grass, trees and flowers all die on the same scale.
WILT_BELOW = 35.0
STRAW = (198, 163, 92)  # what dead vegetation fades to

# Ceilings on how much of each kind fits in a 64x64 tile before it turns to mush.
MAX_TREES = 3
MAX_FLOWERS = 5
# A kind holding less than this share of the frame still earns one of itself —
# rounding alone would erase the lone tree at the edge of a big lawn.
MIN_VISIBLE_SHARE = 0.08


def _hex_to_rgb(color: str) -> tuple[int, int, int]:
    return int(color[1:3], 16), int(color[3:5], 16), int(color[5:7], 16)


def _shade(color: str, factor: float) -> str:
    """factor < 1 darkens, > 1 lightens toward white-ish."""
    r, g, b = (min(255, max(0, round(c * factor))) for c in _hex_to_rgb(color))
    return f"#{r:02x}{g:02x}{b:02x}"


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _wither(color: str, amount: float) -> str:
    """Fades a plant color toward straw. `amount` 0 leaves it, 1 is fully dead."""
    r, g, b = _hex_to_rgb(color)
    mixed = tuple(round(c + (s - c) * amount) for c, s in zip((r, g, b), STRAW))
    return "#{:02x}{:02x}{:02x}".format(*mixed)


def _wilt_of(quality: float) -> float:
    """0 for anything healthy, ramping to 1 as a 0-100 quality falls to nothing."""
    return _clamp01((WILT_BELOW - quality) / WILT_BELOW)


def _share_count(fraction: float, ceiling: int) -> int:
    """How many of a kind to draw for its share of the frame."""
    count = round(ceiling * fraction)
    if count == 0 and fraction >= MIN_VISIBLE_SHARE:
        return 1
    return count


def make_glyph(
    *,
    seed: int,
    palette: list[str],
    features: list[str],
    lushness: float,
    biodiversity: float,
    grass_fraction: float = 1.0,
    tree_fraction: float = 0.0,
    flower_fraction: float = 0.0,
    tree_quality: float = 0.0,
    flower_quality: float = 0.0,
) -> str:
    rng = random.Random(seed)
    lush = _clamp01(lushness / 100.0)
    bio = _clamp01(biodiversity / 100.0)
    tq = _clamp01(tree_quality / 100.0)
    fq = _clamp01(flower_quality / 100.0)

    # Composition. The defaults draw an all-grass tuft, which is exactly what
    # heuristic-judged rows and rows from before composition existed should get.
    grass_frac = _clamp01(grass_fraction)
    tree_frac = _clamp01(tree_fraction)
    flower_frac = _clamp01(flower_fraction)

    # Each kind wilts on its own signal, so a lush lawn under a dead tree draws
    # exactly that.
    wilt = _wilt_of(lushness)
    tree_wilt = _wilt_of(tree_quality)
    dying = wilt > 0.0

    colors = [_wither(c, wilt) for c in (palette or DEFAULT_GREENS)] if dying else (
        palette or DEFAULT_GREENS
    )
    darkest = _shade(min(colors, key=lambda c: sum(_hex_to_rgb(c))), 0.8)
    tags = [f.lower() for f in features]

    def has(*words: str) -> bool:
        return any(word in tag for tag in tags for word in words)

    # How many of each kind. Grass keeps a floor of two blades whenever there is
    # any lawn at all: a strip of grass under a canopy is still the thing the
    # game is named after, and one blade reads as a stray artifact.
    n_blades = max(2, round((5 + 4 * lush) * grass_frac)) if grass_frac > 0 else 0
    n_trees = _share_count(tree_frac, MAX_TREES)

    parts: list[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VIEW} {VIEW}">'
    ]

    # Ground shadow, so the tuft sits on something. Trees widen the footprint.
    ground_rx = 13 + 6 * lush + 5 * tree_frac
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

    # Trees, drawn before the blades so the grass overlaps the foot of each
    # trunk and the whole thing reads as one scene rather than stacked layers.
    def tree_at(cx: float, scale: float) -> None:
        # Tall enough to clear the grass. A tree the same height as a blade
        # reads as a shrub, and the whole point is that you can tell at a glance
        # which kind of green a patch is.
        trunk_h = (17.0 + 18.0 * tq) * scale
        top = BASE_Y - trunk_h
        half_base, half_top = 1.5 * scale, 0.85 * scale
        bark = _wither(TRUNK_BROWN, tree_wilt * 0.55)
        parts.append(
            f'<path d="M{cx - half_base:.1f} {BASE_Y:.0f} L{cx - half_top:.1f} {top:.1f} '
            f'L{cx + half_top:.1f} {top:.1f} L{cx + half_base:.1f} {BASE_Y:.0f} Z" '
            f'fill="{bark}"/>'
        )

        # Past this point the tree has lost its leaves. Bare branches read as
        # dead at marker size; a withered canopy just looks like a brown blob.
        if tree_wilt > 0.55:
            for _ in range(rng.randint(3, 4)):
                angle = rng.uniform(-1.1, 1.1)
                length = (7.0 + 5.0 * rng.random()) * scale
                bx = cx + math.sin(angle) * length
                by = top - math.cos(angle) * length * 0.8
                parts.append(
                    f'<path d="M{cx:.1f} {top + 1.5:.1f} L{bx:.1f} {by:.1f}" fill="none" '
                    f'stroke="{bark}" stroke-width="{1.7 * scale:.1f}" stroke-linecap="round"/>'
                )
            return

        # Canopy: overlapping flat blobs, fuller and rounder the better the tree.
        canopy = [_wither(c, tree_wilt) for c in colors] if tree_wilt else colors
        radius = (5.0 + 3.2 * tq) * scale
        centre_y = top - radius * 0.35
        n_blobs = 3 + round(2 * tq)
        for i in range(n_blobs):
            angle = (i / n_blobs) * 2 * math.pi + rng.uniform(-0.25, 0.25)
            bx = cx + math.cos(angle) * radius * 0.62
            by = centre_y + math.sin(angle) * radius * 0.42
            parts.append(
                f'<circle cx="{bx:.1f}" cy="{by:.1f}" r="{radius * 0.62:.1f}" '
                f'fill="{rng.choice(canopy)}"/>'
            )
        parts.append(
            f'<circle cx="{cx:.1f}" cy="{centre_y:.1f}" r="{radius * 0.7:.1f}" '
            f'fill="{rng.choice(canopy)}"/>'
        )
        if tree_wilt < 0.5:
            hx, hy = cx - radius * 0.45, centre_y - radius * 0.5
            parts.append(
                f'<ellipse cx="{hx:.1f}" cy="{hy:.1f}" rx="{1.5 * scale:.1f}" ry="0.8" '
                f'transform="rotate(-35 {hx:.1f} {hy:.1f})" '
                f'fill="{SPECK_WHITE}" opacity="0.85"/>'
            )

    if n_trees:
        # Barely tied to the share of the frame: a lone tree at the edge of a big
        # lawn is still a full-sized tree, and shrinking it by its 10% share just
        # buried it in the grass. A row of three does shrink, to stay in frame.
        scale = (0.85 + 0.25 * tree_frac) * (1.0 - 0.13 * (n_trees - 1))
        for i in range(n_trees):
            tree_at(14.0 + ((i + 0.5) / n_trees) * 36.0, scale)

    # Blades: fat filled leaf shapes (base width tapering to a point), no
    # strokes — this is what makes the tuft read as flat-vector rather than
    # line art.
    blades: list[tuple[float, float, float, float]] = []
    for i in range(n_blades):
        t = i / max(1, n_blades - 1)
        x0 = 32 + (t - 0.5) * 2 * rng.uniform(0.7, 1.0) * 9
        # Minority grass grows shorter as well as sparser — a two-blade verge at
        # full height stands level with the canopy and the tile stops reading as
        # woodland. A full lawn keeps its original height exactly.
        height = (16 + 24 * lush) * (0.55 + 0.45 * grass_frac) * rng.uniform(0.75, 1.05)
        lean = rng.uniform(-1, 1) * (2.5 + 8 * bio)
        if dying:
            # Dead blades fold over: they lose height and lean away from centre.
            # The lean is capped so the tip stays inside the viewBox — an
            # unclamped droop flings blades off-canvas and the tuft renders empty.
            lean += math.copysign(1.0, lean or 1.0) * 7 * wilt * rng.uniform(0.7, 1.2)
            height *= 1.0 - 0.4 * wilt
            lean = max(min(lean, 60 - x0), 4 - x0)
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

    # White speck highlights — the signature of the sticker style. Dead grass
    # has no sheen to catch, so a fully wilted tuft gets none.
    speck_count = round(min(3, len(blades)) * (1.0 - wilt))
    for x0, height, lean, tip_x in rng.sample(blades, k=speck_count):
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
    # petals. How many, and how good they look, comes from the composition when
    # Gemini reported one.
    if flower_frac > 0:
        n_flowers = _share_count(flower_frac, MAX_FLOWERS)
        vigor, flower_wilt = fq, _wilt_of(flower_quality)
    else:
        # No composition — the original behaviour. High biodiversity earns a
        # wildflower even without a tag, and nothing blooms on a dying patch, so
        # that bonus is withdrawn; an explicitly tagged flower still draws,
        # since the judge saw one.
        wants_flower = has("dandelion", "flower", "daisy", "bloom", "wildflower")
        n_flowers = 0
        if wants_flower or (bio >= 0.6 and not dying):
            n_flowers = rng.randint(1, 2 if bio >= 0.5 else 1)
        vigor, flower_wilt = bio, wilt

    # Withering alone barely touches a bloom — FLOWER_YELLOW and STRAW are almost
    # the same colour, so a dead daisy still read as a buttercup. Darkening on top
    # of the fade is what turns it brown.
    head_yellow = _shade(_wither(FLOWER_YELLOW, flower_wilt), 1.0 - 0.4 * flower_wilt)
    petal_color = _shade(_wither(PETAL_WHITE, flower_wilt * 0.7), 1.0 - 0.35 * flower_wilt)
    for _ in range(n_flowers):
        fx = 32 + rng.uniform(-12, 12)
        fy = BASE_Y - (18 + 20 * max(lush, vigor)) * rng.uniform(0.8, 1.0)
        stem_to(fx, fy + 2.5)
        if has("daisy") or (not has("dandelion") and rng.random() < 0.4):
            ring = 2.4 + 1.0 * vigor
            for p in range(5):
                petal_angle = p * (2 * math.pi / 5) + rng.uniform(-0.2, 0.2)
                px = fx + ring * math.cos(petal_angle)
                py = fy + ring * math.sin(petal_angle)
                parts.append(
                    f'<circle cx="{px:.1f}" cy="{py:.1f}" r="{1.7 + 0.9 * vigor:.1f}" '
                    f'fill="{petal_color}"/>'
                )
            parts.append(
                f'<circle cx="{fx:.1f}" cy="{fy:.1f}" r="{1.6 + 0.7 * vigor:.1f}" '
                f'fill="{head_yellow}"/>'
            )
        else:
            parts.append(
                f'<circle cx="{fx:.1f}" cy="{fy:.1f}" r="{3.0 + 1.6 * vigor:.1f}" '
                f'fill="{head_yellow}"/>'
            )
            if flower_wilt < 0.5:
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

    # A rejection always draws fully dead, whatever the judge scored. Gemini
    # happily rates artificial turf as lush, so keying this off the signal
    # rather than the verdict would grow a thriving tuft for a plastic lawn.
    # Every kind is zeroed, or a fake forest would still draw a healthy canopy.
    rejected = submission.status == SubmissionStatus.REJECTED
    if rejected:
        lushness = 0.0
    else:
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

    # Composition is null for heuristic-judged rows and for anything submitted
    # before Gemini started reporting it; both mean "assume it's all grass".
    return make_glyph(
        seed=submission.id,
        palette=palette,
        features=features,
        lushness=lushness,
        biodiversity=biodiversity,
        grass_fraction=(
            submission.grass_fraction if submission.grass_fraction is not None else 1.0
        ),
        tree_fraction=submission.tree_fraction or 0.0,
        flower_fraction=submission.flower_fraction or 0.0,
        tree_quality=0.0 if rejected else (submission.tree_quality or 0.0),
        flower_quality=0.0 if rejected else (submission.flower_quality or 0.0),
    )
