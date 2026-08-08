# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Touch Grass** — a group accountability game. At a random moment a **drop** fires for a group,
members get 15 minutes to photograph real grass, the photo is CV-verified and scored on
quality × speed, and verified photos tile a shared global mural.

Two processes: FastAPI + SQLite on `:8000`, React + Vite on `:5173`.

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
(`backend/grass.db`) unless `DATABASE_URL` points elsewhere. Tests also go through `TestClient(app)`,
which triggers the lifespan and starts a real scheduler task.

Test images are generated in-process: `fake_grass()` (noisy green, passes), `flat_green()` (fails
texture), `not_grass()` (fails coverage). Tuning verifier thresholds will break these.

## Architecture

### The drop lifecycle

Every group always has exactly one `PENDING` drop queued. An asyncio task started in `main.py`'s
lifespan runs [drop_scheduler.py](backend/app/services/drop_scheduler.py) every 5 seconds and:

1. Flips due `PENDING` → `ACTIVE`, sets `expires_at`, broadcasts `drop.started`
2. Flips expired `ACTIVE` → `CLOSED`, broadcasts `drop.closed`, queues the next pending drop
3. Backfills a pending drop for any group missing one

`ensure_pending_drop()` is also called from route handlers (group creation, `GET /drops/current`),
so the invariant holds even between ticks.

### Single-process constraints

Both the scheduler and the WebSocket registry ([events.py](backend/app/services/events.py)) live in
process memory. **Running more than one uvicorn worker means duplicate drops and lost broadcasts.**
Redis pub/sub is the documented fix — see [docs/architecture.md](docs/architecture.md).

### Datetimes

SQLite drops timezone info, so stored timestamps come back naive. Every read of a stored datetime
must go through `as_utc()` (exported from `drop_scheduler.py`) before arithmetic, or you get
`can't subtract offset-naive and offset-aware datetimes` at runtime.

### Verification and scoring

[grass_verifier.py](backend/app/services/grass_verifier.py) is a pure-CV heuristic — HSV green mask
→ coverage, edge energy inside the mask → texture, mean saturation → vibrance. No model, runs in
milliseconds. `verify_grass()` returning a `GrassResult` is the contract; a real vision model can
replace the function body without touching the route.

[scoring.py](backend/app/services/scoring.py) holds all the weights and has no callers depending on
the numbers. `Submission` persists the raw verifier signals alongside derived scores, so re-tuning
the formula never requires re-processing images.

A rejected submission zeroes `Membership.streak`; a verified one increments it. The streak
multiplier caps at +50%.

### Data model

```
User ──< Membership >── Group ──< Drop ──< Submission ── mural_x, mural_y
```

`Membership` is both the join table and the per-group scoreboard (`total_score`, `streak`), so
standings are independent per group. Two unique constraints carry most of the correctness:
`(user_id, group_id)` blocks double-joins, `(user_id, drop_id)` blocks double-submissions.

The mural is **global** — [mural.py](backend/app/services/mural.py) counts all placed tiles across
every group and assigns the next cell in a fixed-width grid.

### Auth

There is none. [deps.py](backend/app/api/deps.py) `current_user()` trusts an `X-User-Id` header;
the frontend auto-creates a `guest-xxxx` user on first load and stores the id in `localStorage`.
Every protected route depends on `CurrentUser`, so replacing this is one function. The WebSocket
route is entirely unauthenticated.

### Frontend

Same-origin in dev — [vite.config.ts](frontend/vite.config.ts) proxies `/api` (with `ws: true`) and
`/uploads` to `:8000`, so the browser only ever talks to `:5173`.

[client.ts](frontend/src/api/client.ts) is the single fetch wrapper: it injects `X-User-Id`, skips
`Content-Type` for `FormData`, and unwraps FastAPI's `detail` field into an `ApiError`. Add new
endpoints as methods on the `api` object rather than calling `fetch` from components.

## Configuration

All tunables are in [backend/app/config.py](backend/app/config.py), overridable via `backend/.env`
(copy `.env.example`). For demos, tighten `DROP_MIN_GAP_SECONDS` / `DROP_MAX_GAP_SECONDS` — or use
the **Drop now** button, which hits `POST /groups/{id}/drops/trigger`.

## Reference

[docs/architecture.md](docs/architecture.md) covers design rationale, the path off single-process,
and an anti-cheat backlog. [docs/api.md](docs/api.md) is the endpoint reference; Swagger is at
`http://127.0.0.1:8000/docs`.
