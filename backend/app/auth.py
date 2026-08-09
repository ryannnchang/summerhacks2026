"""Supabase JWT verification — the auth seam, for real this time.

The browser sends the access token Supabase minted at Google sign-in as
`Authorization: Bearer <jwt>`. This project signs tokens with an ES256 key
whose public half is served from its JWKS endpoint, so verification needs no
shared secret: PyJWKClient fetches and caches the key, and a forged or expired
token fails signature/exp checks locally.

`SUPABASE_JWT_SECRET` switches verification to HS256. That exists for the test
suite (which mints its own tokens) and would also serve a legacy project still
on symmetric signing.

The verified `sub` claim is the Supabase account uuid — the same value stored
on `users.supabase_uid` at link time, which is how a token becomes a row.
"""

import logging
import ssl
from typing import Any

import certifi
import jwt
from jwt import PyJWKClient

from app.config import settings

logger = logging.getLogger(__name__)


class TokenError(Exception):
    """Verification failed. The message is safe to show the caller."""


_jwks_client: PyJWKClient | None = None


def _jwks() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        if not settings.supabase_url:
            raise TokenError("Server has no Supabase project configured")
        _jwks_client = PyJWKClient(
            f"{settings.supabase_url}/auth/v1/.well-known/jwks.json",
            cache_keys=True,
            lifespan=3600,
            # PyJWKClient fetches with urllib, which on a stock macOS Python has
            # no CA certificates and fails every HTTPS fetch — taking all logins
            # down with it. certifi is the same CA bundle httpx already uses.
            ssl_context=ssl.create_default_context(cafile=certifi.where()),
        )
    return _jwks_client


def verify_token(token: str) -> dict[str, Any]:
    """Returns the verified claims, or raises TokenError."""
    try:
        if settings.supabase_jwt_secret:
            return jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
        signing_key = _jwks().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("Session expired — sign in again") from exc
    except jwt.PyJWTError as exc:
        # Covers bad signatures, malformed tokens, wrong audience, and JWKS
        # fetch failures. Logged with detail, reported without.
        logger.warning("Token rejected: %s", exc)
        raise TokenError("Invalid session token") from exc
