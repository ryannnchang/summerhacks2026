#!/usr/bin/env bash
# Runs the API and the Vite dev server together. Ctrl-C stops both.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -d "$ROOT/backend/.venv" ]]; then
  echo "==> Creating backend virtualenv"
  python3 -m venv "$ROOT/backend/.venv"
  "$ROOT/backend/.venv/bin/pip" install -q -r "$ROOT/backend/requirements.txt"
fi

if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  echo "==> Installing frontend dependencies"
  (cd "$ROOT/frontend" && npm install)
fi

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "==> API      http://127.0.0.1:8000/docs"
(cd "$ROOT/backend" && .venv/bin/uvicorn app.main:app --reload --port 8000) &

echo "==> Frontend http://127.0.0.1:5173"
(cd "$ROOT/frontend" && npm run dev) &

wait
