#!/bin/bash
###############################################################################
# Skyie Forge — Volume bootstrap (one-time + repeatable for code updates).
#
# Runs from your LAPTOP, never the VPS. Uploads the four Forge files
# (serve.py, handler.py, forge-requirements.txt, startup.sh) onto the
# RunPod network volume at /runpod-volume/forge-app/, so on-demand pods
# can boot from the cheap public runpod/pytorch base image and run our
# code from the volume.
#
# Idempotent — safe to re-run any time you want to push fresh code. The
# script generates an ephemeral SSH keypair per run and discards it.
#
# Required env vars (read from current shell):
#   RUNPOD_API_KEY           — your RunPod REST API key
#
# Optional env vars:
#   FORGE_VOLUME_ID          — defaults to 7muboz2qp0 (skyie-studio-storage)
#   FORGE_DC                 — defaults to EUR-IS-1
#
# Usage:
#   ./gpu-server/bootstrap-volume.sh
#
# Cost: ~$0.01 — a single RTX 4000 Ada pod runs for ~2 minutes.
###############################################################################
set -euo pipefail

if [ -z "${RUNPOD_API_KEY:-}" ]; then
    echo "ERROR: RUNPOD_API_KEY not set. Export it from your laptop's env." >&2
    exit 1
fi

VOLUME_ID="${FORGE_VOLUME_ID:-7muboz2qp0}"
DC="${FORGE_DC:-EUR-IS-1}"

# Files we push, mapped from local path → volume filename. The legacy
# always-on pod has its own /workspace/config/startup.sh — to avoid name
# collisions in the local repo we keep ours as forge-startup.sh and
# rename it to startup.sh on the volume (which is what runpod_pods.py's
# dockerStartCmd expects).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
declare -a FILES_LOCAL=(
    "${SCRIPT_DIR}/serve.py"
    "${SCRIPT_DIR}/handler.py"
    "${SCRIPT_DIR}/forge-requirements.txt"
    "${SCRIPT_DIR}/forge-startup.sh"
)
declare -a FILES_REMOTE=(
    "serve.py"
    "handler.py"
    "forge-requirements.txt"
    "startup.sh"
)
for f in "${FILES_LOCAL[@]}"; do
    [ -f "$f" ] || { echo "ERROR: missing $f" >&2; exit 1; }
done

# ── Ephemeral SSH keypair (lives only for this run) ──────────────────────────
TMPDIR="$(mktemp -d -t forge-bootstrap-XXXXXX)"
trap 'rm -rf "${TMPDIR}"' EXIT
KEY="${TMPDIR}/id_ed25519"
ssh-keygen -t ed25519 -f "${KEY}" -N "" -C "skyie-forge-bootstrap" -q
PUBLIC_KEY="$(cat "${KEY}.pub")"
echo "[bootstrap] ephemeral key generated"

# ── Deploy a tiny alpine pod with sshd, volume mounted ───────────────────────
# alpine:3.19 with openssh installed at startup. RunPod's CPU pods aren't
# universally available with networkVolume, so we ask for the cheapest GPU
# (RTX 4000 Ada at $0.26/hr) — script runtime is ~2 min, so cost is ~$0.01.
deploy_payload() {
    cat <<JSON
{
  "name": "forge-bootstrap",
  "imageName": "alpine:3.19",
  "gpuTypeIds": ["NVIDIA RTX 4000 Ada Generation", "NVIDIA RTX A2000", "NVIDIA RTX A4000"],
  "gpuCount": 1,
  "containerDiskInGb": 10,
  "minVCPUPerGPU": 2,
  "minRAMPerGPU": 4,
  "ports": ["22/tcp"],
  "volumeMountPath": "/runpod-volume",
  "networkVolumeId": "${VOLUME_ID}",
  "dataCenterIds": ["${DC}"],
  "env": {"PUBLIC_KEY": $(printf '%s' "${PUBLIC_KEY}" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))")},
  "dockerStartCmd": [
    "sh", "-c",
    "apk add --no-cache openssh-server openssh-client >/dev/null && ssh-keygen -A && mkdir -p /root/.ssh && printf '%s\n' \"\$PUBLIC_KEY\" > /root/.ssh/authorized_keys && chmod 700 /root/.ssh && chmod 600 /root/.ssh/authorized_keys && /usr/sbin/sshd -D -e"
  ]
}
JSON
}

echo "[bootstrap] deploying alpine pod (volume=${VOLUME_ID} dc=${DC})"
DEPLOY_RESP="$(curl -sS -X POST \
    -H "Authorization: Bearer ${RUNPOD_API_KEY}" \
    -H "Content-Type: application/json" \
    -H "User-Agent: skyie-forge-bootstrap/1.0" \
    --data "$(deploy_payload)" \
    https://rest.runpod.io/v1/pods)"

