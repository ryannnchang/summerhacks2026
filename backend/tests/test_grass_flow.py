"""End-to-end smoke test: user -> drop -> submission -> mural.

Drops are global, so no group is needed to play. Groups only scope the
"friends" view of the leaderboard.
"""

import random
import uuid
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import settings
from app.database import Base, engine
from app.main import app


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def force_heuristic_judge(monkeypatch):
    """Keep tests offline and deterministic even when a real key is in .env."""
    monkeypatch.setattr(settings, "gemini_api_key", None)


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _image_bytes(image: Image.Image) -> bytes:
    buf = BytesIO()
    image.save(buf, "JPEG", quality=90)
    return buf.getvalue()


def fake_grass(size: int = 320) -> bytes:
    """Noisy green — passes coverage and texture."""
    rng = random.Random(7)
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            px[x, y] = (
                rng.randint(20, 70),
                rng.randint(90, 190),
                rng.randint(15, 60),
            )
    return _image_bytes(img)


def flat_green() -> bytes:
    """A green wall — right hue, no texture. Should be rejected."""
    return _image_bytes(Image.new("RGB", (320, 320), (60, 140, 50)))


def not_grass() -> bytes:
    return _image_bytes(Image.new("RGB", (320, 320), (180, 90, 200)))


def make_user(client, username):
    """Mirrors the real flow: Google sign-in -> /users/link -> a players row.

    The leaderboard reads `players`, so an account created without linking has no
    row there and never appears on the board.
    """
    uid = f"{uuid.uuid5(uuid.NAMESPACE_DNS, username)}"
    r = client.post(
        "/api/users/link",
        json={"supabase_uid": uid, "username": username, "display_name": username},
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_full_grass_loop(client):
    uid = make_user(client, "ryan")
    headers = {"X-User-Id": str(uid)}

    r = client.post("/api/groups", json={"name": "CS Grass Enjoyers"}, headers=headers)
    assert r.status_code == 201, r.text
    group = r.json()
    assert group["member_count"] == 1

    friend = make_user(client, "sam")
    r = client.post(f"/api/groups/{group['id']}/members/sam", headers=headers)
    assert r.status_code == 201, r.text

    r = client.post("/api/drops/trigger", headers=headers)
    assert r.status_code == 200, r.text
    drop = r.json()
    assert drop["status"] == "active"

    url = f"/api/drops/{drop['id']}/submissions"
    r = client.post(url, headers=headers, files={"photo": ("g.jpg", fake_grass(), "image/jpeg")})
    assert r.status_code == 201, r.text
    sub = r.json()
    assert sub["status"] == "verified", sub
    assert sub["total_score"] > 0
    assert sub["speed_score"] == 100.0  # submitted instantly

    # one submission per person per drop
    r = client.post(url, headers=headers, files={"photo": ("g.jpg", fake_grass(), "image/jpeg")})
    assert r.status_code == 409

    r = client.get("/api/leaderboard?scope=friends", headers=headers)
    board = r.json()
    assert board[0]["username"] == "ryan"
    assert board[0]["submissions"] == 1

    r = client.get("/api/mural")
    mural = r.json()
    assert mural["tile_count"] == 1
    assert mural["tiles"][0]["x"] == 0 and mural["tiles"][0]["y"] == 0


def test_rejects_non_grass(client):
    uid = make_user(client, "impostor")
    headers = {"X-User-Id": str(uid)}
    group = client.post("/api/groups", json={"name": "g"}, headers=headers).json()
    drop = client.post("/api/drops/trigger", headers=headers).json()
    url = f"/api/drops/{drop['id']}/submissions"

    r = client.post(url, headers=headers, files={"photo": ("x.jpg", not_grass(), "image/jpeg")})
    assert r.status_code == 201
    assert r.json()["status"] == "rejected"
    assert "green" in r.json()["reject_reason"]

    assert client.get("/api/mural").json()["tile_count"] == 0


def test_rejects_flat_green_screen(client):
    uid = make_user(client, "cheater")
    headers = {"X-User-Id": str(uid)}
    group = client.post("/api/groups", json={"name": "g"}, headers=headers).json()
    drop = client.post("/api/drops/trigger", headers=headers).json()
    url = f"/api/drops/{drop['id']}/submissions"

    r = client.post(url, headers=headers, files={"photo": ("x.jpg", flat_green(), "image/jpeg")})
    assert r.json()["status"] == "rejected"
    assert "flat" in r.json()["reject_reason"]


def test_requires_membership(client):
    owner = make_user(client, "owner")
    outsider = make_user(client, "outsider")
    group = client.post(
        "/api/groups", json={"name": "private"}, headers={"X-User-Id": str(owner)}
    ).json()

    r = client.get(f"/api/groups/{group['id']}", headers={"X-User-Id": str(outsider)})
    assert r.status_code == 403

    r = client.post(
        "/api/groups/join",
        json={"join_code": group["join_code"]},
        headers={"X-User-Id": str(outsider)},
    )
    assert r.status_code == 200
    r = client.get(f"/api/groups/{group['id']}", headers={"X-User-Id": str(outsider)})
    assert r.status_code == 200
    assert len(r.json()["members"]) == 2


def test_auth_required(client):
    assert client.get("/api/users/me").status_code == 401
    assert client.get("/api/users/me", headers={"X-User-Id": "999"}).status_code == 401


def test_map_patches_only_include_geolocated_grass(client):
    uid = make_user(client, "mapper")
    headers = {"X-User-Id": str(uid)}
    group = client.post("/api/groups", json={"name": "geo"}, headers=headers).json()
    drop = client.post("/api/drops/trigger", headers=headers).json()
    url = f"/api/drops/{drop['id']}/submissions"

    # Trinity Bellwoods, roughly.
    r = client.post(
        url,
        headers=headers,
        files={"photo": ("g.jpg", fake_grass(), "image/jpeg")},
        data={"latitude": "43.6465", "longitude": "-79.4130"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "verified"

    body = client.get("/api/map/patches").json()
    assert body["center"] == [43.6532, -79.3832]  # Toronto
    assert body["patch_count"] == 1
    patch = body["patches"][0]
    assert (patch["latitude"], patch["longitude"]) == (43.6465, -79.4130)
    assert patch["username"] == "mapper"


def test_map_skips_submissions_without_coordinates(client):
    uid = make_user(client, "nogps")
    headers = {"X-User-Id": str(uid)}
    group = client.post("/api/groups", json={"name": "nogeo"}, headers=headers).json()
    drop = client.post("/api/drops/trigger", headers=headers).json()
    client.post(
        f"/api/drops/{drop['id']}/submissions",
        headers=headers,
        files={"photo": ("g.jpg", fake_grass(), "image/jpeg")},
    )
    # Still counts for score and mural, just not on the map.
    assert client.get("/api/mural").json()["tile_count"] == 1
    assert client.get("/api/map/patches").json()["patch_count"] == 0


# --- Gemini verdict mapping (pure logic, no network) ---


def _base_result():
    from app.services.grass_verifier import GrassResult

    return GrassResult(
        is_grass=True,
        coverage=0.5,
        texture=0.12,
        vibrance=0.4,
        quality=70.0,
        reason=None,
        dominant_color="#2d5a27",
    )


def test_gemini_verdict_overlays_heuristic():
    from app.services.gemini_judge import GeminiVerdict
    from app.services.grass_verifier import merge_gemini

    verdict = GeminiVerdict(
        authentic=True,
        is_grass=True,
        rejection_reason=None,
        coverage=80,
        lushness=90,
        biodiversity=40,
        palette=["#2D5A27", "not-a-color", "#6b9955"],
        features=["Clover", "  ", "moss"],
    )
    merged = merge_gemini(_base_result(), verdict)

    assert merged.is_grass and merged.reason is None
    assert merged.source == "gemini"
    assert merged.quality == round(0.45 * 90 + 0.35 * 40 + 0.20 * 80, 2)
    assert merged.palette == ["#2d5a27", "#6b9955"]  # invalid hex dropped, lowered
    assert merged.features == ["clover", "moss"]
    # local pixel signals survive the overlay
    assert merged.coverage == 0.5 and merged.dominant_color == "#2d5a27"


def test_gemini_inauthentic_rejects_even_if_grassy():
    from app.services.gemini_judge import GeminiVerdict
    from app.services.grass_verifier import merge_gemini

    verdict = GeminiVerdict(
        authentic=False,  # a screen showing a lawn
        is_grass=True,
        rejection_reason="That's a screen. Go outside.",
        coverage=90,
        lushness=95,
        biodiversity=50,
    )
    merged = merge_gemini(_base_result(), verdict)

    assert not merged.is_grass
    assert merged.quality == 0.0
    assert merged.reason == "That's a screen. Go outside."


def test_gemini_rejection_gets_default_reason():
    from app.services.gemini_judge import GeminiVerdict
    from app.services.grass_verifier import merge_gemini

    verdict = GeminiVerdict(
        authentic=True, is_grass=False, coverage=5, lushness=0, biodiversity=0
    )
    merged = merge_gemini(_base_result(), verdict)

    assert not merged.is_grass
    assert merged.reason  # never None on a rejection


# --- glyphs ---


def test_glyph_is_deterministic_valid_svg():
    from xml.etree import ElementTree

    from app.services.glyphs import make_glyph

    kwargs = dict(
        palette=["#2d5a27", "#4a7c3c"],
        features=["clover", "dandelion", "moss"],
        lushness=80,
        biodiversity=70,
    )
    a = make_glyph(seed=7, **kwargs)
    assert a == make_glyph(seed=7, **kwargs)  # same seed, same tuft
    assert a != make_glyph(seed=8, **kwargs)  # different submission, different tuft

    ElementTree.fromstring(a)  # well-formed XML
    assert a.startswith("<svg") and "<path" in a
    # tags actually grow flora
    bare = make_glyph(seed=7, palette=["#2d5a27"], features=[], lushness=30, biodiversity=10)
    assert a.count("<circle") > bare.count("<circle")


def test_submission_grows_a_glyph(client):
    uid = make_user(client, "gardener")
    headers = {"X-User-Id": str(uid)}
    drop = client.post("/api/drops/trigger", headers=headers).json()

    r = client.post(
        f"/api/drops/{drop['id']}/submissions",
        headers=headers,
        files={"photo": ("g.jpg", fake_grass(), "image/jpeg")},
        data={"latitude": "43.65", "longitude": "-79.38"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "verified"
    assert body["glyph_svg"] and body["glyph_svg"].startswith("<svg")

    patch = client.get("/api/map/patches").json()["patches"][0]
    assert patch["glyph_svg"] == body["glyph_svg"]


def test_map_backfills_missing_glyphs(client):
    from app.database import SessionLocal
    from app.models import Submission

    uid = make_user(client, "legacy")
    headers = {"X-User-Id": str(uid)}
    drop = client.post("/api/drops/trigger", headers=headers).json()
    client.post(
        f"/api/drops/{drop['id']}/submissions",
        headers=headers,
        files={"photo": ("g.jpg", fake_grass(), "image/jpeg")},
        data={"latitude": "43.65", "longitude": "-79.38"},
    )

    # Simulate a row from before glyphs existed.
    with SessionLocal() as db:
        db.query(Submission).update({Submission.glyph_svg: None})
        db.commit()

    patch = client.get("/api/map/patches").json()["patches"][0]
    assert patch["glyph_svg"] and patch["glyph_svg"].startswith("<svg")
def test_plays_without_a_group(client):
    """The headline change: drops are global, so no group is required to score."""
    uid = make_user(client, "loner")
    headers = {"X-User-Id": str(uid)}

    drop = client.post("/api/drops/trigger", headers=headers).json()
    assert drop["status"] == "active"

    r = client.post(
        f"/api/drops/{drop['id']}/submissions",
        headers=headers,
        files={"photo": ("g.jpg", fake_grass(), "image/jpeg")},
    )
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "verified"

    board = client.get("/api/leaderboard").json()
    assert [e["username"] for e in board] == ["loner"]
    assert board[0]["total_score"] > 0


def test_drop_clock_and_global_board_are_public(client):
    make_user(client, "somebody")

    r = client.get("/api/drops/current")
    assert r.status_code == 200
    assert r.json()["has_submitted"] is False

    assert client.get("/api/leaderboard").status_code == 200
    # Friends is the one view that needs to know who you are.
    assert client.get("/api/leaderboard?scope=friends").status_code == 401


def test_friends_scope_only_shows_people_you_share_a_group_with(client):
    mine = make_user(client, "me")
    headers = {"X-User-Id": str(mine)}
    make_user(client, "stranger")

    group = client.post("/api/groups", json={"name": "crew"}, headers=headers).json()
    mate = make_user(client, "mate")
    client.post(f"/api/groups/{group['id']}/members/mate", headers=headers)

    names = {e["username"] for e in client.get("/api/leaderboard?scope=friends", headers=headers).json()}
    assert names == {"me", "mate"}
    assert "stranger" in {e["username"] for e in client.get("/api/leaderboard").json()}
    assert mate  # created above, used via the roster call


def test_drop_is_scheduled_inside_the_daytime_window():
    from datetime import datetime, timedelta, timezone
    from zoneinfo import ZoneInfo

    from app.config import settings
    from app.services.drop_scheduler import next_drop_time

    tz = ZoneInfo(settings.drop_timezone)
    # Sweep a full day of "now" values so we cover before, during and after the window.
    base = datetime(2026, 8, 8, tzinfo=timezone.utc)
    for hour in range(24):
        chosen = next_drop_time(base + timedelta(hours=hour)).astimezone(tz)
        ends = chosen + timedelta(seconds=settings.drop_window_seconds)
        assert chosen.hour >= settings.drop_earliest_hour, chosen
        assert ends.hour < settings.drop_latest_hour or (
            ends.hour == settings.drop_latest_hour and ends.minute == 0
        ), ends
        assert chosen >= base + timedelta(hours=hour), "never schedules in the past"


def test_elo_is_zero_sum_and_favours_the_winner():
    from app.services.elo import BASE_RATING, Contender, rate_drop

    field = [
        Contender("winner", score=90.0, rating=BASE_RATING),
        Contender("middle", score=50.0, rating=BASE_RATING),
        Contender("loser", score=10.0, rating=BASE_RATING),
    ]
    new = rate_drop(field)

    assert new["winner"] > BASE_RATING > new["loser"]
    assert new["middle"] == BASE_RATING  # even record against equal opponents
    # Points move between players, they are not created.
    assert sum(new.values()) == pytest.approx(BASE_RATING * 3, abs=2)


def test_elo_rewards_beating_a_stronger_player():
    from app.services.elo import Contender, rate_drop

    upset = rate_drop([Contender("david", 90.0, 1000), Contender("goliath", 10.0, 1600)])
    expected_win = rate_drop([Contender("david", 90.0, 1600), Contender("goliath", 10.0, 1000)])

    assert upset["david"] - 1000 > expected_win["david"] - 1600


def test_elo_needs_an_opponent():
    from app.services.elo import BASE_RATING, Contender, rate_drop

    assert rate_drop([Contender("solo", 90.0, BASE_RATING)]) == {}
    assert rate_drop([]) == {}


def test_drop_close_settles_ratings(client):
    """Two players in one drop: the better photo gains rating, the other loses it."""
    from app.database import SessionLocal
    from app.models import Player
    from app.services.drop_scheduler import settle_ratings

    good = make_user(client, "sharp")
    bad = make_user(client, "blurry")
    drop = client.post("/api/drops/trigger", headers={"X-User-Id": str(good)}).json()
    url = f"/api/drops/{drop['id']}/submissions"

    client.post(url, headers={"X-User-Id": str(good)},
                files={"photo": ("g.jpg", fake_grass(), "image/jpeg")})
    client.post(url, headers={"X-User-Id": str(bad)},
                files={"photo": ("x.jpg", not_grass(), "image/jpeg")})  # rejected, scores 0

    db = SessionLocal()
    try:
        ratings = settle_ratings(db, drop["id"])
        db.commit()
        assert len(ratings) == 2
        by_name = {p.username: p.elo for p in db.query(Player).all()}
    finally:
        db.close()

    assert by_name["sharp"] > 1200 > by_name["blurry"]

    board = client.get("/api/leaderboard").json()
    assert [e["username"] for e in board] == ["sharp", "blurry"]  # ranked by elo
    assert board[0]["elo"] > board[1]["elo"]
