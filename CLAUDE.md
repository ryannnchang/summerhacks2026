# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Touch Grass** (browser title: "Competitive Grass") — a group accountability game. At a random
moment a **drop** fires for a group, members get 15 minutes to photograph real grass, the photo is
CV-verified and scored on quality × speed, and verified photos land on both a shared global mural
and a public Mapbox map.

Two processes: FastAPI + SQLite on `:8000`, React + TypeScript + Vite on `:5173`.

## Commands

```bash
npm start                                    # both halves (creates venv, installs deps)
npm test                                     # backend pytest
npm run build                                # frontend typecheck + bundle
npm run typecheck                            # frontend tsc --noEmit
```

Single test:

```bash
cd backend && .venv/bin/python -m pytest tests/test_grass_flow.py::test_full_grass_loop -q
```

**On Windows** the root scripts and `dev.sh` are POSIX-only — they hardcode `.venv/bin/` and run a
bash script. Use `.venv\Scripts\` and start the two halves separately:

```powershell
cd backend; .venv\Scripts\uvicorn app.main:app --reload --port 8000
cd frontend; npm run dev
```

There is no linter or formatter configured.

## Testing gotcha

`tests/test_grass_flow.py` imports the real `engine` from `app.database` and calls
`Base.metadata.drop_all()` in an autouse fixture. **Running the tests wipes the dev database**
(`backend/grass.db`) unless `DATABASE_URL` points elsewhere. Tests go through `TestClient(app)`,
which triggers the lifespan and starts a real scheduler task.

Test images are generated in-process: `fake_grass()` (noisy green, passes), `flat_green()` (fails
texture), `not_grass()` (fails coverage). Tuning verifier thresholds will break these.

## Backend architecture

### The drop lifecycle

Every group always has exactly one `PENDING` drop queued. An asyncio task started in `main.py`'s
lifespan runs [drop_scheduler.py](backend/app/services/drop_scheduler.py) every 5 seconds and:

1. Flips due `PENDING` → `ACTIVE`, sets `expires_at`, broadcasts `drop.started`
2. Flips expired `ACTIVE` → `CLOSED`, broadcasts `drop.closed`, queues the next pending drop
3. Backfills a pending drop for any group missing one

`ensure_pending_drop()` is also called from route handlers (group creation, `GET /drops/current`,
`POST /drops/trigger`), so the invariant holds even between ticks.

### Single-process constraints

Both the scheduler and the WebSocket registry ([events.py](backend/app/services/events.py)) live in
process memory. **Running more than one uvicorn worker means duplicate drops and lost broadcasts.**
Redis pub/sub is the documented fix — see [docs/architecture.md](docs/architecture.md).

### Datetimes

SQLite drops timezone info, so stored timestamps come back naive. Every read of a stored datetime
must go through `as_utc()` (exported from `drop_scheduler.py`) before arithmetic, or you get
`can't subtract offset-naive and offset-aware datetimes` at runtime.

### Verification and scoring

Two judges share one contract — `verify_grass()` in
[grass_verifier.py](backend/app/services/grass_verifier.py) returns a `GrassResult`, and the route
only knows that shape:

- **Gemini** ([gemini_judge.py](backend/app/services/gemini_judge.py)) judges when
  `GEMINI_API_KEY` is set: one `google-genai` call with a pydantic `response_schema` (strict JSON)
  doing the authenticity gate (screens/prints/turf), grass classification, lushness + biodiversity
  scoring (weeds and flowers beat mowed lawn), and palette/feature extraction for the glyphs.
  Quality becomes `0.45·lushness + 0.35·biodiversity + 0.20·coverage` (`merge_gemini`).
- **CV heuristic** (same file) — HSV green mask → coverage, edge energy → texture, saturation →
  vibrance. Judges alone without a key, and catches every Gemini failure (timeout, outage, bad
  JSON) so a dead API degrades the judging, not the demo.

The local pixel signals are computed on every submission regardless of judge, so
`grass_coverage`/`texture_score`/`dominant_color` stay meaningful. Gemini extras persist on
`Submission` (`lushness`, `biodiversity`, `features_json`, `verdict_source`). `verify_grass()` is
blocking — the route calls it via `run_in_threadpool` to keep the scheduler and WebSockets alive.
Tests force the heuristic (`force_heuristic_judge` fixture), so they stay offline even with a key
in `.env`.

