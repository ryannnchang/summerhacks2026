"""End-to-end smoke test: user -> drop -> submission -> mural.

Drops are global, so no group is needed to play. Groups only scope the
"friends" view of the leaderboard.
"""

import os
import random
import time
import uuid
from io import BytesIO

import jwt
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


# Set by conftest before app.config loads; read back rather than re-imported
# because conftest isn't an importable module under pytest's rootdir layout.
TEST_JWT_SECRET = os.environ["SUPABASE_JWT_SECRET"]

# backend user id -> the Supabase uuid its test token must carry.
_supabase_uids: dict[int, str] = {}


def _token(supabase_uid: str) -> str:
    """A test JWT, shaped like Supabase's: sub + audience + expiry."""
    return jwt.encode(
        {"sub": supabase_uid, "aud": "authenticated", "exp": int(time.time()) + 3600},
        TEST_JWT_SECRET,
        algorithm="HS256",
    )


def auth(user_id: int) -> dict[str, str]:
    """Bearer headers for a user created by make_user."""
    return {"Authorization": f"Bearer {_token(_supabase_uids[user_id])}"}


def make_user(client, username):
    """Mirrors the real flow: Google sign-in -> /users/link -> a players row.

    The leaderboard reads `players`, so an account created without linking has no
    row there and never appears on the board. Identity comes from the token now;
    the body carries only the cosmetics.
    """
    uid = f"{uuid.uuid5(uuid.NAMESPACE_DNS, username)}"
    r = client.post(
        "/api/users/link",
        headers={"Authorization": f"Bearer {_token(uid)}"},
        json={
            "username": username,
            "display_name": username,
            "email": f"{username}@test.com",
        },
    )
    assert r.status_code == 200, r.text
    user_id = r.json()["id"]
    _supabase_uids[user_id] = uid
    return user_id


def test_full_grass_loop(client):
    uid = make_user(client, "ryan")
    headers = auth(uid)

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


def test_reset_closes_live_drop_and_reopens_submissions(client):
    uid = make_user(client, "demoer")
    headers = auth(uid)

    first = client.post("/api/drops/trigger", headers=headers).json()
    url = f"/api/drops/{first['id']}/submissions"
    r = client.post(url, headers=headers, files={"photo": ("g.jpg", fake_grass(), "image/jpeg")})
    assert r.status_code == 201, r.text

    # Locked out of the live drop — this is what reset exists to undo.
    r = client.post(url, headers=headers, files={"photo": ("g.jpg", fake_grass(), "image/jpeg")})
    assert r.status_code == 409

    r = client.post("/api/drops/reset", headers=headers)
    assert r.status_code == 200, r.text
    fresh = r.json()
    assert fresh["status"] == "active"
    assert fresh["id"] != first["id"]
    assert fresh["has_submitted"] is False

    # Old drop is closed, and the same person can submit again on the new one.
    drops = {d["id"]: d for d in client.get("/api/drops", headers=headers).json()}
    assert drops[first["id"]]["status"] == "closed"
    r = client.post(
        f"/api/drops/{fresh['id']}/submissions",
        headers=headers,
        files={"photo": ("g.jpg", fake_grass(), "image/jpeg")},
    )
    assert r.status_code == 201, r.text


def test_rejects_non_grass(client):
    uid = make_user(client, "impostor")
    headers = auth(uid)
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
    headers = auth(uid)
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
        "/api/groups", json={"name": "private"}, headers=auth(owner)
    ).json()

    r = client.get(f"/api/groups/{group['id']}", headers=auth(outsider))
    assert r.status_code == 403

    r = client.post(
        "/api/groups/join",
        json={"join_code": group["join_code"]},
        headers=auth(outsider),
    )
    assert r.status_code == 200
    r = client.get(f"/api/groups/{group['id']}", headers=auth(outsider))
    assert r.status_code == 200
    assert len(r.json()["members"]) == 2


