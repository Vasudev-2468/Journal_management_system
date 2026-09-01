# Multi-stage Dockerfile for the JGAIR backend on Fly.io.
#
# Stage 1 (builder) installs Python deps into a virtualenv.
# Stage 2 (runtime) copies only the venv + app source into a slim base
# so the shipped image doesn't carry build-essential.
#
# Fly uses the buildpacks-style ports convention where the app should
# listen on $PORT (fly.toml sets it to 8080). We run gunicorn with
# uvicorn workers so we can scale vertically without adding a process
# manager.
#
# Build context is the repo root (Fly passes it that way); the backend
# source lives at ./backend/.

# ─── Stage 1: builder ────────────────────────────────────────
FROM python:3.11-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Create the venv the runtime stage will copy.
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY backend/requirements.txt /build/requirements.txt

# gunicorn is not in requirements.txt because the local dev flow uses
# uvicorn directly. Add it here just for the Fly image.
RUN pip install --upgrade pip \
    && pip install -r /build/requirements.txt \
    && pip install "gunicorn>=22,<24"

# ─── Stage 2: runtime ────────────────────────────────────────
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    PORT=8080

WORKDIR /app

# Only the runtime libpq is needed — build-essential stays behind.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
        curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1000 app \
    && useradd  --system --uid 1000 --gid app --home /app --shell /usr/sbin/nologin app

COPY --from=builder /opt/venv /opt/venv

# Copy the backend source tree. Everything under ./backend/ is expected
# to be readable by the `app` user.
COPY --chown=app:app backend/ /app/

USER app

EXPOSE 8080

# gunicorn manages the master + worker lifecycle; uvicorn workers do
# the async serving. 4 workers × 512 MB VM is generous — drop to 2 if
# you hit OOM. --forwarded-allow-ips="*" trusts Fly's proxy for
# X-Forwarded-* headers so scheme/IP are correct behind the edge.
CMD ["gunicorn", \
     "app.main:app", \
     "--bind", "0.0.0.0:8080", \
     "--workers", "4", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--timeout", "60", \
     "--graceful-timeout", "30", \
     "--keep-alive", "5", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "--forwarded-allow-ips=*"]
