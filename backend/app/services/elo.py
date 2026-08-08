"""Elo ratings, adjusted per submission.

`total_score` is absolute and only ever goes up — it rewards showing up. Elo
can fall: a submission scoring above PAR_SCORE raises the rating, one below
lowers it, scaled by how far from par it landed. A rejected photo counts as a
score of 0 and takes the full penalty.

The adjustment happens in the submission route, in the same transaction as the
score, so the leaderboard (ranked by `players.elo`) is current the moment the
player sees their result.
"""

BASE_RATING = 1200
K_FACTOR = 32

# The break-even score: above it elo rises, below it elo falls.
PAR_SCORE = 50.0


def adjust(rating: int, score: float) -> int:
    """New rating after one submission.

    A perfect 100 gains the full K_FACTOR, a 0 loses it, and PAR_SCORE exactly
    changes nothing. Scores past 100 (streak multiplier) still cap at +K.
    """
    margin = (min(score, 100.0) - PAR_SCORE) / (100.0 - PAR_SCORE)  # -1..1
    return round(rating + K_FACTOR * margin)
