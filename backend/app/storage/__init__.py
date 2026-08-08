"""Local-disk image storage. Swap for S3/R2 by reimplementing `save_image`."""

import uuid
from pathlib import Path

from PIL import Image

from app.config import settings

SUBMISSIONS = "submissions"
THUMB_SIZE = (400, 400)
FULL_MAX_SIZE = (1600, 1600)


def _ensure_dirs() -> None:
    (settings.upload_dir / SUBMISSIONS).mkdir(parents=True, exist_ok=True)


def save_image(image: Image.Image) -> tuple[str, str]:
    """Writes a full-size JPEG and a square thumbnail. Returns relative paths."""
    _ensure_dirs()
    key = uuid.uuid4().hex
    rgb = image.convert("RGB")

    full = rgb.copy()
    full.thumbnail(FULL_MAX_SIZE)
    full_rel = f"{SUBMISSIONS}/{key}.jpg"
    full.save(settings.upload_dir / full_rel, "JPEG", quality=88, optimize=True)

    thumb = _center_crop_square(rgb)
    thumb.thumbnail(THUMB_SIZE)
    thumb_rel = f"{SUBMISSIONS}/{key}_thumb.jpg"
    thumb.save(settings.upload_dir / thumb_rel, "JPEG", quality=82, optimize=True)

    return full_rel, thumb_rel


def _center_crop_square(image: Image.Image) -> Image.Image:
    w, h = image.size
    side = min(w, h)
    left, top = (w - side) // 2, (h - side) // 2
    return image.crop((left, top, left + side, top + side))


def public_url(relative_path: str) -> str:
    return f"/uploads/{relative_path}"


def delete(relative_path: str) -> None:
    Path(settings.upload_dir / relative_path).unlink(missing_ok=True)
