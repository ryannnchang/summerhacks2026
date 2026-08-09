import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes import (
    drops,
    groups,
    leaderboard,
    map as map_routes,
    mural,
    submissions,
    users,
)
from app.config import settings
from app.database import init_db
from app.services.drop_scheduler import scheduler_loop

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)

    stop = asyncio.Event()
    task = asyncio.create_task(scheduler_loop(stop))
    try:
        yield
    finally:
        stop.set()
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

settings.upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

app.include_router(users.router, prefix="/api")
app.include_router(groups.router, prefix="/api")
app.include_router(drops.router, prefix="/api")
app.include_router(submissions.router, prefix="/api")
app.include_router(leaderboard.router, prefix="/api")
app.include_router(mural.router, prefix="/api")
app.include_router(map_routes.router, prefix="/api")


@app.get("/api/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok", "app": settings.app_name}


class _SPAStaticFiles(StaticFiles):
    """Serves the built frontend, falling back to index.html for client routes.

    A hard refresh on /profile or /map must return the app shell, not a 404 —
    the React router owns those paths. The standard SPA tradeoff applies: a
    genuinely missing asset path also gets index.html rather than a 404.
    """

    async def get_response(self, path: str, scope):  # type: ignore[override]
        try:
            response = await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            # Starlette *raises* missing-file 404s rather than returning them.
            if exc.status_code != 404:
                raise
            return await super().get_response("index.html", scope)
        if response.status_code == 404:
            response = await super().get_response("index.html", scope)
        return response


# In production the Vite bundle is baked into the image at /app/static and this
# mount makes the whole app same-origin — /api and /uploads are matched first,
# everything else is the SPA. In dev the directory doesn't exist (Vite serves
# the frontend on :5173) and the mount is skipped.
_STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
if _STATIC_DIR.is_dir():
    app.mount("/", _SPAStaticFiles(directory=_STATIC_DIR, html=True), name="spa")