[scoring.py](backend/app/services/scoring.py) holds all the weights and has no callers depending on
the numbers. `Submission` persists the raw verifier signals alongside derived scores, so re-tuning
the formula never requires re-processing images.

A rejected submission zeroes `Membership.streak`; a verified one increments it. The streak
multiplier caps at +50%.

### Data model

```
User ──< Membership >── Group ──< Drop ──< Submission ── mural_x/mural_y, latitude/longitude
```

`Membership` is both the join table and the per-group scoreboard (`total_score`, `streak`), so
standings are independent per group. Two unique constraints carry most of the correctness:
`(user_id, group_id)` blocks double-joins, `(user_id, drop_id)` blocks double-submissions.

There is no Alembic, but `init_db()` runs a poor-man's migration
(`_backfill_sqlite_columns` in [database.py](backend/app/database.py)) that `ALTER TABLE ADD
COLUMN`s any **nullable** model column missing from an existing SQLite db. Additive nullable
columns are therefore safe; anything else (renames, non-nullable, type changes) still means
deleting `backend/grass.db` or migrating by hand.

### Mural vs. map

Two different global views of the same submissions, both public (no auth):

- **Mural** ([mural.py](backend/app/services/mural.py)) — counts all placed tiles across every group
  and assigns the next cell in a fixed-width grid. Every verified submission gets a tile.
- **Map** ([routes/map.py](backend/app/api/routes/map.py)) — only verified submissions that arrived
  with coordinates. Lat/lng are optional `Form` fields on the upload; the browser may refuse to
  share location, in which case the submission still scores and still tiles the mural but never
  appears on the map. `GET /api/map/patches` returns the configured center alongside the patches.

### Glyphs

Every verified submission gets a procedural SVG tuft ([glyphs.py](backend/app/services/glyphs.py))
drawn from the judge's signals — lushness sets blade count/height, biodiversity sets wildness,
palette colors the blades, and feature tags grow clover/flowers/moss. Deterministic: seeded by
submission id, so the same row always draws the same tuft. Generated at submit time (after
`db.flush()` assigns the id), stored in `Submission.glyph_svg`, and lazily backfilled by the map
route for rows that predate glyphs. The frontend injects it into a Mapbox DOM marker (sized by
quality score) with a CSS `drop-shadow` glow, so overlapping markers merge into glowing green
regions when zoomed out, and clustered markers plant up to six tufts along one baseline so a
cluster reads as a denser patch rather than a stack of pins. Nothing user-controlled enters the SVG — palette hexes are
regex-validated upstream and feature tags are matched, never embedded.

### Auth

There is none. [deps.py](backend/app/api/deps.py) `current_user()` trusts an `X-User-Id` header.
Every protected route depends on `CurrentUser`, so replacing this is one function. The WebSocket
route is entirely unauthenticated.

## Frontend architecture

Same-origin in dev — [vite.config.ts](frontend/vite.config.ts) proxies `/api` (with `ws: true`) and
`/uploads` to `:8000`, so the browser only ever talks to `:5173`.

### Styling

**Tailwind**, configured with a custom sports-field palette in
[tailwind.config.js](frontend/tailwind.config.js): `turf-900..400`, `chalk`, `scoreboard`,
`dirt`. Fonts are Bebas Neue / Work Sans / Space Mono, loaded via `<link>` in `index.html` and
wired through CSS variables. Use `font-display` / `font-body` / `font-mono` rather than raw
family names.

PostCSS is configured **inline in `vite.config.ts`**, not via a `postcss.config.js` — deliberately,
so Vite doesn't walk up and find an unrelated config in a parent directory. Adding a
`postcss.config.js` will not take effect.

[styles/index.css](frontend/src/styles/index.css) holds the Tailwind directives plus a few custom
utilities that don't express well as classes (`chalk-border`, `flip-digit`, `grass-glyph`), plus
the map's marker styles (`patch-marker*`, `patch-cluster*`, `pin-popup`) and the overrides that
re-skin Mapbox's own chrome (`.mapboxgl-*`).

### Routing and session

[App.tsx](frontend/src/App.tsx) is the router. Most routes are wrapped in `RequireSession` and
bounce to `/auth`; `/map` and `/mural` are deliberately public. `BottomNav` renders only when
signed in.

