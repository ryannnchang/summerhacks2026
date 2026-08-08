from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
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

    memberships: Mapped[list["Membership"]] = relationship(back_populates="user")
    submissions: Mapped[list["Submission"]] = relationship(back_populates="user")


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
    drops: Mapped[list["Drop"]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "group_id", name="uq_user_group"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"))
    total_score: Mapped[float] = mapped_column(Float, default=0.0)
    streak: Mapped[int] = mapped_column(Integer, default=0)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship(back_populates="memberships")
    group: Mapped[Group] = relationship(back_populates="memberships")


class Drop(Base):
    """A surprise 'go touch grass NOW' window for one group."""

    __tablename__ = "drops"

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"), index=True)
    status: Mapped[str] = mapped_column(String(16), default=DropStatus.PENDING)
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    group: Mapped[Group] = relationship(back_populates="drops")
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

    user: Mapped[User] = relationship(back_populates="submissions")
    drop: Mapped[Drop] = relationship(back_populates="submissions")
