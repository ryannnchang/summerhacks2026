from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class DropStatus(str, Enum):
    PENDING = "pending"  # scheduled, not announced yet
    ACTIVE = "active"  # window is open, go touch grass
    CLOSED = "closed"


class SubmissionStatus(str, Enum):
    VERIFIED = "verified"
    REJECTED = "rejected"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # Score lives on the player, not on a membership: drops are global, so someone
    # with no group still competes. Global and Friends are the same numbers, the
    # second filtered to people you share a group with.
    total_score: Mapped[float] = mapped_column(Float, default=0.0)
    streak: Mapped[int] = mapped_column(Integer, default=0)

    # Links this row to public.players, which is keyed by the Supabase auth uuid.
    # Nullable because a user can be created without going through Google.
    # Uuid(as_uuid=False) renders a native uuid on Postgres — which players.id
    # must be, since it has a foreign key to auth.users — while handing Python
    # plain strings on both dialects. Mixing uuid and varchar here silently broke
    # every lookup that joined the two.
    supabase_uid: Mapped[str | None] = mapped_column(
        Uuid(as_uuid=False), unique=True, index=True, nullable=True
    )

    memberships: Mapped[list["Membership"]] = relationship(back_populates="user")
    submissions: Mapped[list["Submission"]] = relationship(back_populates="user")


class Player(Base):
    """The public leaderboard row, keyed by the Supabase auth uuid.

    This table already exists in Supabase (`public.players`, with a foreign key to
    `auth.users` and its own RLS policies), so `create_all` leaves it alone. It is
    mapped here so FastAPI can write scores into it inside the same transaction as
    the submission — which is what keeps it from drifting out of sync.
    """

    __tablename__ = "players"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    display_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    total_score: Mapped[float] = mapped_column(Float, default=0.0)
    elo: Mapped[int] = mapped_column(Integer, default=1200)
    streak: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    join_code: Mapped[str] = mapped_column(String(8), unique=True, index=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    memberships: Mapped[list["Membership"]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "group_id", name="uq_user_group"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"))
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship(back_populates="memberships")
    group: Mapped[Group] = relationship(back_populates="memberships")


class Drop(Base):
    """A surprise 'go touch grass NOW' window. One at a time, for everyone."""

    __tablename__ = "drops"

    id: Mapped[int] = mapped_column(primary_key=True)
    status: Mapped[str] = mapped_column(String(16), default=DropStatus.PENDING, index=True)
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    submissions: Mapped[list["Submission"]] = relationship(
        back_populates="drop", cascade="all, delete-orphan"
    )


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (UniqueConstraint("user_id", "drop_id", name="uq_user_drop"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    drop_id: Mapped[int] = mapped_column(ForeignKey("drops.id"), index=True)

    image_path: Mapped[str] = mapped_column(String(255))
    thumbnail_path: Mapped[str] = mapped_column(String(255))

    status: Mapped[str] = mapped_column(String(16))
    reject_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    grass_coverage: Mapped[float] = mapped_column(Float, default=0.0)
    texture_score: Mapped[float] = mapped_column(Float, default=0.0)
    quality_score: Mapped[float] = mapped_column(Float, default=0.0)
    speed_score: Mapped[float] = mapped_column(Float, default=0.0)
    total_score: Mapped[float] = mapped_column(Float, default=0.0)

    response_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # position on the shared mural grid
    mural_x: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mural_y: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dominant_color: Mapped[str | None] = mapped_column(String(7), nullable=True)

    # Where the grass was. Optional — the browser may refuse to share location.
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Gemini judge extras. Null when the CV heuristic judged (no key / fallback).
    # features_json holds {"palette": [...], "features": [...]} for the glyphs.
    lushness: Mapped[float | None] = mapped_column(Float, nullable=True)
    biodiversity: Mapped[float | None] = mapped_column(Float, nullable=True)
    features_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    verdict_source: Mapped[str | None] = mapped_column(String(16), nullable=True)

    # Procedural SVG drawn from the judge's signals; the map renders this as
    # the marker. Generated at submit time, backfilled lazily by the map route.
    glyph_svg: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped[User] = relationship(back_populates="submissions")
    drop: Mapped[Drop] = relationship(back_populates="submissions")
