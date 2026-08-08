"""Turns a verified grass photo + a response time into points."""

QUALITY_WEIGHT = 0.6
SPEED_WEIGHT = 0.4
MAX_POINTS = 100.0

# Full speed credit inside this many seconds, zero credit once the window closes.
INSTANT_SECONDS = 120.0


def speed_score(response_seconds: float, window_seconds: float) -> float:
    """100 for a sub-2-minute response, decaying linearly to 0 at the deadline."""
    if response_seconds <= INSTANT_SECONDS:
        return MAX_POINTS
    if response_seconds >= window_seconds:
        return 0.0
    span = window_seconds - INSTANT_SECONDS
    remaining = window_seconds - response_seconds
    return round(MAX_POINTS * (remaining / span), 2)


def total_score(quality: float, speed: float, streak: int = 0) -> float:
    base = QUALITY_WEIGHT * quality + SPEED_WEIGHT * speed
    multiplier = 1.0 + min(streak, 10) * 0.05  # up to +50% for a 10-drop streak
    return round(base * multiplier, 2)
