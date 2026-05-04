# Klipin API — Python 3.13 + FFmpeg + uv + Node (for yt-dlp PO Token plugin)
FROM python:3.13-slim AS base

# System deps:
#   ffmpeg          — video pipeline
#   libgl1          — required by opencv (mediapipe transitively)
#   libglib2.0-0    — opencv runtime
#   ca-certificates — outbound HTTPS (Replicate, Anthropic, Midtrans, YouTube)
#   curl, gnupg     — buat install Node.js dari NodeSource
#
# Node.js 22 LTS dari NodeSource (debian repo punya v18 yang udah ketinggalan).
# Node dibutuhkan oleh bgutil-ytdlp-pot-provider — plugin yt-dlp yang
# auto-generate YouTube PO Token (anti-bot bypass per Q4 2025).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    ca-certificates \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# bgutil PO Token generator (Node.js script). yt-dlp plugin nanti panggil
# command `bgutil-pot` ini per-request buat dapet token.
RUN npm install -g bgutil-ytdlp-pot-provider

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
