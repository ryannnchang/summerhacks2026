# Architecture notes

## Request flow

```
React (Vite :5173)
  │  /api/*      ─── proxied ──►  FastAPI (:8000)
  │  /uploads/*  ─── proxied ──►  StaticFiles
  │  ws://…/api/ws/groups/{id}                │
  └────────────────────────────────────────►  ConnectionManager
                                              │
                          drop_scheduler (asyncio task, 5s tick)
                                              │
                                       SQLite via SQLAlchemy
```

The Vite proxy means the app is same-origin in development, so there are no CORS preflights and
the WebSocket URL is derived from `location.host`. CORS is still configured on the backend for the
case where you deploy the two halves to different hosts.

## Why these choices

**SQLite.** Zero setup, one file, and the schema is small enough that moving to Postgres is a
connection-string change (`DATABASE_URL`). Nothing in the models is SQLite-specific.

One wrinkle to know about: SQLite doesn't store timezones, so datetimes come back naive. Every
read of a stored timestamp goes through `as_utc()` in `drop_scheduler.py`, which stamps them UTC.
Skipping that gives you `can't subtract offset-naive and offset-aware datetimes` at runtime.

**An in-process scheduler, not Celery.** The work is a 5-second tick over a handful of rows. A
broker, a worker, and a beat process would be three more things to keep alive during a demo. The
tradeoff is that this only works with **one** uvicorn worker — two workers means two schedulers
racing to activate the same drop.

**Heuristic grass verification.** A CLIP or MobileNet classifier would be more accurate, but it's a
model download, a cold-start delay, and an inference dependency. The HSV + edge-energy approach
runs in single-digit milliseconds and is legible enough to tune live when a judge holds up a
houseplant. `verify_grass()` returns a `GrassResult`; anything that returns that shape can replace
it without touching the route.

## Data model

```
User ──< Membership >── Group ──< Drop ──< Submission
                                             │
                                    mural_x, mural_y
```

`Membership` is the join table *and* the per-group scoreboard — `total_score` and `streak` live
there, so a user's standing in one group is independent of another. Two uniqueness constraints
carry most of the correctness: `(user_id, group_id)` prevents double-joins, and
`(user_id, drop_id)` prevents double-submissions.

`Submission` stores the verifier's raw signals (`grass_coverage`, `texture_score`) alongside the
derived scores. That means re-tuning the scoring formula later doesn't require re-processing
images.

## Scoring

```
speed   = 100 if response ≤ 120s, else linear decay to 0 at the deadline
quality = 60·coverage + 25·texture + 15·vibrance   (each clamped)
total   = (0.6·quality + 0.4·speed) × (1 + 0.05·min(streak, 10))
```

The weights are deliberately in one file with no callers depending on the numbers. A rejected
submission zeroes the streak, which is what makes the multiplier feel risky.

## Replacing the auth stand-in

`current_user()` in `api/deps.py` trusts an `X-User-Id` header. Anyone can claim to be anyone.
It's isolated to one dependency function on purpose — every protected route depends on
`CurrentUser`, so swapping it is a single edit:

1. Add a `password_hash` column and hash with `argon2-cffi` or `bcrypt`.
2. Issue a signed JWT (`pyjwt`) or a server-side session on login.
3. Rewrite `current_user()` to verify the token and return the `User`.
4. Authenticate the WebSocket too — pass the token as a query parameter and verify it in
   `group_socket()` before `manager.connect()`. That route is currently unauthenticated, so
   anyone who knows a group id can watch its feed.

## Scaling past one process

1. Replace `ConnectionManager` with Redis pub/sub so any worker can broadcast to any client.
2. Move drop activation behind a lock (`SELECT … FOR UPDATE` on Postgres) or into a single leader
   process, so exactly one worker flips a given drop.
3. Move uploads to S3/R2 — reimplement `save_image()` in `app/storage/`, which is the only place
   that touches the disk.

## Anti-cheat, if you want it

The verifier answers "is this grass," not "did you actually go outside just now." Ordered by
effort:

- Read EXIF `DateTimeOriginal` and reject anything captured before the drop opened. Cheap, and it
  kills the camera-roll re-upload.
- Perceptual-hash submissions and reject near-duplicates of previous entries.
- Ask for geolocation at capture time and store it; show group members a map.
- Require a random word written on paper in frame — annoying, but it works.
