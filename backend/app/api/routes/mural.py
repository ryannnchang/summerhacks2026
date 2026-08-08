from fastapi import APIRouter

from app import storage
from app.api.deps import DbSession
from app.models import Submission, SubmissionStatus, User
from app.schemas import MuralOut, MuralTile
from app.services import mural as mural_service

router = APIRouter(prefix="/mural", tags=["mural"])


@router.get("", response_model=MuralOut)
def read_mural(db: DbSession, limit: int = 500, offset: int = 0) -> MuralOut:
    """The global mural — every verified patch of grass, from everyone."""
    query = (
        db.query(Submission, User)
        .join(User, User.id == Submission.user_id)
        .filter(
            Submission.status == SubmissionStatus.VERIFIED,
            Submission.mural_x.isnot(None),
        )
    )
    total = query.count()
    rows = (
        query.order_by(Submission.mural_y.asc(), Submission.mural_x.asc())
        .offset(offset)
        .limit(min(limit, 2000))
        .all()
    )
    columns, grid_rows = mural_service.grid_size(total)
    return MuralOut(
        columns=columns,
        rows=grid_rows,
        tile_count=total,
        tiles=[
            MuralTile(
                submission_id=s.id,
                x=s.mural_x,
                y=s.mural_y,
                thumbnail_url=storage.public_url(s.thumbnail_path),
                username=u.username,
                dominant_color=s.dominant_color,
                total_score=s.total_score,
                submitted_at=s.submitted_at,
            )
            for s, u in rows
        ],
    )
