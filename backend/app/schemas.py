from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- users ---
class UserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=32, pattern=r"^[a-zA-Z0-9_.-]+$")
    display_name: str | None = Field(default=None, max_length=64)


class UserOut(ORMModel):
    id: int
    username: str
    display_name: str
    created_at: datetime


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
    group_id: int
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


class LeaderboardEntry(BaseModel):
    rank: int
    user_id: int
    username: str
    display_name: str
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


class MapOut(BaseModel):
    center: tuple[float, float]
    patch_count: int
    patches: list[MapPatch]
