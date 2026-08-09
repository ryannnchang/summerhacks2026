"""Seed the map with composition-varied submissions, without calling Gemini.

Writes rows that are structurally identical to what the upload route produces —
same quality formula, same glyph generation, same mural placement — but with the
composition set by hand instead of judged, because the Gemini free tier is capped.

Everything belongs to one seed user that has no `players` row, so none of it
reaches the leaderboard or elo. Every row is also stamped verdict_source='seed'.

Cleanup:  python seed_map.py --undo
"""

import random
import sys

from app.database import SessionLocal
from app.models import Drop, DropStatus, Submission, SubmissionStatus, User
from app.services import glyphs
from app.services import mural as mural_service
from app.services.grass_verifier import (
    GEMINI_BIODIVERSITY_WEIGHT,
    GEMINI_COVERAGE_WEIGHT,
    GEMINI_LUSHNESS_WEIGHT,
)
from app.services.scoring import total_score

from datetime import datetime, timedelta, timezone
import json

SEED_USERNAME = "seed-map-demo"
SEED_SOURCE = "seed"

# Real Toronto parks. Several submissions land inside each one so the map has
# genuine clusters to fuse — a tree-heavy cluster should draw a clump of trees,
# a flower-heavy one a clump of blooms. That is the thing worth eyeballing.
SITES = [
    # (name, lat, lng, how many, kind)
    ("High Park", 43.6465, -79.4637, 5, "trees"),
    ("Allan Gardens", 43.6614, -79.3735, 4, "flowers"),
    ("Trinity Bellwoods", 43.6472, -79.4131, 4, "grass"),
    ("Christie Pits", 43.6644, -79.4204, 3, "mixed"),
    ("Riverdale Park", 43.6689, -79.3540, 3, "trees-dead"),
    ("Withrow Park", 43.6746, -79.3453, 2, "flowers-wilting"),
    ("Sunnybrook Park", 43.7226, -79.3646, 2, "grass"),
    ("Sherwood Park", 43.7180, -79.3860, 2, "mixed"),
]

# grass / tree / flower fractions, then lushness, tree_quality, flower_quality.
KINDS = {
    "grass":           (0.92, 0.04, 0.04, 82, 40, 45),
    "trees":           (0.15, 0.85, 0.00, 70, 90, 0),
    "trees-dead":      (0.20, 0.80, 0.00, 74, 6, 0),
    "flowers":         (0.38, 0.02, 0.60, 68, 30, 92),
    "flowers-wilting": (0.40, 0.00, 0.60, 66, 0, 8),
    "mixed":           (0.40, 0.33, 0.27, 76, 78, 80),
}

PALETTES = [
    ["#2d5a27", "#4a7c3c", "#6b9955"],
    ["#1f4d1a", "#3f7233", "#77a860"],
    ["#356b2c", "#528b3f", "#8ab86a"],
]

FEATURES = {
    "grass": ["long grass", "clover"],
    "trees": ["oak", "canopy", "shade"],
    "trees-dead": ["bare branches", "dead tree"],
    "flowers": ["wildflower", "daisy", "flower bed"],
    "flowers-wilting": ["wilting flowers", "flower"],
    "mixed": ["clover", "wildflower", "shrub", "moss"],
}


def undo(db) -> None:
    user = db.query(User).filter(User.username == SEED_USERNAME).one_or_none()
    if user is None:
        print("nothing to undo — no seed user")
        return
    subs = db.query(Submission).filter(Submission.user_id == user.id).all()
    drop_ids = {s.drop_id for s in subs}
    for s in subs:
        db.delete(s)
    db.flush()
    for did in drop_ids:
        drop = db.get(Drop, did)
        if drop is not None and not drop.submissions:
            db.delete(drop)
    db.delete(user)
    db.commit()
    print(f"removed {len(subs)} seeded submissions, {len(drop_ids)} drops, and the seed user")


def seed(db) -> None:
    if db.query(User).filter(User.username == SEED_USERNAME).one_or_none():
        print("seed user already exists — run with --undo first")
        return

    # Reuse photo paths from real submissions so thumbnails resolve; the glyph is
    # the map pin, the photo only shows in the detail card.
    photos = [
        (s.image_path, s.thumbnail_path)
        for s in db.query(Submission).filter(Submission.image_path.isnot(None)).limit(40).all()
    ]
    if not photos:
        print("no existing photos to borrow paths from — aborting")
        return

    rng = random.Random(20260808)
    user = User(
        username=SEED_USERNAME,
        display_name="Map Seed (test data)",
        total_score=0.0,
        streak=0,
    )
    db.add(user)
    db.flush()

    now = datetime.now(timezone.utc)
    made = 0

    for name, lat, lng, count, kind in SITES:
        g, t, f, lush, tq, fq = KINDS[kind]
        for i in range(count):
            # Each submission needs its own drop: (user_id, drop_id) is unique.
            drop = Drop(
                status=DropStatus.CLOSED,
                scheduled_for=now - timedelta(days=2, minutes=made * 7),
                started_at=now - timedelta(days=2, minutes=made * 7),
                expires_at=now - timedelta(days=2, minutes=made * 7 - 30),
            )
            db.add(drop)
            db.flush()

            coverage = rng.uniform(62, 92)
            biodiversity = rng.uniform(35, 85)
            vegetation = g * lush + t * tq + f * fq
            quality = round(
                GEMINI_LUSHNESS_WEIGHT * vegetation
                + GEMINI_BIODIVERSITY_WEIGHT * biodiversity
                + GEMINI_COVERAGE_WEIGHT * coverage,
                2,
            )
            speed = round(rng.uniform(55, 100), 2)
            palette = rng.choice(PALETTES)

            sub = Submission(
                user_id=user.id,
                drop_id=drop.id,
                image_path=photos[made % len(photos)][0],
                thumbnail_path=photos[made % len(photos)][1],
                status=SubmissionStatus.VERIFIED,
                grass_coverage=round(coverage / 100, 4),
                texture_score=round(rng.uniform(0.08, 0.3), 4),
                quality_score=quality,
                speed_score=speed,
                total_score=total_score(quality, speed, 0),
                response_seconds=round(rng.uniform(60, 600), 2),
                dominant_color=palette[1],
                # Jittered ~150 m around the park so they cluster but don't stack.
                latitude=lat + rng.uniform(-0.0014, 0.0014),
                longitude=lng + rng.uniform(-0.0018, 0.0018),
                lushness=float(lush),
                biodiversity=round(biodiversity, 2),
                features_json=json.dumps({"palette": palette, "features": FEATURES[kind]}),
                verdict_source=SEED_SOURCE,
                grass_fraction=g,
                tree_fraction=t,
                flower_fraction=f,
                tree_quality=float(tq),
                flower_quality=float(fq),
                submitted_at=now - timedelta(hours=rng.uniform(1, 40)),
            )
            db.add(sub)
            db.flush()  # assigns the id that seeds the glyph
            sub.glyph_svg = glyphs.for_submission(sub)
            mural_service.place(db, sub)
            user.total_score += sub.total_score
            made += 1
        print(f"  {name:20} {count} x {kind}")

    db.commit()
    print(f"\nseeded {made} submissions as '{SEED_USERNAME}' (no players row -> off the leaderboard)")


if __name__ == "__main__":
    db = SessionLocal()
    try:
        if "--undo" in sys.argv:
            undo(db)
        else:
            seed(db)
    finally:
        db.close()
