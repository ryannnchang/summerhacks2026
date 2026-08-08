from fastapi import APIRouter, HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, DbSession
from app.models import Player, User
from app.schemas import UserCreate, UserLink, UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: DbSession) -> User:
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Username is taken")
    user = User(
        username=payload.username,
        display_name=payload.display_name or payload.username,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/link", response_model=UserOut)
def link_supabase_user(payload: UserLink, db: DbSession) -> User:
    """Finds or creates the backend account behind a Google sign-in.

    Idempotent, and the only place a `players` row is created — which means the
    leaderboard works whether or not the `on_auth_user_created` trigger is
    installed in Supabase.
    """
    user = db.query(User).filter(User.supabase_uid == payload.supabase_uid).first()

    if user is None:
        # An account may already exist from before Google auth; adopt it rather
        # than colliding on the unique username.
        user = db.query(User).filter(User.username == payload.username).first()
        if user is None:
            user = User(
                username=payload.username,
                display_name=payload.display_name or payload.username,
            )
            db.add(user)
        user.supabase_uid = payload.supabase_uid

    if payload.display_name:
        user.display_name = payload.display_name

    player = db.get(Player, payload.supabase_uid)
    if player is None:
        player = Player(id=payload.supabase_uid, username=user.username)
        db.add(player)
    player.display_name = user.display_name
    player.username = user.username

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # players.id is a foreign key to auth.users, so a uuid that never signed
        # in through Supabase is rejected here rather than silently ranked.
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "That Supabase account does not exist",
        ) from exc

    db.refresh(user)
    return user


@router.get("/me", response_model=UserOut)
def read_me(user: CurrentUser) -> User:
    return user


@router.get("/by-username/{username}", response_model=UserOut)
def read_by_username(username: str, db: DbSession) -> User:
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such user")
    return user
