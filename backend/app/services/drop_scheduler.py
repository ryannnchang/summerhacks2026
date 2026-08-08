"""Background loop that opens and closes the global grass drop.

There is exactly one PENDING drop queued at any time, for everyone. When its
scheduled moment arrives it flips to ACTIVE, every connected client gets a
WebSocket ping, and the next one is queued for a random time inside the next
available daytime window.
"""

import asyncio
import logging
import random
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import Drop, DropStatus, Player, Submission, User
from app.services.elo import BASE_RATING, Contender, rate_drop
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


def next_drop_time(now: datetime | None = None) -> datetime:
    """A random moment inside the next available daytime window.

    The whole drop has to finish inside the window, so the latest possible start is
    `drop_latest_hour` minus the window length — a 30-minute drop with an 8-to-20
    window starts no later than 19:30 local. If today's window has already passed,
    this rolls forward to the next day.
    """
    tz = ZoneInfo(settings.drop_timezone)
    local_now = (now or _utcnow()).astimezone(tz)

    day = local_now.date()
    for _ in range(8):  # bounded so a bad config can't spin forever
        opens = datetime.combine(day, time(settings.drop_earliest_hour), tzinfo=tz)
        closes = datetime.combine(day, time(settings.drop_latest_hour), tzinfo=tz)
        latest_start = closes - timedelta(seconds=settings.drop_window_seconds)

        earliest_start = max(opens, local_now)
        if latest_start > earliest_start:
            span = (latest_start - earliest_start).total_seconds()
            chosen = earliest_start + timedelta(seconds=random.uniform(0, span))
            return chosen.astimezone(timezone.utc)

        day += timedelta(days=1)

    raise RuntimeError(
        f"No usable drop window: {settings.drop_earliest_hour}:00-{settings.drop_latest_hour}:00 "
        f"is shorter than drop_window_seconds ({settings.drop_window_seconds}s)"
    )


def schedule_next_drop(db: Session, *, immediate: bool = False) -> Drop:
    """Queues the next pending drop. `immediate` is for demos."""
    scheduled_for = _utcnow() + timedelta(seconds=5) if immediate else next_drop_time()
    drop = Drop(status=DropStatus.PENDING, scheduled_for=scheduled_for)
    db.add(drop)
    db.flush()
    return drop


def ensure_pending_drop(db: Session) -> Drop:
    existing = db.query(Drop).filter(Drop.status == DropStatus.PENDING).first()
    return existing or schedule_next_drop(db)


def activate_drop(db: Session, drop: Drop) -> None:
    now = _utcnow()
    drop.status = DropStatus.ACTIVE
    drop.started_at = now
    drop.expires_at = now + timedelta(seconds=settings.drop_window_seconds)


def settle_ratings(db: Session, drop_id: int) -> dict[str, int]:
    """Recomputes elo for everyone who entered `drop_id`, and writes it to players.

    Only players linked to a Supabase account can be rated, since `players` is
    keyed by that uuid — an unlinked user still scores points, just no rating.
    """
    rows = (
        db.query(Submission, User)
        .join(User, User.id == Submission.user_id)
        .filter(Submission.drop_id == drop_id, User.supabase_uid.isnot(None))
        .all()
    )
    if len(rows) < 2:
        return {}

    players = {
        p.id: p
        for p in db.query(Player).filter(Player.id.in_([u.supabase_uid for _, u in rows])).all()
    }

    contenders = [
        Contender(
            key=user.supabase_uid,
            # A rejected photo scored nothing, so it loses to every verified one.
            score=submission.total_score,
            rating=players[user.supabase_uid].elo
            if user.supabase_uid in players
            else BASE_RATING,
        )
        for submission, user in rows
        if user.supabase_uid in players
    ]

    ratings = rate_drop(contenders)
    for uid, rating in ratings.items():
        players[uid].elo = rating
    return ratings


async def _process_due_drops(db: Session) -> list[dict]:
    """Flips due drops and returns the payloads to broadcast."""
    now = _utcnow()
    messages: list[dict] = []

    pending = (
        db.query(Drop).filter(Drop.status == DropStatus.PENDING, Drop.scheduled_for <= now).all()
    )
    for drop in pending:
        activate_drop(db, drop)
        messages.append(
            {
                "type": "drop.started",
                "drop_id": drop.id,
                "expires_at": drop.expires_at.isoformat(),
                "window_seconds": settings.drop_window_seconds,
            }
        )

    for drop in db.query(Drop).filter(Drop.status == DropStatus.ACTIVE).all():
        expires_at = as_utc(drop.expires_at)
        if expires_at and expires_at <= now:
            drop.status = DropStatus.CLOSED
            # Ratings can only be settled once the field is final, so this happens
            # at close rather than per submission.
            settle_ratings(db, drop.id)
            messages.append({"type": "drop.closed", "drop_id": drop.id})

    ensure_pending_drop(db)
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
            for payload in messages:
                await manager.broadcast(payload)
        except Exception:
            logger.exception("drop scheduler tick failed")

        try:
            await asyncio.wait_for(stop.wait(), timeout=TICK_SECONDS)
        except asyncio.TimeoutError:
            pass
    logger.info("drop scheduler stopped")
