# API reference

Base path `/api`. Interactive docs at http://127.0.0.1:8000/docs while the server runs.

Every authenticated route reads the caller's identity from the `X-User-Id` header. Routes marked
**member** additionally require that the caller belongs to the group in the path (403 otherwise).

> The frontend does not send that header yet, so everything except `/map/patches` and `/mural`
> returns 401 from the browser today. Use `/docs` or curl to exercise the rest.

## Users

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/users` | — | `{username, display_name?}` → 201. 409 if taken. |
| GET | `/users/by-username/{username}` | — | Stand-in for sign-in. |
| GET | `/users/me` | user | 401 if the header is missing or unknown. |
| GET | `/users/me/submissions` | user | Newest first, `?limit=` up to 200. |

## Groups

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/groups` | user | `{name}` → creates the group, adds you, queues the first drop. |
| GET | `/groups` | user | Groups you belong to. |
| POST | `/groups/join` | user | `{join_code}` — case-insensitive. |
| GET | `/groups/{id}` | member | Includes members sorted by score. |
| POST | `/groups/{id}/members/{username}` | member | Any member can add a friend. Idempotent. |
| DELETE | `/groups/{id}/members/{user_id}` | member | Owner removes anyone; you can remove yourself. The owner can't leave. |
| GET | `/groups/{id}/leaderboard` | member | Ranked, with streaks and submission counts. |

## Drops

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/groups/{id}/drops/current` | member | The live drop, else the next pending one. Carries `seconds_remaining` and `has_submitted`. |
| GET | `/groups/{id}/drops` | member | History, newest first. |
| POST | `/groups/{id}/drops/trigger` | member | Fires a drop immediately. 409 if one is already live. |

### WebSocket `/api/ws/groups/{id}`

Send any text as a heartbeat; the server ignores the content. Frames received:

```jsonc
{"type": "connected",  "group_id": 1}
{"type": "drop.started", "drop_id": 3, "expires_at": "...", "triggered_by": "ryan"}
{"type": "drop.closed",  "drop_id": 3}
{"type": "submission.created", "submission_id": 9, "username": "sam",
 "total_score": 92.3, "thumbnail_url": "/uploads/..."}
```

The client reconnects automatically after 3s — see `useGroupSocket`.

## Submissions

**POST** `/groups/{gid}/drops/{did}/submissions` — member, `multipart/form-data` with a `photo`
field. One submission per person per drop.

| Status | Meaning |
| --- | --- |
| 201 | Accepted and scored. Check `status` in the body: `verified` or `rejected`. |
| 409 | The drop isn't open, or you already submitted. |
| 413 | Over 10 MB. |
| 415 | Not a JPEG/PNG/WebP/HEIC. |

A **rejected** submission still returns 201 — the upload succeeded, the grass didn't. It carries a
`reject_reason`, breaks your streak, scores nothing, and never reaches the mural.

```jsonc
{
  "id": 1, "status": "verified", "reject_reason": null,
  "grass_coverage": 0.98, "texture_score": 0.31,
  "quality_score": 87.17, "speed_score": 100.0, "total_score": 92.3,
  "response_seconds": 4.2,
  "image_url": "/uploads/submissions/<key>.jpg",
  "thumbnail_url": "/uploads/submissions/<key>_thumb.jpg"
}
```

**GET** `/groups/{gid}/drops/{did}/submissions` — member. Everyone's entries, best score first.

## Map

**GET** `/map/patches?limit=&since_hours=` — public, no auth. Verified submissions that carried
coordinates. `center` comes from `MAP_CENTER_LAT` / `MAP_CENTER_LNG` (Toronto by default), so the
frontend doesn't hardcode the city.

```jsonc
{
  "center": [43.6532, -79.3832],
  "patch_count": 1,
  "patches": [{"submission_id": 1, "latitude": 43.6465, "longitude": -79.413,
               "thumbnail_url": "...", "username": "mapper",
               "total_score": 92.3, "quality_score": 87.17, "submitted_at": "..."}]
}
```

Coordinates arrive as optional `latitude` / `longitude` form fields on submission. Without them the
entry scores normally and reaches the mural — it just never appears here.

## Mural

**GET** `/mural?limit=&offset=` — public. Every verified tile from every group.

```jsonc
{
  "columns": 24, "rows": 1, "tile_count": 2,
  "tiles": [{"submission_id": 1, "x": 0, "y": 0, "thumbnail_url": "...",
             "username": "ryan", "dominant_color": "#2d8c25",
             "total_score": 92.3, "submitted_at": "..."}]
}
```

Images are served as static files from `/uploads/...` (not under `/api`).
