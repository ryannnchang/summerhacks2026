"""Elo ratings, computed per drop.

`total_score` is absolute and only ever goes up — it rewards showing up. Elo is
relative and zero-sum: your rating rises only when someone else's falls. They
answer different questions, so both are kept and the board ranks by elo.

A drop is the match. Everyone who submitted is ranked by that submission's score,
and each player is scored against every other as a pairwise game.
"""

from dataclasses import dataclass

BASE_RATING = 1200
K_FACTOR = 32


@dataclass(frozen=True)
class Contender:
    """One player's showing in a drop. `score` is the submission's total_score."""

    key: str
    score: float
    rating: int


def expected(rating: float, opponent_rating: float) -> float:
    """Probability `rating` beats `opponent_rating`, the standard Elo curve."""
    return 1 / (1 + 10 ** ((opponent_rating - rating) / 400))


def rate_drop(contenders: list[Contender]) -> dict[str, int]:
    """New ratings for everyone in one drop, keyed the same way they came in.

    A rejected photo counts as a score of 0, so it loses to every verified one.
    Returns an empty mapping for a drop with fewer than two entrants — there is
    nobody to have beaten, and Elo has nothing to say about a solo performance.
    """
    if len(contenders) < 2:
        return {}

    updated: dict[str, int] = {}
    for player in contenders:
        delta = 0.0
        for other in contenders:
            if other.key == player.key:
                continue
            if player.score > other.score:
                actual = 1.0
            elif player.score < other.score:
                actual = 0.0
            else:
                actual = 0.5
            delta += actual - expected(player.rating, other.rating)

        # Averaged over opponents faced, so a 20-player drop can't swing a rating
        # ten times harder than a 3-player one.
        updated[player.key] = round(player.rating + K_FACTOR * delta / (len(contenders) - 1))

    return updated
