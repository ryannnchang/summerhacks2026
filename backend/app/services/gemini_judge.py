"""Gemini vision judging: one API call, strict JSON out.

The judging is staged inside a single prompt:
  1. authenticity gate  — screens, prints, astroturf, plastic plants
  2. vegetation classification — real living plants outdoors
  3. composition        — what share of the frame is grass / trees / flowers
  4. quality scoring    — per-kind quality + biodiversity (variety beats lawn)
  5. feature extraction — palette + tags, which later parametrize the glyphs

`judge()` raises on any failure (no key, timeout, safety block, bad JSON) and
`grass_verifier.verify_grass` catches it and falls back to the CV heuristic, so
a Gemini outage degrades the judging rather than the demo.

The google-genai imports are function-local on purpose: without the package (or
a key) the rest of the app must still import and run heuristic-only.
"""

import logging
from io import BytesIO
from typing import Any

from PIL import Image
from pydantic import BaseModel, Field

from app.config import settings

logger = logging.getLogger(__name__)

# Gemini bills vision by resolution tiles; a 768px frame is plenty to judge grass.
JUDGE_SIZE = (768, 768)

PROMPT = """\
You are the judge for "Touch Grass", a game where players must go outside and
photograph real grass within a time limit. Players will try to cheat. Assess the
photo and answer using the JSON schema exactly.

- authentic: false if the photo shows a screen or monitor, a printed or
  re-photographed picture, artificial turf, a plastic plant, or any other fake.
  Tells: moiré or pixel grids, glare bands, paper edges, perfectly uniform
  blades, indoor carpet texture.
- is_grass: true for real, living outdoor vegetation that fills a meaningful
  part of the frame — lawn, meadow, clover, moss, weeds, but also trees, shrubs
  and flower beds. Houseplants, cut bouquets, bare dirt, and desks are false.
- rejection_reason: when authentic or is_grass is false, one short playful
  sentence telling the player why ("That's a screen. Go outside."). Otherwise null.
- coverage: percent of the frame covered by vegetation of any kind, 0-100.

Composition — how the vegetation splits by kind. These three are percentages of
the *vegetation*, not of the frame, and must sum to 100:
- grass_percent: lawn, meadow, moss, weeds, low ground cover.
- tree_percent: trees, saplings, tall shrubs, hedges, canopy and foliage.
- flower_percent: blooms of any kind — wildflowers, beds, blossom on a tree.
Judge by visual area. A lawn with one tree at the edge might be 85/15/0; a
photo up into a canopy with a strip of grass below might be 15/85/0.

Quality, each 0-100 and each judged only on that kind of plant. Score 0 for a
kind that is absent:
- lushness: how healthy, dense and green the GRASS is. 0 dead, 100 thriving.
- tree_quality: how good the TREES are. Full leafy canopy, strong form and
  healthy colour score high; bare, sickly, stumpy or heavily pruned score low.
- flower_quality: how good the FLOWERS are. Abundant, vivid, fresh blooms score
  high; sparse, wilting or browning ones score low.
- biodiversity: variety of plant life across the whole frame. Weeds, flowers,
  clover, moss and mixed species score HIGH; a uniform mowed monoculture lawn
  scores LOW. 0-100.
- palette: 3 to 5 dominant colors of the vegetation as #rrggbb hex strings.
- features: up to 8 short lowercase tags for what is visible, e.g.
  ["clover", "dandelion", "moss", "long grass", "oak", "blossom"].
"""


class GeminiVerdict(BaseModel):
    """The strict-JSON contract Gemini fills. Also the response schema we send."""

    authentic: bool
    is_grass: bool
    rejection_reason: str | None = None
    coverage: int = Field(ge=0, le=100)

    # Composition. Asked for as percentages summing to 100, but the model is not
    # held to that — merge_gemini renormalizes whatever comes back.
    grass_percent: int = Field(default=100, ge=0, le=100)
    tree_percent: int = Field(default=0, ge=0, le=100)
    flower_percent: int = Field(default=0, ge=0, le=100)

    lushness: int = Field(ge=0, le=100)
    tree_quality: int = Field(default=0, ge=0, le=100)
    flower_quality: int = Field(default=0, ge=0, le=100)
    biodiversity: int = Field(ge=0, le=100)
    palette: list[str] = []
    features: list[str] = []


_client: Any = None


def _get_client() -> Any:
    global _client
    if _client is None:
        from google import genai
        from google.genai import types

        _client = genai.Client(
            api_key=settings.gemini_api_key,
            http_options=types.HttpOptions(
                timeout=int(settings.gemini_timeout_seconds * 1000)  # milliseconds
            ),
        )
    return _client


def _judge_jpeg(image: Image.Image) -> bytes:
    small = image.convert("RGB").copy()
    small.thumbnail(JUDGE_SIZE)
    buf = BytesIO()
    small.save(buf, "JPEG", quality=85)
    return buf.getvalue()


def judge(image: Image.Image) -> GeminiVerdict:
    """One round trip: photo in, structured verdict out. Raises on any failure."""
    from google.genai import types

    response = _get_client().models.generate_content(
        model=settings.gemini_model,
        contents=[
            types.Part.from_bytes(data=_judge_jpeg(image), mime_type="image/jpeg"),
            PROMPT,
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=GeminiVerdict,
            temperature=0.1,
        ),
    )
    verdict = response.parsed
    if not isinstance(verdict, GeminiVerdict):
        raise ValueError(f"Gemini returned no parseable verdict: {response.text!r:.200}")
    return verdict
