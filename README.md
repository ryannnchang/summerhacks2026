# 🌱 Touch Grass

Competitive outdoor accountability for people who have not seen the sun since midterms.

Join a group. At a random moment a **drop** goes live and everyone gets pinged. You have 15
minutes to find real grass, photograph it, and upload. The photo is verified, scored on
**quality × speed**, and added to a shared mural that grows one tile at a time.

## Quick start

```bash
npm start        # or: ./dev.sh — same thing
```

That creates the virtualenv, installs both dependency sets, and runs the API on
**:8000** and the frontend on **:5173**. Open http://localhost:5173. Ctrl-C stops both.

The app is two processes — Python for the API, Node for the frontend — because they're different
runtimes. `npm start` just launches both together so you only manage one terminal. In dev the
frontend proxies `/api` and `/uploads` to the backend, so the browser only ever talks to :5173.

<details>
<summary>Running the two halves separately</summary>

```bash
# API — http://127.0.0.1:8000/docs for interactive Swagger
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload

# Frontend
cd frontend
npm install && npm run dev
```
</details>

```bash
cd backend && .venv/bin/python -m pytest tests -q   # 5 tests, full loop
cd frontend && npm run build                        # typecheck + bundle
```

## Layout

```
backend/                    FastAPI + SQLAlchemy + SQLite
  app/
    main.py                 app wiring, CORS, /uploads mount, scheduler lifespan
    config.py               all tunables (drop timing, thresholds, mural width)
    models.py               User, Group, Membership, Drop, Submission
    schemas.py              Pydantic request/response shapes
    database.py             engine + session dependency
    api/
      deps.py               auth + group-membership guards
      routes/               users, groups, drops (+ WebSocket), submissions, mural, map
    services/
      grass_verifier.py     is this actually grass? -> coverage / texture / vibrance
      scoring.py            quality x speed x streak -> points
      drop_scheduler.py     background loop that opens and closes drops
      events.py             in-process pub/sub for the WebSocket feed
      mural.py              tile placement on the shared grid
    storage/                image resize + thumbnail + disk writes
  tests/                    end-to-end smoke tests
  uploads/                  submitted photos (gitignored)

frontend/                   React + TypeScript + Vite
  src/
    api/client.ts           typed fetch wrapper, one method per endpoint
    hooks/                  useAuth, useGroupSocket, useCountdown
    components/             GrassMap (Leaflet), DropBanner, GrassCapture, Leaderboard,
                            MemberList, MuralGrid
    pages/                  Map (landing), Groups, Group, Mural
    types/                  shared types mirroring the API
    styles/index.css        design tokens + all component styles

docs/                       architecture notes and the API reference
```

## How the pieces fit

**Drops.** A background loop in [drop_scheduler.py](backend/app/services/drop_scheduler.py) ticks
every 5 seconds. Every group always has one `pending` drop queued at a random future time; when
that time arrives the drop flips to `active`, a `drop.started` event broadcasts to every WebSocket
client in the group, and the browser fires a desktop notification. When the window expires the drop
closes and the next one is queued.

**Verification.** [grass_verifier.py](backend/app/services/grass_verifier.py) is a pure-CV
heuristic — no model download, runs in milliseconds. It measures three things:

| signal | what it catches |
| --- | --- |
| coverage | fraction of vegetation-green pixels — rejects a photo of your desk |
| texture | edge energy inside the green — rejects turf, painted walls, and screens |
| vibrance | mean saturation — healthy grass scores above dead grass |

The return shape is the contract, so swapping in a real vision model later touches one function.

**Scoring.** `0.6 × quality + 0.4 × speed`, times a streak multiplier that caps at +50%. Speed is
100 for a sub-2-minute response and decays linearly to 0 at the deadline. See
[scoring.py](backend/app/services/scoring.py).

**Mural.** Every verified submission claims the next cell in a fixed-width grid, so the mural fills
row by row in submission order. It's global — all groups feed the same field.

**Map.** The landing page is a Leaflet map centred on Toronto (`43.6532, -79.3832`, configurable via
`MAP_CENTER_LAT` / `MAP_CENTER_LNG`). It plots every verified patch that arrived with coordinates,
served by the public `GET /api/map/patches`. Location is best-effort: `GrassCapture` asks the
browser for coordinates and attaches them if granted, but a refusal never blocks the upload — the
submission still scores and still reaches the mural, it just won't appear on the map.

## Auth is not wired up

The frontend sends no identity at all. The API still expects an `X-User-Id` header, so **every
group, drop, and submission call returns 401** until auth exists. Two things work today without
it, because they're public: the **map** and the **mural**.

The seam is one function — `authHeader()` in [api/client.ts](frontend/src/api/client.ts). Make it
return the signed-in user's id and every call starts working; no other file needs to change.

## Configuration

Everything lives in [backend/app/config.py](backend/app/config.py) and can be overridden by a
`.env` file (copy `.env.example`). The two you'll actually want on demo day:

```bash
DROP_MIN_GAP_SECONDS=60      # default 3600
DROP_MAX_GAP_SECONDS=180     # default 21600
```

There's also a **Drop now** button in the UI that fires a drop immediately.

## Known gaps

- **There is no auth.** The frontend sends no identity; the backend trusts whatever `X-User-Id`
  it's given. Both halves need work — see [docs/architecture.md](docs/architecture.md).
- **Single process only.** The scheduler and the WebSocket registry both live in memory, so running
  more than one worker means duplicate drops. Redis pub/sub is the fix.
- **No EXIF/geo checks.** Nothing stops someone from re-uploading a saved photo. Checking EXIF
  timestamps and GPS against the drop window is the natural next step.
