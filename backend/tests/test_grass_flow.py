"""End-to-end smoke test: user -> group -> drop -> submission -> mural."""

import random
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
    r = client.post("/api/users", json={"username": username})
    assert r.status_code == 201, r.text
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

    r = client.post(f"/api/groups/{group['id']}/drops/trigger", headers=headers)
    assert r.status_code == 200, r.text
    drop = r.json()
    assert drop["status"] == "active"

    url = f"/api/groups/{group['id']}/drops/{drop['id']}/submissions"
    r = client.post(url, headers=headers, files={"photo": ("g.jpg", fake_grass(), "image/jpeg")})
    assert r.status_code == 201, r.text
    sub = r.json()
    assert sub["status"] == "verified", sub
    assert sub["total_score"] > 0
    assert sub["speed_score"] == 100.0  # submitted instantly

    # one submission per person per drop
    r = client.post(url, headers=headers, files={"photo": ("g.jpg", fake_grass(), "image/jpeg")})
    assert r.status_code == 409

    r = client.get(f"/api/groups/{group['id']}/leaderboard", headers=headers)
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
    drop = client.post(f"/api/groups/{group['id']}/drops/trigger", headers=headers).json()
    url = f"/api/groups/{group['id']}/drops/{drop['id']}/submissions"

    r = client.post(url, headers=headers, files={"photo": ("x.jpg", not_grass(), "image/jpeg")})
    assert r.status_code == 201
    assert r.json()["status"] == "rejected"
    assert "green" in r.json()["reject_reason"]

    assert client.get("/api/mural").json()["tile_count"] == 0


def test_rejects_flat_green_screen(client):
    uid = make_user(client, "cheater")
    headers = {"X-User-Id": str(uid)}
    group = client.post("/api/groups", json={"name": "g"}, headers=headers).json()
    drop = client.post(f"/api/groups/{group['id']}/drops/trigger", headers=headers).json()
    url = f"/api/groups/{group['id']}/drops/{drop['id']}/submissions"

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
    drop = client.post(f"/api/groups/{group['id']}/drops/trigger", headers=headers).json()
    url = f"/api/groups/{group['id']}/drops/{drop['id']}/submissions"

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
    drop = client.post(f"/api/groups/{group['id']}/drops/trigger", headers=headers).json()
    client.post(
        f"/api/groups/{group['id']}/drops/{drop['id']}/submissions",
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
    group = client.post("/api/groups", json={"name": "g"}, headers=headers).json()
    drop = client.post(f"/api/groups/{group['id']}/drops/trigger", headers=headers).json()

    r = client.post(
        f"/api/groups/{group['id']}/drops/{drop['id']}/submissions",
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
    group = client.post("/api/groups", json={"name": "g"}, headers=headers).json()
    drop = client.post(f"/api/groups/{group['id']}/drops/trigger", headers=headers).json()
    client.post(
        f"/api/groups/{group['id']}/drops/{drop['id']}/submissions",
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