[useSession.tsx](frontend/src/hooks/useSession.tsx) is the session context — `signIn` is
sign-in and sign-up in one gesture (look the username up, create it if 404). It also holds
`groupId`, the group the bottom-nav tabs are currently pointed at; pages read it rather than taking
a route param. Raw localStorage access lives in [lib/session.ts](frontend/src/lib/session.ts)
(`cg_user_id`, `cg_group_id`), not in the API client.

### Capture → review handoff

`/capture` and `/review` are two routes over one upload. [CameraCapture](frontend/src/components/CameraCapture.tsx)
produces a `File` (getUserMedia + canvas, with a file-input fallback), `/capture` stashes it in
[lib/pendingPhoto.ts](frontend/src/lib/pendingPhoto.ts) — **module-level memory, not localStorage**,
because a camera frame blows the ~5MB quota — and navigates to `/review`, which uploads it and
shows the verdict. A hard refresh on `/review` therefore has nothing to submit and redirects back.

`currentCoords()` in [lib/geo.ts](frontend/src/lib/geo.ts) is best-effort and resolves `undefined`
on refusal or timeout; it must never block the upload.

### API client

[client.ts](frontend/src/api/client.ts) is the single fetch wrapper: `authHeader()` injects
`X-User-Id`, `Content-Type` is skipped for `FormData`, and FastAPI's `detail` field is unwrapped
into an `ApiError` carrying `status`. Add new endpoints as methods on the `api` object rather than
calling `fetch` from components.

### Map component

[GrassMap.tsx](frontend/src/components/GrassMap.tsx) wraps **Mapbox GL** imperatively (refs +
effects, no React binding library). It needs `VITE_MAPBOX_TOKEN` in the root `.env` — without it
the map renders blank and logs one error. The `center` prop stays in Leaflet's `[lat, lng]` order
so callers didn't have to change; every Mapbox call flips it.

Four constraints drive the shape of the file:

- **Pins are DOM markers, not a symbol layer.** A tuft with a coloured ring, a score chip and a
  hover state is far cheaper in CSS than in a paint spec.
- **Clustering still needs a real GeoJSON source** (supercluster lives there), so the source
  carries the points, an invisible 1px-radius circle layer (`patches-probe`) forces its tiles to
  load — `querySourceFeatures` only sees loaded tiles — and markers are reconciled against
  whatever that source reports on each `render`. Markers are keyed (`p<id>` / `c<cluster_id>`) and
  reused; rebuilding them per frame restarts the CSS pop and flickers the pins.
- **Mapbox positions a marker by writing `transform` onto the root element.** Any CSS animation or
  hover rule touching `transform` outranks that inline style and strands every pin at the map's
  top-left corner, so everything that moves lives on an inner `__inner` wrapper.
- **`clusterMinPoints` is 2, not the default 4.** A group photographs the same lawn, so real
  submissions land metres apart — an unclustered pair renders as one pin with the other hidden
  underneath.

Popups are gone: `onSelect` hands the patch up to [MapPage.tsx](frontend/src/pages/MapPage.tsx),
which renders the detail card as React. Nothing builds marker HTML from user-supplied strings —
`glyph_svg` is server-generated — so there is no longer an `escapeAttr()` to route things through.

## Configuration

All tunables are in [backend/app/config.py](backend/app/config.py). Env lives in the **repo-root
`.env`** (copy [.env.example](.env.example)) — one file configures both halves: Vite reads that
directory via `envDir: '..'`, and `config.py` loads `backend/.env` then the root one, root winning.
Only `VITE_`-prefixed vars reach the browser bundle, so `VITE_MAPBOX_TOKEN` and the Supabase anon
key go there and nothing else does. For demos, tighten `DROP_MIN_GAP_SECONDS` / `DROP_MAX_GAP_SECONDS` — or use
the trigger button, which hits `POST /groups/{id}/drops/trigger`. Map default center is downtown
Toronto (`MAP_CENTER_LAT` / `MAP_CENTER_LNG` / `MAP_ZOOM`).

## Reference

[docs/architecture.md](docs/architecture.md) covers design rationale, the path off single-process,
and an anti-cheat backlog. [docs/api.md](docs/api.md) is the endpoint reference; Swagger is at
`http://127.0.0.1:8000/docs`.

Note that [README.md](README.md) is currently out of date on the frontend: it lists pre-redesign
component and page names (`DropBanner`, `GrassCapture`, `Leaderboard`, `useAuth`) and claims the
frontend sends no identity, which is no longer true. Trust this file and the source over it.
