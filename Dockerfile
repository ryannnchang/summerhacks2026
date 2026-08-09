# Touch Grass — one container, both halves.
#
# Stage 1 builds the Vite bundle; stage 2 is the FastAPI runtime serving that
# bundle same-origin (see _SPAStaticFiles in backend/app/main.py). Same-origin
# is load-bearing: the API base, the WebSocket URL and legacy /uploads paths
# are all relative.
#
# Run with exactly ONE worker. The drop scheduler and the WebSocket registry
# live in process memory — a second worker means duplicate drops.

# ---- Stage 1: frontend build -------------------------------------------------
FROM node:20-slim AS web
WORKDIR /src/frontend

# VITE_* values are compiled INTO the bundle at build time and come from the
# committed .env.production (all three are public client-side values — anon
# key, map token — not secrets). Deliberately NOT ARG-overridable: declaring
# unset ARGs as ENV exports them as *empty strings*, and Vite lets process env
# outrank .env files — which silently blanked every value and shipped a bundle
# that throws on load. One source of truth, the file.

COPY frontend/package*.json ./
RUN npm ci
# vite.config.ts reads env from '..' — the same layout as the repo checkout.
COPY .env.production /src/
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: backend runtime ------------------------------------------------
FROM python:3.12-slim
WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY --from=web /src/frontend/dist ./static

EXPOSE 8000

# Shell form so $PORT (set by Render/Fly/Railway) expands; 8000 for local runs.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1
