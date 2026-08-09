from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- users ---
class UserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=32, pattern=r"^[a-zA-Z0-9_.-]+$")
    display_name: str | None = Field(default=None, max_length=64)


class UserLink(BaseModel):
    """Claims the backend account behind a Supabase (Google) identity.

    Identity itself comes from the verified token; `supabase_uid` here is
    optional and only cross-checked against it.
    """

    supabase_uid: str | None = Field(default=None, min_length=8, max_length=36)
    username: str = Field(min_length=2, max_length=32, pattern=r"^[a-zA-Z0-9_.-]+$")
    display_name: str | None = Field(default=None, max_length=64)
    email: str | None = Field(default=None, max_length=255)


class FriendAdd(BaseModel):
    email: str = Field(min_length=3, max_length=255)


class UserUpdate(BaseModel):
    """Profile edits. Only the fields present change."""

    username: str | None = Field(
        default=None, min_length=2, max_length=32, pattern=r"^[a-zA-Z0-9_.-]+$"
    )
    display_name: str | None = Field(default=None, max_length=64)


class UserOut(ORMModel):
    id: int
    username: str
    display_name: str
    created_at: datetime
    total_score: float = 0.0
    streak: int = 0
    # From the linked players row; None for accounts without a Supabase link.
    elo: int | None = None


# --- groups ---
class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class GroupJoin(BaseModel):
    join_code: str = Field(min_length=4, max_length=8)


class MemberOut(ORMModel):
    user_id: int
    username: str
    display_name: str
    total_score: float
    streak: int


class GroupOut(ORMModel):
    id: int
    name: str
    join_code: str
    owner_id: int
    created_at: datetime
    member_count: int = 0


class GroupDetail(GroupOut):
    members: list[MemberOut] = []


# --- drops ---
class DropOut(ORMModel):
    id: int
    status: str
    scheduled_for: datetime
    started_at: datetime | None
    expires_at: datetime | None
    seconds_remaining: float | None = None
    has_submitted: bool = False


# --- submissions ---
class SubmissionOut(ORMModel):
    id: int
    user_id: int
    drop_id: int
    status: str
    reject_reason: str | None
    grass_coverage: float
    texture_score: float
    quality_score: float
    speed_score: float
    total_score: float
    response_seconds: float
    submitted_at: datetime
    image_url: str
    thumbnail_url: str
    username: str | None = None

    # Gemini judge extras; null when the CV heuristic judged.
    lushness: float | None = None
    biodiversity: float | None = None
    palette: list[str] | None = None
    features: list[str] | None = None
    verdict_source: str | None = None
    glyph_svg: str | None = None

    # Rating change from this submission. Only set on the upload response for a
    # Supabase-linked account; null on listings, where it isn't tracked.
    elo_delta: int | None = None


class LeaderboardEntry(BaseModel):
    rank: int
    username: str
    display_name: str
    elo: int
    total_score: float
    streak: int
    submissions: int


# --- mural ---
class MuralTile(BaseModel):
    submission_id: int
    x: int
    y: int
    thumbnail_url: str
    username: str
    dominant_color: str | None
    total_score: float
    submitted_at: datetime


class MuralOut(BaseModel):
    columns: int
    rows: int
    tile_count: int
    tiles: list[MuralTile]


# --- map ---
class MapPatch(BaseModel):
    submission_id: int
    latitude: float
    longitude: float
    thumbnail_url: str
    username: str
    total_score: float
    quality_score: float
    submitted_at: datetime
    glyph_svg: str | None = None
    # Rejections are mapped too, as dead tufts.
    status: str = "verified"
    reject_reason: str | None = None


class MapOut(BaseModel):
    center: tuple[float, float]
    patch_count: int
    patches: list[MapPatch]
