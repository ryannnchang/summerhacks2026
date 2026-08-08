from fastapi import APIRouter, Query

from app import storage
from app.api.deps import DbSession
from app.config import settings
from app.models import Submission, SubmissionStatus, User
from app.schemas import MapOut, MapPatch

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
            )
            for s, u in rows
        ],
    )
