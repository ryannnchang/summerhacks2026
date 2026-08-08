import secrets
import string

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func

from app.api.deps import CurrentUser, DbSession, GroupMembership
from app.models import Group, Membership, User
from app.schemas import (
    GroupCreate,
    GroupDetail,
    GroupJoin,
    GroupOut,
    MemberOut,
)

router = APIRouter(prefix="/groups", tags=["groups"])

CODE_ALPHABET = string.ascii_uppercase + string.digits


def _make_join_code(db: DbSession) -> str:
    for _ in range(10):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        if not db.query(Group).filter(Group.join_code == code).first():
            return code
    raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not mint a join code")


def _to_group_out(db: DbSession, group: Group) -> GroupOut:
    count = db.query(func.count(Membership.id)).filter(Membership.group_id == group.id).scalar()
    return GroupOut(
        id=group.id,
        name=group.name,
        join_code=group.join_code,
        owner_id=group.owner_id,
        created_at=group.created_at,
        member_count=count or 0,
    )


@router.post("", response_model=GroupOut, status_code=status.HTTP_201_CREATED)
def create_group(payload: GroupCreate, db: DbSession, user: CurrentUser) -> GroupOut:
    group = Group(name=payload.name, join_code=_make_join_code(db), owner_id=user.id)
    db.add(group)
    db.flush()
    db.add(Membership(user_id=user.id, group_id=group.id))
    db.commit()
    db.refresh(group)
    return _to_group_out(db, group)


@router.get("", response_model=list[GroupOut])
def list_my_groups(db: DbSession, user: CurrentUser) -> list[GroupOut]:
    groups = (
        db.query(Group)
        .join(Membership, Membership.group_id == Group.id)
        .filter(Membership.user_id == user.id)
        .all()
    )
    return [_to_group_out(db, g) for g in groups]


@router.post("/join", response_model=GroupOut)
def join_group(payload: GroupJoin, db: DbSession, user: CurrentUser) -> GroupOut:
    group = db.query(Group).filter(Group.join_code == payload.join_code.upper()).first()
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No group with that code")
    already = (
        db.query(Membership)
        .filter(Membership.group_id == group.id, Membership.user_id == user.id)
        .first()
    )
    if not already:
        db.add(Membership(user_id=user.id, group_id=group.id))
        db.commit()
    return _to_group_out(db, group)


@router.get("/{group_id}", response_model=GroupDetail)
def read_group(group_id: int, db: DbSession, membership: GroupMembership) -> GroupDetail:
    group = db.get(Group, group_id)
    rows = (
        db.query(Membership, User)
        .join(User, User.id == Membership.user_id)
        .filter(Membership.group_id == group_id)
        .order_by(User.username.asc())
        .all()
    )
    base = _to_group_out(db, group)
    return GroupDetail(
        **base.model_dump(),
        members=[
            MemberOut(
                user_id=u.id,
                username=u.username,
                display_name=u.display_name,
                total_score=u.total_score,
                streak=u.streak,
            )
            for m, u in rows
        ],
    )


@router.post("/{group_id}/members/{username}", response_model=MemberOut, status_code=201)
def add_member(
    group_id: int, username: str, db: DbSession, membership: GroupMembership
) -> MemberOut:
    """Any member can pull a friend in by username."""
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such user")

    existing = (
        db.query(Membership)
        .filter(Membership.group_id == group_id, Membership.user_id == user.id)
        .first()
    )
    if existing is None:
        existing = Membership(user_id=user.id, group_id=group_id)
        db.add(existing)
        db.commit()
        db.refresh(existing)

    return MemberOut(
        user_id=user.id,
        username=user.username,
        display_name=user.display_name,
        total_score=user.total_score,
        streak=user.streak,
    )


@router.delete("/{group_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    group_id: int, user_id: int, db: DbSession, user: CurrentUser, membership: GroupMembership
) -> None:
    group = db.get(Group, group_id)
    if user.id != group.owner_id and user.id != user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner can remove other members")
    if user_id == group.owner_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The owner cannot leave their own group")

    target = (
        db.query(Membership)
        .filter(Membership.group_id == group_id, Membership.user_id == user_id)
        .first()
    )
    if target:
        db.delete(target)
        db.commit()
