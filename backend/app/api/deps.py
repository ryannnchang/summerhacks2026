from typing import Annotated

from fastapi import Depends, Header, HTTPException, Path, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Group, Membership, User

DbSession = Annotated[Session, Depends(get_db)]


def current_user(
    db: DbSession,
    x_user_id: Annotated[int | None, Header(alias="X-User-Id")] = None,
) -> User:
    """Hackathon-grade auth: the client just says who it is.

    Replace with real session tokens before this touches the open internet.
    """
    if x_user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing X-User-Id header")
    user = db.get(User, x_user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown user")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def optional_user(
    db: DbSession,
    x_user_id: Annotated[int | None, Header(alias="X-User-Id")] = None,
) -> User | None:
    """Same as `current_user`, but signed-out callers get None instead of a 401.

    The drop clock and the global leaderboard are public — you can watch without
    an account, you just can't submit.
    """
    if x_user_id is None:
        return None
    return db.get(User, x_user_id)


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
