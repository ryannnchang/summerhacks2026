from fastapi import APIRouter, Query

from app import storage
from app.api.deps import DbSession
from app.config import settings
from app.models import Submission, SubmissionStatus, User
from app.schemas import MapOut, MapPatch
from app.services import glyphs

router = APIRouter(prefix="/map", tags=["map"])


@router.get("/patches", response_model=MapOut)
def read_patches(
    db: DbSession,
    limit: int = Query(500, le=2000),
    since_hours: int | None = None,
) -> MapOut:
    """Every verified patch of grass that came with coordinates.

    Public on purpose — the map is the front door, and it works before you join a group.
    """
    query = (
        db.query(Submission, User)
        .join(User, User.id == Submission.user_id)
        .filter(
            Submission.status == SubmissionStatus.VERIFIED,
            Submission.latitude.isnot(None),
            Submission.longitude.isnot(None),
        )
    )
    if since_hours:
        from datetime import datetime, timedelta, timezone

        cutoff = datetime.now(timezone.utc) - timedelta(hours=since_hours)
        query = query.filter(Submission.submitted_at >= cutoff)

    total = query.count()
    rows = query.order_by(Submission.submitted_at.desc()).limit(limit).all()

    # Lazy backfill: rows from before glyphs existed grow one on first sight.
    if any(s.glyph_svg is None for s, _ in rows):
        for s, _ in rows:
            if s.glyph_svg is None:
                s.glyph_svg = glyphs.for_submission(s)
        db.commit()

    return MapOut(
        center=(settings.map_center_lat, settings.map_center_lng),
        patch_count=total,
        patches=[
            MapPatch(
                submission_id=s.id,
                latitude=s.latitude,
                longitude=s.longitude,
                thumbnail_url=storage.public_url(s.thumbnail_path),
                username=u.username,
                total_score=s.total_score,
                quality_score=s.quality_score,
                submitted_at=s.submitted_at,
                glyph_svg=s.glyph_svg,
                # Null composition predates the tree/flower split; it was all
                # grass as far as anything downstream is concerned.
                grass_fraction=s.grass_fraction if s.grass_fraction is not None else 1.0,
                tree_fraction=s.tree_fraction or 0.0,
                flower_fraction=s.flower_fraction or 0.0,
            )
            for s, u in rows
        ],
    )
