from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, DbSession
from app.models import User
from app.schemas import UserCreate, UserOut

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


@router.get("/me", response_model=UserOut)
def read_me(user: CurrentUser) -> User:
    return user


@router.get("/by-username/{username}", response_model=UserOut)
def read_by_username(username: str, db: DbSession) -> User:
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such user")
    return user
