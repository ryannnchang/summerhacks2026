from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Touch Grass"
    database_url: str = f"sqlite:///{BASE_DIR / 'grass.db'}"

    upload_dir: Path = BASE_DIR / "uploads"
    max_upload_bytes: int = 10 * 1024 * 1024

    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # Drops
    drop_window_seconds: int = 15 * 60  # how long a drop stays open
    drop_min_gap_seconds: int = 60 * 60  # earliest next drop after one closes
    drop_max_gap_seconds: int = 6 * 60 * 60  # latest next drop

    # Grass verification thresholds (local CV heuristic)
    min_grass_coverage: float = 0.25  # fraction of green pixels to count as grass
    min_texture_score: float = 0.05  # rejects flat green walls / screens

    # Gemini vision judging. With a key set, Gemini is the judge and the CV
    # heuristic becomes the fallback; without one, the heuristic judges alone.
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    gemini_timeout_seconds: float = 25.0

    # Mural
    mural_columns: int = 24

    # Map — the app opens here. Downtown Toronto.
    map_center_lat: float = 43.6532
    map_center_lng: float = -79.3832
    map_zoom: int = 12


settings = Settings()
