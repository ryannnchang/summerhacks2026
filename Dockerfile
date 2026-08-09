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
WORKDIR /build

# VITE_* values are compiled INTO the bundle — they must exist at build time,
# not run time. Render/Fly pass service env vars into Docker builds for any
# ARG declared here. All three are public client-side values (anon key, map
# token), not secrets.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_MAPBOX_TOKEN
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN

COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# vite.config.ts reads env from '..' in dev; in the image the ARG-derived ENV
# vars above are what import.meta.env picks up.
RUN npm run build

# ---- Stage 2: backend runtime ------------------------------------------------
FROM python:3.12-slim
WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY --from=web /build/dist ./static

EXPOSE 8000

# Shell form so $PORT (set by Render/Fly/Railway) expands; 8000 for local runs.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1
