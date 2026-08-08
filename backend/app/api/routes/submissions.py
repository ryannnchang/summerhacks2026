import json
from datetime import datetime, timezone

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from PIL import UnidentifiedImageError

from app import storage
from app.api.deps import CurrentUser, DbSession
from app.config import settings
from app.models import Drop, DropStatus, Player, Submission, SubmissionStatus, User
from app.schemas import SubmissionOut
from app.services import glyphs
from app.services import mural as mural_service
from app.services.drop_scheduler import as_utc
from app.services.events import manager
from app.services.grass_verifier import verify_grass
from app.services.scoring import speed_score, total_score

router = APIRouter(tags=["submissions"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}


def _to_out(submission: Submission, username: str | None = None) -> SubmissionOut:
    extras: dict = json.loads(submission.features_json) if submission.features_json else {}
    return SubmissionOut(
        id=submission.id,
        user_id=submission.user_id,
        drop_id=submission.drop_id,
        status=submission.status,
        reject_reason=submission.reject_reason,
        grass_coverage=submission.grass_coverage,
        texture_score=submission.texture_score,
        quality_score=submission.quality_score,
        speed_score=submission.speed_score,
        total_score=submission.total_score,
        response_seconds=submission.response_seconds,
        submitted_at=submission.submitted_at,
        image_url=storage.public_url(submission.image_path),
        thumbnail_url=storage.public_url(submission.thumbnail_path),
        username=username,
        lushness=submission.lushness,
        biodiversity=submission.biodiversity,
        palette=extras.get("palette"),
        features=extras.get("features"),
        verdict_source=submission.verdict_source,
        glyph_svg=submission.glyph_svg,
    )


@router.post(
    "/drops/{drop_id}/submissions",
    response_model=SubmissionOut,
    status_code=status.HTTP_201_CREATED,
)
async def submit_grass(
    drop_id: int,
    db: DbSession,
    user: CurrentUser,
    photo: UploadFile = File(...),
    latitude: float | None = Form(None, ge=-90, le=90),
    longitude: float | None = Form(None, ge=-180, le=180),
) -> SubmissionOut:
    """Drops are global, so no group membership is required — just an account."""
    drop = db.get(Drop, drop_id)
    if drop is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Drop not found")
    if drop.status != DropStatus.ACTIVE:
        raise HTTPException(status.HTTP_409_CONFLICT, "That drop is not open")

    already = (
        db.query(Submission)
        .filter(Submission.drop_id == drop_id, Submission.user_id == user.id)
        .first()
    )
    if already:
        raise HTTPException(status.HTTP_409_CONFLICT, "You already submitted for this drop")

    if photo.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, f"Unsupported image type: {photo.content_type}"
        )

    raw = await photo.read()
    if len(raw) > settings.max_upload_bytes:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "That photo is too large")

    try:
        # Threadpool because the Gemini judge is a blocking network round trip —
        # on the event loop it would stall the drop scheduler and every WebSocket.
        verdict, image = await run_in_threadpool(verify_grass, raw)
    except UnidentifiedImageError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That file is not a readable image")

    image_path, thumb_path = storage.save_image(image)

    started_at = as_utc(drop.started_at) or as_utc(drop.scheduled_for)
    now = datetime.now(timezone.utc)
    elapsed = max(0.0, (now - started_at).total_seconds())

    submission = Submission(
        user_id=user.id,
        drop_id=drop_id,
        image_path=image_path,
        thumbnail_path=thumb_path,
        grass_coverage=verdict.coverage,
        texture_score=verdict.texture,
        quality_score=verdict.quality,
        response_seconds=round(elapsed, 2),
        dominant_color=verdict.dominant_color,
        latitude=latitude,
        longitude=longitude,
        lushness=verdict.lushness,
        biodiversity=verdict.biodiversity,
        features_json=(
            json.dumps({"palette": verdict.palette, "features": verdict.features})
            if verdict.palette or verdict.features
            else None
        ),
        verdict_source=verdict.source,
        submitted_at=now,
    )

    if verdict.is_grass:
        submission.status = SubmissionStatus.VERIFIED
        submission.speed_score = speed_score(elapsed, settings.drop_window_seconds)
        # Score and streak live on the player now, not on a group membership.
        submission.total_score = total_score(verdict.quality, submission.speed_score, user.streak)
        user.total_score += submission.total_score
        user.streak += 1
        db.add(submission)
        db.flush()  # assigns the id, which seeds the glyph
        submission.glyph_svg = glyphs.for_submission(submission)
        mural_service.place(db, submission)
    else:
        submission.status = SubmissionStatus.REJECTED
        submission.reject_reason = verdict.reason
        user.streak = 0
        db.add(submission)

    # Mirror onto the leaderboard row in the same transaction, so the two can't
    # drift. Elo is settled separately when the drop closes and the field is known.
    if user.supabase_uid:
        player = db.get(Player, user.supabase_uid)
        if player is not None:
            player.total_score = user.total_score
            player.streak = user.streak
            player.updated_at = now

    db.commit()
    db.refresh(submission)

    if submission.status == SubmissionStatus.VERIFIED:
        await manager.broadcast(
            {
                "type": "submission.created",
                "submission_id": submission.id,
                "username": user.username,
                "total_score": submission.total_score,
                "thumbnail_url": storage.public_url(submission.thumbnail_path),
            }
        )

    return _to_out(submission, user.username)


@router.get("/drops/{drop_id}/submissions", response_model=list[SubmissionOut])
def list_drop_submissions(drop_id: int, db: DbSession) -> list[SubmissionOut]:
    """Public — the feed for a drop is part of watching the game."""
    if db.get(Drop, drop_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Drop not found")
    rows = (
        db.query(Submission, User)
        .join(User, User.id == Submission.user_id)
        .filter(Submission.drop_id == drop_id)
        .order_by(Submission.total_score.desc())
        .all()
    )
    return [_to_out(s, u.username) for s, u in rows]


@router.get("/users/me/submissions", response_model=list[SubmissionOut])
def my_submissions(db: DbSession, user: CurrentUser, limit: int = 50) -> list[SubmissionOut]:
    rows = (
        db.query(Submission)
        .filter(Submission.user_id == user.id)
        .order_by(Submission.submitted_at.desc())
        .limit(min(limit, 200))
        .all()
    )
    return [_to_out(s, user.username) for s in rows]
