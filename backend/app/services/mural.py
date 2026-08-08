"""Placement logic for the shared grass mural.

Every verified submission becomes one tile. Tiles fill a fixed-width grid in
submission order, so the mural grows row by row as the world touches grass.
"""

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Submission, SubmissionStatus


def next_position(db: Session) -> tuple[int, int]:
    placed = (
        db.query(func.count(Submission.id))
        .filter(Submission.mural_x.isnot(None))
        .scalar()
        or 0
    )
    return placed % settings.mural_columns, placed // settings.mural_columns


def place(db: Session, submission: Submission) -> None:
    if submission.status != SubmissionStatus.VERIFIED:
        return
    submission.mural_x, submission.mural_y = next_position(db)


def grid_size(tile_count: int) -> tuple[int, int]:
    columns = settings.mural_columns
    rows = max(1, -(-tile_count // columns))  # ceil
    return columns, rows
