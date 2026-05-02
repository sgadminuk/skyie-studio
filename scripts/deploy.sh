#!/bin/bash
###############################################################################
# Deployment Script for Skyie Studio
# Run on the VPS to build and deploy all services
###############################################################################

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo "Project directory: $PROJECT_DIR"

# ── Pre-flight checks ──────────────────────────────────────────────────────

if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo "Error: .env file not found"
    echo "Create .env from .env.example and set production values"
    exit 1
fi

# ── Build and deploy ──────────────────────────────────────────────────────

echo "Building and deploying with Docker Compose..."
docker compose --env-file .env build --no-cache

echo "Starting containers..."
if ! docker compose --env-file .env up -d; then
    echo "Docker compose up failed. Fetching logs..."
    echo "=== Backend logs ==="
    docker logs skyie-studio-backend 2>&1 || echo "No backend logs"
    echo "=== Worker logs ==="
    docker logs skyie-studio-worker 2>&1 || echo "No worker logs"
    echo "=== Frontend logs ==="
    docker logs skyie-studio-frontend 2>&1 || echo "No frontend logs"
    exit 1
fi

# ── Health checks ─────────────────────────────────────────────────────────

echo "Waiting for services to become healthy..."

check_container_health() {
    local container=$1
    local max_wait=$2
    local elapsed=0

    while [ $elapsed -lt $max_wait ]; do
        status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "not_found")
        case $status in
            "healthy")
                echo "$container is healthy"
                return 0
                ;;
            "unhealthy")
                echo "$container is unhealthy"
                docker logs "$container" --tail 50
                return 1
                ;;
            "starting")
                echo "$container is starting... ($elapsed/${max_wait}s)"
                ;;
            *)
                echo "Waiting for $container... (status: $status)"
                ;;
        esac
        sleep 10
        elapsed=$((elapsed + 10))
    done

    echo "Timeout waiting for $container"
    docker logs "$container" --tail 100
    return 1
}

echo "Checking PostgreSQL..."
check_container_health "skyie-studio-postgres" 60 || exit 1

echo "Checking Redis..."
check_container_health "skyie-studio-redis" 30 || exit 1

echo "Checking Backend..."
check_container_health "skyie-studio-backend" 120 || exit 1

echo "Checking Frontend..."
check_container_health "skyie-studio-frontend" 90 || exit 1

# ── Run migrations ────────────────────────────────────────────────────────
# Migrations MUST succeed. The previous version of this script swallowed
# failures with `|| echo warning` and once silently shipped a deploy where
# the new code referenced a column the DB didn't have — broke login until
# a manual upgrade was run. We now fail the deploy if alembic fails.

echo "Running database migrations..."
if ! docker exec skyie-studio-backend alembic upgrade head; then
    echo "FATAL: alembic upgrade head failed. Deploy aborting." >&2
    echo "  Diagnose with: docker exec skyie-studio-backend alembic current" >&2
    echo "  Available heads: docker exec skyie-studio-backend alembic heads" >&2
    exit 1
fi
echo "Migrations applied. Current revision:"
docker exec skyie-studio-backend alembic current

# ── Verify endpoints ─────────────────────────────────────────────────────

echo "Verifying API health..."
max_retries=5
retry_count=0
while [ $retry_count -lt $max_retries ]; do
    if docker exec skyie-studio-backend curl -sf http://localhost:8000/api/v1/health > /dev/null 2>&1; then
        echo "API is responding"
        break
    else
        retry_count=$((retry_count + 1))
        echo "Waiting for API... (attempt $retry_count/$max_retries)"
        sleep 5
    fi
done

if [ $retry_count -eq $max_retries ]; then
    echo "Warning: API not responding after $max_retries attempts"
fi

# ── Status ────────────────────────────────────────────────────────────────

echo ""
echo "Container Status:"
docker ps --filter "name=skyie-studio" --format "table {{.Names}}\t{{.Status}}"

# ── Cleanup ───────────────────────────────────────────────────────────────

echo "Cleaning up old Docker images..."
docker image prune -f

echo ""
echo "Deployment completed successfully"
