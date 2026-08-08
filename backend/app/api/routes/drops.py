from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, status

from app.api.deps import CurrentUser, DbSession, GroupMembership
from app.models import Drop, DropStatus, Submission
from app.schemas import DropOut
from app.services.drop_scheduler import activate_drop, as_utc, ensure_pending_drop
from app.services.events import manager

router = APIRouter(tags=["drops"])


def _to_drop_out(db: DbSession, drop: Drop, user_id: int) -> DropOut:
    expires_at = as_utc(drop.expires_at)
    remaining = None
    if drop.status == DropStatus.ACTIVE and expires_at:
        remaining = max(0.0, (expires_at - datetime.now(timezone.utc)).total_seconds())
    submitted = (
        db.query(Submission.id)
        .filter(Submission.drop_id == drop.id, Submission.user_id == user_id)
        .first()
        is not None
    )
    return DropOut(
        id=drop.id,
        group_id=drop.group_id,
        status=drop.status,
        scheduled_for=drop.scheduled_for,
        started_at=drop.started_at,
        expires_at=drop.expires_at,
        seconds_remaining=remaining,
        has_submitted=submitted,
    )


@router.get("/groups/{group_id}/drops/current", response_model=DropOut | None)
def current_drop(group_id: int, db: DbSession, membership: GroupMembership) -> DropOut | None:
    """The live drop if one is open, otherwise the next pending one."""
    drop = (
        db.query(Drop)
        .filter(Drop.group_id == group_id, Drop.status == DropStatus.ACTIVE)
        .order_by(Drop.started_at.desc())
        .first()
    )
    if drop is None:
        drop = ensure_pending_drop(db, group_id)
        db.commit()
    return _to_drop_out(db, drop, membership.user_id)


@router.get("/groups/{group_id}/drops", response_model=list[DropOut])
def list_drops(
    group_id: int, db: DbSession, membership: GroupMembership, limit: int = 20
) -> list[DropOut]:
    drops = (
        db.query(Drop)
        .filter(Drop.group_id == group_id)
        .order_by(Drop.scheduled_for.desc())
        .limit(min(limit, 100))
        .all()
    )
    return [_to_drop_out(db, d, membership.user_id) for d in drops]


@router.post("/groups/{group_id}/drops/trigger", response_model=DropOut)
async def trigger_drop(
    group_id: int, db: DbSession, user: CurrentUser, membership: GroupMembership
) -> DropOut:
    """Fire a drop right now. For demos — and for chaotic group owners."""
    live = (
        db.query(Drop)
        .filter(Drop.group_id == group_id, Drop.status == DropStatus.ACTIVE)
        .first()
    )
    if live:
        raise HTTPException(status.HTTP_409_CONFLICT, "A drop is already live")

    drop = ensure_pending_drop(db, group_id)
    activate_drop(db, drop)
    db.commit()
    db.refresh(drop)

    await manager.broadcast(
        group_id,
        {
            "type": "drop.started",
            "drop_id": drop.id,
            "expires_at": as_utc(drop.expires_at).isoformat(),
            "triggered_by": user.username,
        },
    )
    return _to_drop_out(db, drop, user.id)


@router.websocket("/ws/groups/{group_id}")
async def group_socket(websocket: WebSocket, group_id: int) -> None:
    """Live feed: drop.started, drop.closed, submission.created."""
    await manager.connect(group_id, websocket)
    try:
        await websocket.send_json({"type": "connected", "group_id": group_id})
        while True:
            await websocket.receive_text()  # client heartbeats; we ignore the content
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(group_id, websocket)
