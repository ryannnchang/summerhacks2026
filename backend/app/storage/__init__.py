"""Submission photo storage: Supabase Storage when configured, local disk otherwise.

With SUPABASE_SERVICE_ROLE_KEY set, images upload to a public bucket and the db
stores their full public URLs — they survive redeploys and every environment
sees the same photos. Without a key (fresh clones, the test suite), files land
under `upload_dir` and are served from `/uploads` by the StaticFiles mount.

`public_url` tells the two apart by shape: absolute URLs pass through, relative
paths get the `/uploads/` prefix. A Supabase outage mid-upload falls back to
local disk with a warning rather than failing the submission.
"""

import logging
import uuid
from io import BytesIO
from pathlib import Path

import httpx
from PIL import Image

from app.config import settings

logger = logging.getLogger(__name__)

SUBMISSIONS = "submissions"
THUMB_SIZE = (400, 400)
FULL_MAX_SIZE = (1600, 1600)

# Checked once per process; the bucket is created on first use if missing.
_bucket_ready = False


def _supabase_enabled() -> bool:
    return bool(settings.supabase_url and settings.supabase_service_key)


def _headers() -> dict[str, str]:
    key = settings.supabase_service_key or ""
    return {"Authorization": f"Bearer {key}", "apikey": key}


def _ensure_bucket() -> None:
    global _bucket_ready
    if _bucket_ready:
        return
    base = f"{settings.supabase_url}/storage/v1/bucket"
    bucket = settings.supabase_storage_bucket
    if httpx.get(f"{base}/{bucket}", headers=_headers(), timeout=10).status_code != 200:
        created = httpx.post(
            base,
            headers=_headers(),
            json={"id": bucket, "name": bucket, "public": True},
            timeout=10,
        )
        if created.status_code not in (200, 201, 409):  # 409: raced another create
            created.raise_for_status()
    _bucket_ready = True


def _upload(relative_path: str, data: bytes) -> str:
    """Puts one JPEG in the bucket and returns its public URL."""
    _ensure_bucket()
    response = httpx.post(
        f"{settings.supabase_url}/storage/v1/object/"
        f"{settings.supabase_storage_bucket}/{relative_path}",
        headers={**_headers(), "Content-Type": "image/jpeg", "x-upsert": "true"},
        content=data,
        timeout=30,
    )
    response.raise_for_status()
    return (
        f"{settings.supabase_url}/storage/v1/object/public/"
        f"{settings.supabase_storage_bucket}/{relative_path}"
    )


def _encode_jpeg(image: Image.Image, quality: int) -> bytes:
    buf = BytesIO()
    image.save(buf, "JPEG", quality=quality, optimize=True)
    return buf.getvalue()


def _ensure_dirs() -> None:
    (settings.upload_dir / SUBMISSIONS).mkdir(parents=True, exist_ok=True)


def save_image(image: Image.Image) -> tuple[str, str]:
    """Stores a full-size JPEG and a square thumbnail.

    Returns the pair of paths to persist on the Submission row: full public
    URLs when Supabase Storage took them, upload_dir-relative paths otherwise.
    """
    key = uuid.uuid4().hex
    rgb = image.convert("RGB")

    full = rgb.copy()
    full.thumbnail(FULL_MAX_SIZE)
    full_rel = f"{SUBMISSIONS}/{key}.jpg"
    full_bytes = _encode_jpeg(full, quality=88)

    thumb = _center_crop_square(rgb)
    thumb.thumbnail(THUMB_SIZE)
    thumb_rel = f"{SUBMISSIONS}/{key}_thumb.jpg"
    thumb_bytes = _encode_jpeg(thumb, quality=82)

    if _supabase_enabled():
        try:
            return _upload(full_rel, full_bytes), _upload(thumb_rel, thumb_bytes)
        except Exception:
            logger.warning("Supabase Storage upload failed; saving locally", exc_info=True)

    _ensure_dirs()
    (settings.upload_dir / full_rel).write_bytes(full_bytes)
    (settings.upload_dir / thumb_rel).write_bytes(thumb_bytes)
    return full_rel, thumb_rel


def _center_crop_square(image: Image.Image) -> Image.Image:
    w, h = image.size
    side = min(w, h)
    left, top = (w - side) // 2, (h - side) // 2
    return image.crop((left, top, left + side, top + side))


def public_url(stored_path: str) -> str:
    # Supabase rows store absolute URLs; local rows store upload_dir-relative paths.
    if stored_path.startswith(("http://", "https://")):
        return stored_path
    return f"/uploads/{stored_path}"


def delete(stored_path: str) -> None:
    marker = "/storage/v1/object/public/"
    if marker in stored_path:
        bucket_and_key = stored_path.split(marker, 1)[1]
        httpx.request(
            "DELETE",
            f"{settings.supabase_url}/storage/v1/object/{bucket_and_key}",
            headers=_headers(),
            timeout=10,
        )
        return
    Path(settings.upload_dir / stored_path).unlink(missing_ok=True)
