from fastapi import APIRouter, HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, DbSession, TokenClaims
from app.models import Group, Membership, Player, User
from app.schemas import FriendAdd, UserCreate, UserLink, UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


def _with_elo(db: DbSession, user: User) -> UserOut:
    """UserOut plus the elo from the linked players row, when there is one."""
    out = UserOut.model_validate(user)
    if user.supabase_uid and (player := db.get(Player, user.supabase_uid)):
        out.elo = player.elo
    return out


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
def link_supabase_user(payload: UserLink, claims: TokenClaims, db: DbSession) -> User:
    """Finds or creates the backend account behind a Google sign-in.

    Identity comes from the verified token, never the body — before this, the
    endpoint took any uuid on faith, which let one caller claim another's
    account. The body still carries the *cosmetics* (username, display name).

    Idempotent, and the only place a `players` row is created — which means the
    leaderboard works whether or not the `on_auth_user_created` trigger is
    installed in Supabase.
    """
    supabase_uid: str = claims["sub"]
    if payload.supabase_uid and payload.supabase_uid != supabase_uid:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "That is not your account")

    user = db.query(User).filter(User.supabase_uid == supabase_uid).first()

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
        user.supabase_uid = supabase_uid
        # Google's name seeds the display name for a brand-new account only.
        # Re-running link on every sign-in must NOT clobber a name the player
        # chose in their profile — that made renames silently revert.
        if payload.display_name:
            user.display_name = payload.display_name
    # The token's email claim wins — it's Google-verified, the body is not.
    email = claims.get("email") or payload.email
    if email:
        user.email = email.strip().lower()

    player = db.get(Player, supabase_uid)
    if player is None:
        player = Player(id=supabase_uid, username=user.username)
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
def read_me(user: CurrentUser, db: DbSession) -> UserOut:
    return _with_elo(db, user)


@router.patch("/me", response_model=UserOut)
def update_me(payload: UserUpdate, user: CurrentUser, db: DbSession) -> UserOut:
    """Renames the account. The players row mirrors it so the leaderboard follows."""
    if payload.username and payload.username != user.username:
        if db.query(User).filter(User.username == payload.username).first():
            raise HTTPException(status.HTTP_409_CONFLICT, "Username is taken")
        user.username = payload.username
        # A chosen handle becomes the shown name too — the leaderboard renders
        # display_name, and a rename that doesn't show up there reads as a bug.
        # An explicit display_name in the same request still wins below.
        user.display_name = payload.username
    if payload.display_name:
        user.display_name = payload.display_name

    if user.supabase_uid:
        player = db.get(Player, user.supabase_uid)
        if player is not None:
            player.username = user.username
            player.display_name = user.display_name

    db.commit()
    db.refresh(user)
    return _with_elo(db, user)


@router.post("/friends", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def add_friend(payload: FriendAdd, user: CurrentUser, db: DbSession) -> UserOut:
    """Befriends another player by their Google email.

    "Friends" means sharing a group, so this drops them into a group the caller
    owns — created on the spot if they own none. Idempotent: already-friends is
    a success, not an error.
    """
    from app.api.routes.groups import _make_join_code  # avoid a circular import

    email = payload.email.strip().lower()
    friend = db.query(User).filter(User.email == email).first()
    if friend is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "No player with that email yet — they need to sign in once first.",
        )
    if friend.id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That's your own email.")

    group = db.query(Group).filter(Group.owner_id == user.id).first()
    if group is None:
        group = Group(
            name=f"{user.display_name or user.username}'s crew",
            join_code=_make_join_code(db),
            owner_id=user.id,
        )
        db.add(group)
        db.flush()
        db.add(Membership(user_id=user.id, group_id=group.id))

    already = (
        db.query(Membership)
        .filter(Membership.group_id == group.id, Membership.user_id == friend.id)
        .first()
    )
    if already is None:
        db.add(Membership(user_id=friend.id, group_id=group.id))
    db.commit()

    return _with_elo(db, friend)


@router.get("/by-username/{username}", response_model=UserOut)
def read_by_username(username: str, db: DbSession) -> User:
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such user")
    return user
