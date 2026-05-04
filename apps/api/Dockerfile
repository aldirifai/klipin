# Klipin API — Python 3.13 + FFmpeg + uv
FROM python:3.13-slim AS base

# System deps:
#   ffmpeg          — video pipeline
#   libgl1          — required by opencv (mediapipe transitively)
#   libglib2.0-0    — opencv runtime
#   ca-certificates — outbound HTTPS
#   nodejs          — yt-dlp pakai Node buat solve YouTube n-parameter
#                     challenge (kalau gak ada, formats incomplete dan
#                     download fail)
#
# PO Token sendiri di-handle oleh bgutil-pot service terpisah (HTTP-based,
# lihat docker-compose.yml). Itu beda dari n challenge.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    ca-certificates \
    nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install uv (fast Python package manager)
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /uvx /usr/local/bin/

WORKDIR /app

# Install deps (layer caches if pyproject + lock unchanged)
COPY pyproject.toml uv.lock ./
COPY src ./src
RUN uv sync --frozen --no-dev

# App code
COPY alembic ./alembic
COPY alembic.ini ./

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    STORAGE_DIR=/app/storage \
    DATABASE_URL=sqlite+aiosqlite:////app/data/klipin.db

RUN mkdir -p /app/storage/jobs /app/storage/clips /app/storage/transcripts /app/data

EXPOSE 8000

# Run migrations + start uvicorn
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn klipin.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips=*"]