def test_auth_required(client):
    # No token at all.
    assert client.get("/api/users/me").status_code == 401
    # The old identity header no longer works — that's the point of the change.
    assert client.get("/api/users/me", headers={"X-User-Id": "1"}).status_code == 401
    # Garbage token.
    assert (
        client.get("/api/users/me", headers={"Authorization": "Bearer not.a.jwt"}).status_code
        == 401
    )
    # Properly signed but expired.
    stale = jwt.encode(
        {"sub": f"{uuid.uuid4()}", "aud": "authenticated", "exp": int(time.time()) - 60},
        TEST_JWT_SECRET,
        algorithm="HS256",
    )
    r = client.get("/api/users/me", headers={"Authorization": f"Bearer {stale}"})
    assert r.status_code == 401 and "expired" in r.json()["detail"].lower()
    # Wrong signing key entirely.
    forged = jwt.encode(
        {"sub": f"{uuid.uuid4()}", "aud": "authenticated", "exp": int(time.time()) + 3600},
        "some-other-secret",
        algorithm="HS256",
    )
    assert (
        client.get("/api/users/me", headers={"Authorization": f"Bearer {forged}"}).status_code
        == 401
    )
    # Valid token, but the account never linked.
    unlinked = _token(f"{uuid.uuid4()}")
    r = client.get("/api/users/me", headers={"Authorization": f"Bearer {unlinked}"})
    assert r.status_code == 401 and "not linked" in r.json()["detail"].lower()


def test_link_cannot_claim_someone_elses_account(client):
    """The body's supabase_uid is only ever cross-checked against the token."""
    victim_uid = f"{uuid.uuid5(uuid.NAMESPACE_DNS, 'victim')}"
    make_user(client, "victim")

    r = client.post(
        "/api/users/link",
        headers={"Authorization": f"Bearer {_token(f'{uuid.uuid4()}')}"},
        json={"supabase_uid": victim_uid, "username": "hijacker", "display_name": "h"},
    )
    assert r.status_code == 403


def test_map_patches_only_include_geolocated_grass(client):
    uid = make_user(client, "mapper")
    headers = auth(uid)
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
    headers = auth(uid)
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
    headers = auth(uid)
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
    headers = auth(uid)
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
    headers = auth(uid)

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
    headers = auth(mine)
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


def test_elo_rises_above_par_and_falls_below():
    from app.services.elo import BASE_RATING, K_FACTOR, PAR_SCORE, adjust

    assert adjust(BASE_RATING, PAR_SCORE) == BASE_RATING  # par changes nothing
    assert adjust(BASE_RATING, 100.0) == BASE_RATING + K_FACTOR
    assert adjust(BASE_RATING, 0.0) == BASE_RATING - K_FACTOR
    # Streak multiplier can push total_score past 100; the gain still caps at +K.
    assert adjust(BASE_RATING, 140.0) == BASE_RATING + K_FACTOR
    # Monotone around par.
    assert adjust(BASE_RATING, 75.0) > BASE_RATING > adjust(BASE_RATING, 25.0)


def test_elo_settles_per_submission(client):
    """A good photo gains rating on the spot; a rejected one loses it."""
    from app.database import SessionLocal
    from app.models import Player

    good = make_user(client, "sharp")
    bad = make_user(client, "blurry")
    drop = client.post("/api/drops/trigger", headers=auth(good)).json()
    url = f"/api/drops/{drop['id']}/submissions"

    win = client.post(url, headers=auth(good),
                      files={"photo": ("g.jpg", fake_grass(), "image/jpeg")}).json()
    loss = client.post(url, headers=auth(bad),
                       files={"photo": ("x.jpg", not_grass(), "image/jpeg")}).json()

    # The upload response carries the rating change the player just earned.
    assert win["elo_delta"] > 0 > loss["elo_delta"]  # rejected scores 0 -> below par

    db = SessionLocal()
    try:
        by_name = {p.username: p.elo for p in db.query(Player).all()}
    finally:
        db.close()

    assert by_name["sharp"] == 1200 + win["elo_delta"]
    assert by_name["blurry"] == 1200 + loss["elo_delta"]

    board = client.get("/api/leaderboard").json()
    assert [e["username"] for e in board] == ["sharp", "blurry"]  # ranked by elo
    assert board[0]["elo"] > board[1]["elo"]


def test_rename_follows_through_to_leaderboard(client):
    uid = make_user(client, "oldname")
    make_user(client, "taken")

    # The new name is rejected if someone already holds it.
    conflict = client.patch(
        "/api/users/me", headers=auth(uid), json={"username": "taken"}
    )
    assert conflict.status_code == 409

    renamed = client.patch(
        "/api/users/me", headers=auth(uid), json={"username": "newname"}
    )
    assert renamed.status_code == 200
    assert renamed.json()["username"] == "newname"
    assert renamed.json()["elo"] == 1200  # profile carries the players-row rating

    board = client.get("/api/leaderboard").json()
    assert {e["username"] for e in board} == {"newname", "taken"}


