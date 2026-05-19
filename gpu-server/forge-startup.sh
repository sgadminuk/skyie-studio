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

# Sentinel file written at the END of a successful install. If absent,
# the venv is either fresh or aborted mid-install (RunPod's startup
# timeout silently kills long pip runs). We always nuke + rebuild from
# scratch in that case — partial venvs caused `runpod`/`diffusers` to
# be missing for hours of debugging.
VENV_SENTINEL="${VENV_DIR}/.install-complete"

if [ ! -f "${VENV_SENTINEL}" ]; then
    echo "[startup] Venv missing or incomplete — wiping and rebuilding"
    rm -rf "${VENV_DIR}"
    # --system-site-packages lets the venv see the base image's torch +
    # CUDA wheels (runpod/pytorch ships them). Without this flag, pip
    # would re-download torch into the venv (~3 GB, ~10 min) on top of
    # the other deps and likely hit the worker startup timeout.
    "${PYTHON_BIN}" -m venv --system-site-packages "${VENV_DIR}"
    echo "[startup] Installing pip requirements (~2-3 min)"
    "${VENV_DIR}/bin/pip" install --upgrade pip
    "${VENV_DIR}/bin/pip" install --no-cache-dir -r "${APP_DIR}/forge-requirements.txt"
    # Sanity-check the critical imports before declaring victory.
    "${VENV_DIR}/bin/python" -c "import runpod, diffusers, transformers, torch; print(f'venv ok: runpod={runpod.__version__} diffusers={diffusers.__version__} torch={torch.__version__}')"
    touch "${VENV_SENTINEL}"
    echo "[startup] Venv ready"
else
    echo "[startup] Reusing complete venv at ${VENV_DIR}"
fi

# Make sure HF cache env vars point at the volume — the legacy serverless
# attempts wrote FLUX-dev there at /runpod-volume/models/.hf_cache/hub.
# handler.py reads these and skips redownload when the cache is warm.
export HF_HOME="/runpod-volume/models/.hf_cache"
export HF_HUB_CACHE="/runpod-volume/models/.hf_cache/hub"
export TRANSFORMERS_CACHE="/runpod-volume/models/.hf_cache/hub"
mkdir -p "${HF_HUB_CACHE}"

# FORGE_MODE selects which Python entrypoint to run:
#   serverless → handler.py, which calls runpod.serverless.start({"handler": ...})
#                and enters RunPod's queue worker loop (per-request workers)
#   server     → serve.py, a long-lived FastAPI shim on :8888 for the warm-pod
#                Connect/Disconnect path (default if env var unset)
if [ "${FORGE_MODE:-server}" = "serverless" ]; then
    echo "[startup] Launching RunPod Serverless worker (handler.py)"
    exec "${VENV_DIR}/bin/python" -u "${APP_DIR}/handler.py"
else
    echo "[startup] Launching FastAPI shim on :${FORGE_SERVE_PORT:-8888}"
    exec "${VENV_DIR}/bin/python" -u "${APP_DIR}/serve.py"
fi
