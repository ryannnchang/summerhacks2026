#!/usr/bin/env bash
# Runs the API and the Vite dev server together. Ctrl-C stops both.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- dependencies ------------------------------------------------------------
# Installs are keyed to a checksum of the manifest rather than to the mere
# existence of .venv/ or node_modules/. Guarding on existence meant that a
# dependency added after the tree was first built never got installed, and the
# failure surfaced much later as a bare ModuleNotFoundError / "Failed to resolve
# import" from a process that had already scrolled its real error off-screen.

VENV="$ROOT/backend/.venv"
if [[ ! -d "$VENV" ]]; then
  echo "==> Creating backend virtualenv"
  python3 -m venv "$VENV"
fi

req_stamp="$VENV/.requirements.sha"
req_sum="$(shasum "$ROOT/backend/requirements.txt" | awk '{print $1}')"
if [[ ! -f "$req_stamp" || "$(cat "$req_stamp")" != "$req_sum" ]]; then
  echo "==> Installing backend dependencies"
  "$VENV/bin/pip" install -q -r "$ROOT/backend/requirements.txt"
  echo "$req_sum" > "$req_stamp"
fi

NODE_MODULES="$ROOT/frontend/node_modules"
pkg_stamp="$NODE_MODULES/.package.sha"
pkg_sum="$(shasum "$ROOT/frontend/package.json" | awk '{print $1}')"
if [[ ! -d "$NODE_MODULES" || ! -f "$pkg_stamp" || "$(cat "$pkg_stamp")" != "$pkg_sum" ]]; then
  echo "==> Installing frontend dependencies"
  (cd "$ROOT/frontend" && npm install)
  echo "$pkg_sum" > "$pkg_stamp"
fi

# --- ports -------------------------------------------------------------------
# A leftover process from an earlier run is the most common reason a half fails
# to start, and uvicorn's one-line "Address already in use" is easy to miss.

if lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "!! Port 8000 is already in use — the API cannot start:"
  lsof -nP -iTCP:8000 -sTCP:LISTEN | tail -n +2 | sed 's/^/     /'
  echo "   Stop it with: pkill -f 'uvicorn app.main:app'"
  exit 1
fi

if lsof -nP -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "!! Port 5173 is in use; Vite will fall back to another port."
  lsof -nP -iTCP:5173 -sTCP:LISTEN | tail -n +2 | sed 's/^/     /'
fi

# --- run ---------------------------------------------------------------------

cleanup() {
  trap - EXIT INT TERM
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "==> API      http://127.0.0.1:8000/docs"
(cd "$ROOT/backend" && exec .venv/bin/uvicorn app.main:app --reload --port 8000) &
api=$!

echo "==> Frontend http://127.0.0.1:5173"
(cd "$ROOT/frontend" && exec npm run dev) &
web=$!

# macOS ships bash 3.2, which has no `wait -n`, so poll both children instead.
# Either half dying makes the other useless — a live frontend proxying to a dead
# API just renders errors, which reads as a frontend bug and wastes the search.
while kill -0 "$api" 2>/dev/null && kill -0 "$web" 2>/dev/null; do
  sleep 1
done

kill -0 "$api" 2>/dev/null || echo "!! The API exited — its error is above. Shutting down."
kill -0 "$web" 2>/dev/null || echo "!! The frontend exited — its error is above. Shutting down."
