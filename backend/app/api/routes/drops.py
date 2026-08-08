from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, status

from app.api.deps import CurrentUser, DbSession, OptionalUser
from app.models import Drop, DropStatus, Submission
from app.schemas import DropOut
from app.services.drop_scheduler import activate_drop, as_utc, ensure_pending_drop
from app.services.events import manager

router = APIRouter(tags=["drops"])


def _to_drop_out(db: DbSession, drop: Drop, user_id: int | None) -> DropOut:
    expires_at = as_utc(drop.expires_at)
    remaining = None
    if drop.status == DropStatus.ACTIVE and expires_at:
        remaining = max(0.0, (expires_at - datetime.now(timezone.utc)).total_seconds())

    submitted = False
    if user_id is not None:
        submitted = (
            db.query(Submission.id)
            .filter(Submission.drop_id == drop.id, Submission.user_id == user_id)
            .first()
            is not None
        )

    return DropOut(
        id=drop.id,
        status=drop.status,
        scheduled_for=drop.scheduled_for,
        started_at=drop.started_at,
        expires_at=drop.expires_at,
        seconds_remaining=remaining,
        has_submitted=submitted,
    )


@router.get("/drops/current", response_model=DropOut)
def current_drop(db: DbSession, user: OptionalUser) -> DropOut:
    """The live drop if one is open, otherwise the next pending one.

    Public: the clock is the same for everyone, signed in or not. `has_submitted`
    is only meaningful for a signed-in caller and reads false otherwise.
    """
    drop = (
        db.query(Drop)
        .filter(Drop.status == DropStatus.ACTIVE)
        .order_by(Drop.started_at.desc())
        .first()
    )
    if drop is None:
        drop = ensure_pending_drop(db)
        db.commit()
    return _to_drop_out(db, drop, user.id if user else None)


@router.get("/drops", response_model=list[DropOut])
def list_drops(db: DbSession, user: OptionalUser, limit: int = 20) -> list[DropOut]:
    drops = (
        db.query(Drop).order_by(Drop.scheduled_for.desc()).limit(min(limit, 100)).all()
    )
    return [_to_drop_out(db, d, user.id if user else None) for d in drops]


@router.post("/drops/trigger", response_model=DropOut)
async def trigger_drop(db: DbSession, user: CurrentUser) -> DropOut:
    """Fire the drop right now. For demos — and for chaotic people."""
    live = db.query(Drop).filter(Drop.status == DropStatus.ACTIVE).first()
    if live:
        raise HTTPException(status.HTTP_409_CONFLICT, "A drop is already live")

    drop = ensure_pending_drop(db)
    activate_drop(db, drop)
    db.commit()
    db.refresh(drop)

    await manager.broadcast(
        {
            "type": "drop.started",
            "drop_id": drop.id,
            "expires_at": as_utc(drop.expires_at).isoformat(),
            "triggered_by": user.username,
        }
    )
    return _to_drop_out(db, drop, user.id)


@router.post("/drops/reset", response_model=DropOut)
async def reset_drop(db: DbSession, user: CurrentUser) -> DropOut:
    """Close the live drop and fire a fresh one immediately. Demo tool.

    A new drop id resets the one-submission-per-person rule, so everyone can
    shoot again right away. Elo is settled per submission, so closing early
    loses nothing.
    """
    closed_ids = []
    for live in db.query(Drop).filter(Drop.status == DropStatus.ACTIVE).all():
        live.status = DropStatus.CLOSED
        closed_ids.append(live.id)

    drop = ensure_pending_drop(db)
    activate_drop(db, drop)
    db.commit()
    db.refresh(drop)

    for drop_id in closed_ids:
        await manager.broadcast({"type": "drop.closed", "drop_id": drop_id})
    await manager.broadcast(
        {
            "type": "drop.started",
            "drop_id": drop.id,
            "expires_at": as_utc(drop.expires_at).isoformat(),
            "triggered_by": user.username,
        }
    )
    return _to_drop_out(db, drop, user.id)


@router.websocket("/ws/drops")
async def drop_socket(websocket: WebSocket) -> None:
    """Live feed: drop.started, drop.closed, submission.created. One global room."""
    await manager.connect(websocket)
    try:
        await websocket.send_json({"type": "connected"})
        while True:
            await websocket.receive_text()  # client heartbeats; we ignore the content
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(websocket)
