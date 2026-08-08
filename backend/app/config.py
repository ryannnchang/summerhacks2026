from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    # Absolute paths, because a relative ".env" resolves against the working
    # directory — which is backend/ under dev.sh, so the repo-root file was
    # silently ignored. Root wins, so one file can configure both halves.
    model_config = SettingsConfigDict(
        env_file=(BASE_DIR / ".env", BASE_DIR.parent / ".env"),
        extra="ignore",
    )

    app_name: str = "Touch Grass"

    # SQLite is the fallback for a clone with no credentials. Set SUPABASE_DB_URL
    # and everything — users, drops, submissions, players — lives in Supabase.
    database_url: str = f"sqlite:///{BASE_DIR / 'grass.db'}"
    supabase_db_url: str | None = None

    upload_dir: Path = BASE_DIR / "uploads"
    max_upload_bytes: int = 10 * 1024 * 1024

    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # Drops — one global drop per day, at a random time inside a daytime window.
    drop_window_seconds: int = 30 * 60  # how long a drop stays open
    drop_earliest_hour: int = 8  # no drop starts before 08:00 local
    drop_latest_hour: int = 20  # and every drop has closed by 20:00 local
    drop_timezone: str = "America/Toronto"  # whose 8-to-8 we mean

    # Grass verification thresholds (local CV heuristic)
    min_grass_coverage: float = 0.25  # fraction of green pixels to count as grass
    min_texture_score: float = 0.05  # rejects flat green walls / screens

    # Gemini vision judging. With a key set, Gemini is the judge and the CV
    # heuristic becomes the fallback; without one, the heuristic judges alone.
    gemini_api_key: str | None = None
    # "-latest" alias tracks the current flash model; pinned names age out for
    # new API keys (gemini-2.5-flash already 404s on keys minted today).
    gemini_model: str = "gemini-flash-latest"
    gemini_timeout_seconds: float = 25.0

    # Mural
    mural_columns: int = 24

    # Map — the app opens here. Downtown Toronto.
    map_center_lat: float = 43.6532
    map_center_lng: float = -79.3832
    map_zoom: int = 12


    @model_validator(mode="after")
    def _prefer_supabase(self) -> "Settings":
        # Empty string counts as unset — tests clear it to stay on sqlite.
        if self.supabase_db_url:
            self.database_url = self.supabase_db_url
        return self


settings = Settings()