POD_ID="$(printf '%s' "${DEPLOY_RESP}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id',''))")"
if [ -z "${POD_ID}" ]; then
    echo "ERROR: pod deploy failed:" >&2
    echo "${DEPLOY_RESP}" >&2
    exit 1
fi
echo "[bootstrap] pod ${POD_ID} deployed"

# Make sure we always tear down, even on failure
cleanup_pod() {
    if [ -n "${POD_ID}" ]; then
        echo "[bootstrap] terminating pod ${POD_ID}"
        curl -sS -X DELETE \
            -H "Authorization: Bearer ${RUNPOD_API_KEY}" \
            -H "User-Agent: skyie-forge-bootstrap/1.0" \
            "https://rest.runpod.io/v1/pods/${POD_ID}" \
            -o /dev/null -w "  HTTP %{http_code}\n" || true
    fi
    rm -rf "${TMPDIR}"
}
trap cleanup_pod EXIT

# ── Wait for the pod's public SSH endpoint to come up ────────────────────────
# Pod starts → image pulls (alpine ~5 MB, fast) → dockerStartCmd installs
# sshd and starts it → public port shows up in /v1/pods/<id>. Poll.
echo "[bootstrap] waiting for pod sshd (up to 4 min)..."
PUBLIC_IP=""; PUBLIC_PORT=""
for i in $(seq 1 48); do
    sleep 5
    RESP="$(curl -sS \
        -H "Authorization: Bearer ${RUNPOD_API_KEY}" \
        -H "User-Agent: skyie-forge-bootstrap/1.0" \
        "https://rest.runpod.io/v1/pods/${POD_ID}")"
    eval "$(printf '%s' "${RESP}" | python3 -c "
import json, sys
d = json.load(sys.stdin)
ports = (d.get('runtime') or {}).get('ports') or d.get('portMappings') or []
for p in ports:
    if (p.get('privatePort') == 22 or p.get('internalPort') == 22) and p.get('isIpPublic'):
        print('PUBLIC_IP=' + str(p.get('ip','')))
        print('PUBLIC_PORT=' + str(p.get('publicPort') or p.get('externalPort','')))
        break
")"
    if [ -n "${PUBLIC_IP}" ] && [ -n "${PUBLIC_PORT}" ]; then
        echo "[bootstrap] pod ssh endpoint: ${PUBLIC_IP}:${PUBLIC_PORT}"
        break
    fi
    [ $((i % 6)) -eq 0 ] && echo "[bootstrap] still waiting... (${i}/48)"
done

if [ -z "${PUBLIC_IP}" ] || [ -z "${PUBLIC_PORT}" ]; then
    echo "ERROR: pod never exposed public SSH endpoint" >&2
    exit 1
fi

# Give sshd a few extra seconds to actually accept connections
sleep 5

SSH_OPTS=(
    -i "${KEY}"
    -o "StrictHostKeyChecking=no"
    -o "UserKnownHostsFile=/dev/null"
    -o "ConnectTimeout=15"
    -o "LogLevel=ERROR"
    -p "${PUBLIC_PORT}"
)

# ── Push the four files ──────────────────────────────────────────────────────
echo "[bootstrap] preparing /runpod-volume/forge-app/"
ssh "${SSH_OPTS[@]}" "root@${PUBLIC_IP}" "mkdir -p /runpod-volume/forge-app"

for i in "${!FILES_LOCAL[@]}"; do
    local_path="${FILES_LOCAL[$i]}"
    remote_name="${FILES_REMOTE[$i]}"
    echo "[bootstrap] uploading $(basename "${local_path}") -> /runpod-volume/forge-app/${remote_name}"
    scp "${SSH_OPTS[@]}" "${local_path}" "root@${PUBLIC_IP}:/runpod-volume/forge-app/${remote_name}"
done

ssh "${SSH_OPTS[@]}" "root@${PUBLIC_IP}" "chmod +x /runpod-volume/forge-app/startup.sh"

# Stamp the upload so serve.py can log "code-version=<sha>" later if we want
GIT_SHA="$(git -C "${SCRIPT_DIR}/.." rev-parse --short HEAD 2>/dev/null || echo unknown)"
ssh "${SSH_OPTS[@]}" "root@${PUBLIC_IP}" "echo '${GIT_SHA} $(date -u +%Y-%m-%dT%H:%M:%SZ)' > /runpod-volume/forge-app/.version"

echo "[bootstrap] verify ──────────────────────────────────────────────────"
ssh "${SSH_OPTS[@]}" "root@${PUBLIC_IP}" "ls -la /runpod-volume/forge-app/"

echo "[bootstrap] DONE. Volume populated. Next click of Connect will use it."
# cleanup_pod runs via trap
