# =============================================================================
# Skyie Studio — Backend (FastAPI + Celery)
# Multi-stage build for minimal production image
# =============================================================================

FROM python:3.12-slim AS base

# System dependencies (FFmpeg for video processing, curl for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create storage directories
RUN mkdir -p /app/assets/avatars /app/assets/voices /app/assets/generated /app/temp

# Non-root user for security
RUN groupadd -r skyie && useradd -r -g skyie -d /app skyie \
    && chown -R skyie:skyie /app
USER skyie

EXPOSE 8000

# Default: run the API server
# 4 workers, 120s timeout (GPU inference can take minutes), graceful shutdown
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4", "--timeout-keep-alive", "120", "--limit-max-requests", "10000"]
