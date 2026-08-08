"""Background loop that opens and closes grass drops.

Every group always has exactly one PENDING drop queued. When its scheduled time
arrives the drop flips to ACTIVE, everyone in the group gets a WebSocket ping,
and a fresh PENDING drop is queued at a random future time.
"""

import asyncio
import logging
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import Drop, DropStatus, Group
from app.services.events import manager

logger = logging.getLogger(__name__)
TICK_SECONDS = 5


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(dt: datetime | None) -> datetime | None:
    """SQLite hands back naive datetimes; treat them as UTC."""
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def schedule_next_drop(db: Session, group_id: int, *, immediate: bool = False) -> Drop:
    """Queues the next pending drop for a group. `immediate` is for demos."""
    delay = 5 if immediate else random.randint(
        settings.drop_min_gap_seconds, settings.drop_max_gap_seconds
    )
    drop = Drop(
        group_id=group_id,
        status=DropStatus.PENDING,
        scheduled_for=_utcnow() + timedelta(seconds=delay),
    )
    db.add(drop)
    db.flush()
    return drop


def ensure_pending_drop(db: Session, group_id: int) -> Drop:
    existing = (
        db.query(Drop)
        .filter(Drop.group_id == group_id, Drop.status == DropStatus.PENDING)
        .first()
    )
    return existing or schedule_next_drop(db, group_id)


def activate_drop(db: Session, drop: Drop) -> None:
    now = _utcnow()
    drop.status = DropStatus.ACTIVE
    drop.started_at = now
    drop.expires_at = now + timedelta(seconds=settings.drop_window_seconds)


async def _process_due_drops(db: Session) -> list[tuple[int, dict]]:
    """Flips due drops and returns (group_id, payload) messages to broadcast."""
    now = _utcnow()
    messages: list[tuple[int, dict]] = []

    pending = (
        db.query(Drop)
        .filter(Drop.status == DropStatus.PENDING, Drop.scheduled_for <= now)
        .all()
    )
    for drop in pending:
        activate_drop(db, drop)
        messages.append(
            (
                drop.group_id,
                {
                    "type": "drop.started",
                    "drop_id": drop.id,
                    "expires_at": drop.expires_at.isoformat(),
                    "window_seconds": settings.drop_window_seconds,
                },
            )
        )

    active = db.query(Drop).filter(Drop.status == DropStatus.ACTIVE).all()
    for drop in active:
        expires_at = as_utc(drop.expires_at)
        if expires_at and expires_at <= now:
            drop.status = DropStatus.CLOSED
            messages.append((drop.group_id, {"type": "drop.closed", "drop_id": drop.id}))
            schedule_next_drop(db, drop.group_id)

    # Backfill: any group missing a pending drop gets one.
    for (group_id,) in db.query(Group.id).all():
        ensure_pending_drop(db, group_id)

    db.commit()
    return messages


async def scheduler_loop(stop: asyncio.Event) -> None:
    logger.info("drop scheduler started")
    while not stop.is_set():
        try:
            db = SessionLocal()
            try:
                messages = await _process_due_drops(db)
            finally:
                db.close()
            for group_id, payload in messages:
                await manager.broadcast(group_id, payload)
        except Exception:
            logger.exception("drop scheduler tick failed")

        try:
            await asyncio.wait_for(stop.wait(), timeout=TICK_SECONDS)
        except asyncio.TimeoutError:
            pass
    logger.info("drop scheduler stopped")
