from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func

from app.api.deps import DbSession, OptionalUser
from app.models import Membership, Player, Submission, SubmissionStatus, User
from app.schemas import LeaderboardEntry

router = APIRouter(tags=["leaderboard"])


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
def leaderboard(
    db: DbSession,
    user: OptionalUser,
    scope: Literal["global", "friends"] = Query("global"),
    limit: int = Query(100, le=500),
) -> list[LeaderboardEntry]:
    """The `players` table, ranked by elo.

    `scope` only changes who is included — everyone, or the people you share a
    group with. Group membership lives on the app's integer user ids, so the
    friends filter joins through `users.supabase_uid`.
    """
    counts = dict(
        db.query(User.supabase_uid, func.count(Submission.id))
        .join(Submission, Submission.user_id == User.id)
        .filter(Submission.status == SubmissionStatus.VERIFIED, User.supabase_uid.isnot(None))
        .group_by(User.supabase_uid)
        .all()
    )

    query = db.query(Player)

    if scope == "friends":
        if user is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to see your friends")
        my_groups = db.query(Membership.group_id).filter(Membership.user_id == user.id).subquery()
        friend_uids = (
            db.query(User.supabase_uid)
            .join(Membership, Membership.user_id == User.id)
            .filter(
                Membership.group_id.in_(db.query(my_groups.c.group_id)),
                User.supabase_uid.isnot(None),
            )
            .subquery()
        )
        query = query.filter(Player.id.in_(db.query(friend_uids.c.supabase_uid)))

    rows = (
        query.order_by(Player.elo.desc(), Player.total_score.desc(), Player.username.asc())
        .limit(limit)
        .all()
    )

    return [
        LeaderboardEntry(
            rank=i,
            username=p.username,
            display_name=p.display_name or p.username,
            elo=p.elo,
            total_score=round(p.total_score, 2),
            streak=p.streak,
            submissions=counts.get(p.id, 0),
        )
        for i, p in enumerate(rows, start=1)
    ]
