from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException, Path, status
from sqlalchemy.orm import Session

from app.auth import TokenError, verify_token
from app.database import get_db
from app.models import Group, Membership, User

DbSession = Annotated[Session, Depends(get_db)]

AuthHeader = Annotated[str | None, Header(alias="Authorization")]


def _claims_from(authorization: str | None) -> dict[str, Any]:
    """Verifies the Bearer token and returns its claims, or 401s."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to do that")
    try:
        return verify_token(authorization[7:].strip())
    except TokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc


def token_claims(authorization: AuthHeader = None) -> dict[str, Any]:
    """The verified Supabase claims alone — for routes that run before a user
    row exists, i.e. /users/link."""
    return _claims_from(authorization)


TokenClaims = Annotated[dict[str, Any], Depends(token_claims)]


def current_user(db: DbSession, authorization: AuthHeader = None) -> User:
    """The user row behind a verified Supabase token.

    The token's `sub` is the Supabase uuid stored at link time; a valid token
    for an account that never linked still 401s, pointing at /users/link.
    """
    claims = _claims_from(authorization)
    user = db.query(User).filter(User.supabase_uid == claims["sub"]).first()
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not linked yet")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def optional_user(db: DbSession, authorization: AuthHeader = None) -> User | None:
    """Same as `current_user`, but signed-out callers get None instead of a 401.

    The drop clock and the global leaderboard are public — you can watch without
    an account, you just can't submit. A header that's present but *invalid*
    still 401s: silently downgrading a broken token to "signed out" would bury
    real auth bugs.
    """
    if not authorization:
        return None
    claims = _claims_from(authorization)
    return db.query(User).filter(User.supabase_uid == claims["sub"]).first()


OptionalUser = Annotated[User | None, Depends(optional_user)]


def group_membership(
    db: DbSession,
    user: CurrentUser,
    group_id: Annotated[int, Path()],
) -> Membership:
    membership = (
        db.query(Membership)
        .filter(Membership.group_id == group_id, Membership.user_id == user.id)
        .first()
    )
    if membership is None:
        if db.get(Group, group_id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Group not found")
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You are not in this group")
    return membership


GroupMembership = Annotated[Membership, Depends(group_membership)]
