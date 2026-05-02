#!/bin/bash
###############################################################################
# Skyie Forge — On-demand pod boot script.
#
# This script lives on the network volume at /runpod-volume/forge-app/.
# RunPod pods are deployed with the public runpod/pytorch base image and
# dockerStartCmd = ["bash", "/runpod-volume/forge-app/startup.sh"].
#
# Why it lives on the volume instead of being baked into a custom image:
#   - Custom images on ghcr.io stalled on every pull from RunPod EUR-IS-1
#     (3-4 GB images apparently don't survive that path reliably). The
#     base image is on RunPod's own infrastructure and pulls in seconds.
#   - Volume-stored code lets us update without a CI rebuild cycle.
#
# Lifecycle on each boot:
#   1. cd to forge-app/ on the volume
#   2. If venv/ doesn't exist yet, create it and pip-install the requirements
#      (~3 minutes, one-time per volume — subsequent pods reuse)
#   3. exec serve.py (FastAPI shim that wraps handler.py for /run + /health)
#
# Required env vars (passed by backend's runpod_pods.deploy_pod):
#   GPU_API_KEY               — shared bearer between backend and pod /run
#   GPU_REGISTRATION_KEY      — pod uses this to call /api/internal/gpu-register
#   SKYIE_BACKEND_URL         — defaults to https://api.skyie.studio
#   HF_TOKEN                  — gated FLUX-dev download (only on first cache miss)
###############################################################################
set -e

APP_DIR="/runpod-volume/forge-app"
VENV_DIR="${APP_DIR}/venv"

cd "${APP_DIR}"

# Make sure a Python is available. RunPod's pytorch base image ships with
# python3.11 at /usr/bin/python3.
PYTHON_BIN="$(command -v python3.11 || command -v python3)"
if [ -z "${PYTHON_BIN}" ]; then
    echo "FATAL: no python3 found in pod" >&2
    exit 1
fi

if [ ! -x "${VENV_DIR}/bin/python" ]; then
    echo "[startup] First boot on this volume — creating venv at ${VENV_DIR}"
    "${PYTHON_BIN}" -m venv "${VENV_DIR}"
    echo "[startup] Installing pip requirements (~3 min, one-time)"
    "${VENV_DIR}/bin/pip" install --upgrade pip
    "${VENV_DIR}/bin/pip" install --no-cache-dir -r "${APP_DIR}/forge-requirements.txt"
    echo "[startup] Venv ready"
else
    echo "[startup] Reusing existing venv at ${VENV_DIR}"
fi

# Make sure HF cache env vars point at the volume — the legacy serverless
# attempts wrote FLUX-dev there at /runpod-volume/models/.hf_cache/hub.
# handler.py reads these and skips redownload when the cache is warm.
export HF_HOME="/runpod-volume/models/.hf_cache"
export HF_HUB_CACHE="/runpod-volume/models/.hf_cache/hub"
export TRANSFORMERS_CACHE="/runpod-volume/models/.hf_cache/hub"
mkdir -p "${HF_HUB_CACHE}"

echo "[startup] Launching FastAPI shim on :${FORGE_SERVE_PORT:-8888}"
exec "${VENV_DIR}/bin/python" -u "${APP_DIR}/serve.py"