def test_add_friend_by_email(client):
    me = make_user(client, "hermit")
    make_user(client, "buddy")
    headers = auth(me)

    # Unknown address is a 404, my own is a 400.
    assert (
        client.post("/api/users/friends", headers=headers, json={"email": "ghost@test.com"})
    ).status_code == 404
    assert (
        client.post("/api/users/friends", headers=headers, json={"email": "hermit@test.com"})
    ).status_code == 400

    # Case-insensitive match; a friends group is created on the spot.
    r = client.post("/api/users/friends", headers=headers, json={"email": "Buddy@Test.com"})
    assert r.status_code == 201, r.text
    assert r.json()["username"] == "buddy"

    board = client.get("/api/leaderboard?scope=friends", headers=headers).json()
    assert {e["username"] for e in board} == {"hermit", "buddy"}

    # Adding twice is a no-op success, not an error.
    assert (
        client.post("/api/users/friends", headers=headers, json={"email": "buddy@test.com"})
    ).status_code == 201


def test_glyph_wilts_when_lushness_is_low():
    from app.services.glyphs import WILT_BELOW, make_glyph

    args = dict(seed=3, palette=["#2d5a27", "#4a7c3c"], features=[], biodiversity=55)
    dead = make_glyph(lushness=0, **args)
    alive = make_glyph(lushness=90, **args)

    # Dead grass loses its sheen; a healthy tuft keeps the white specks.
    assert "#ffffff" not in dead
    assert "#ffffff" in alive
    # ...and none of the green it was given survives the fade to straw.
    assert "#2d5a27" not in dead
    assert "#2d5a27" in alive

    # Blades stay inside the 64-unit viewBox even at full droop, or the tuft
    # renders empty. Every coordinate in the path data must be on-canvas.
    import re

    coords = [float(n) for n in re.findall(r"-?\d+\.?\d*", dead.split("<path", 1)[1])]
    assert all(-1 <= c <= 65 for c in coords), coords

    # At the threshold nothing has wilted yet.
    assert make_glyph(lushness=WILT_BELOW, **args) == make_glyph(lushness=WILT_BELOW, **args)
    assert "#2d5a27" in make_glyph(lushness=WILT_BELOW, **args)


def test_rejection_earns_consolation_points_and_a_dead_glyph(client):
    from app.services.scoring import REJECTED_POINTS

    uid = make_user(client, "trier")
    headers = auth(uid)
    drop = client.post("/api/drops/trigger", headers=headers).json()

    r = client.post(
        f"/api/drops/{drop['id']}/submissions",
        headers=headers,
        files={"photo": ("x.jpg", not_grass(), "image/jpeg")},
    ).json()

    assert r["status"] == "rejected"
    assert r["total_score"] == REJECTED_POINTS  # showing up still pays
    assert r["glyph_svg"], "a rejection should still grow a (dead) tuft"
    assert "#ffffff" not in r["glyph_svg"], "dead grass has no sheen"
    # Still a rating loss, just softer than a zero would be.
    assert -32 < r["elo_delta"] < 0

    me = client.get("/api/users/me", headers=headers).json()
    assert me["total_score"] == REJECTED_POINTS
    assert me["streak"] == 0  # the streak is still gone

    # The mural stays verified-only; the map takes everything geolocated.
    assert client.get("/api/mural").json()["tile_count"] == 0
    assert client.get("/api/map/patches").json()["patch_count"] == 0  # no coords sent


def test_map_shows_rejections_as_dead_tufts(client):
    uid = make_user(client, "wanderer")
    headers = auth(uid)
    drop = client.post("/api/drops/trigger", headers=headers).json()

    client.post(
        f"/api/drops/{drop['id']}/submissions",
        headers=headers,
        files={"photo": ("x.jpg", not_grass(), "image/jpeg")},
        data={"latitude": "43.6465", "longitude": "-79.4130"},
    )

    body = client.get("/api/map/patches").json()
    assert body["patch_count"] == 1, "a rejection with coords still marks the map"
    patch = body["patches"][0]
    assert patch["status"] == "rejected"
    assert patch["reject_reason"]
    assert patch["glyph_svg"] and "#ffffff" not in patch["glyph_svg"]  # dead: no sheen
