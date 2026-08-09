"""Point the test suite at its own database and upload directory.

The fixtures call `drop_all`, so anything this resolves to gets destroyed. That has
already cost a development database once and a Supabase schema once, so this does
three things: sets a throwaway sqlite path, clears SUPABASE_DB_URL (whose validator
in config.py otherwise wins over DATABASE_URL), and hard-fails if the resolved URL
somehow still isn't sqlite.

pytest imports conftest before any test module, which is early enough: `Settings`
reads the environment when it is instantiated, on the first `import app.config`.
"""

import os
import tempfile
from pathlib import Path

_TEST_DIR = Path(tempfile.gettempdir()) / "touch-grass-tests"
_TEST_DIR.mkdir(parents=True, exist_ok=True)

os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DIR / 'grass-test.db'}"
os.environ["UPLOAD_DIR"] = str(_TEST_DIR / "uploads")
# config.Settings prefers this over DATABASE_URL when it is set, and a developer
# .env will have it set. Clearing it keeps the suite off the real database.
os.environ["SUPABASE_DB_URL"] = ""
# Likewise keep test uploads on local disk, off the real storage bucket.
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""
os.environ["SUPABASE_SERVICE_KEY"] = ""

# Switch token verification to HS256 with a known secret, so tests can mint
# their own JWTs instead of needing a live Supabase project's signing keys.
TEST_JWT_SECRET = "test-only-jwt-secret-0123456789abcdef"  # 32+ bytes, per RFC 7518
os.environ["SUPABASE_JWT_SECRET"] = TEST_JWT_SECRET

from app.config import settings  # noqa: E402  (must come after the env is set)

if not settings.database_url.startswith("sqlite"):
    raise RuntimeError(
        "Refusing to run: tests call drop_all and would destroy "
        f"{settings.database_url.split('@')[-1]}"
    )
