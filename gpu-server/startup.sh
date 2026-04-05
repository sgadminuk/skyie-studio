#!/bin/bash
###############################################################################
# Skyie Studio GPU Pod — Fully Automated Start Script
#
# SET THIS AS RUNPOD "DOCKER COMMAND / START COMMAND":
#   bash /workspace/config/startup.sh
#
# On every pod boot, this script:
#   1. Installs packages (idempotent)
#   2. Starts GPU inference server
#   3. Auto-detects pod ID
#   4. Updates pod ID in GitHub Secrets
#   5. Triggers VPS deployment workflow
#   6. Registers with VPS backend
#   7. Starts persistent heartbeat
#
# /workspace is persistent network storage — survives pod recreation.
# Zero manual steps required.
###############################################################################

set -euo pipefail

LOG="/workspace/logs/startup.log"
mkdir -p /workspace/logs

exec > >(tee -a "$LOG") 2>&1
echo ""
echo "========================================="
echo "  Skyie Studio GPU — $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "========================================="

# ── Fix DNS (RunPod Docker DNS can't resolve .studio TLD) ────────────────────
grep -q "8.8.8.8" /etc/resolv.conf || echo -e "nameserver 8.8.8.8\nnameserver 1.1.1.1" >> /etc/resolv.conf

# ── Load config from persistent storage ──────────────────────────────────────
source /workspace/config/.env

# ── Auto-detect Pod ID ───────────────────────────────────────────────────────
if [ -z "${RUNPOD_POD_ID:-}" ]; then
    RUNPOD_POD_ID=$(hostname | head -c 14)
    echo "  Pod ID (from hostname): $RUNPOD_POD_ID"
else
    echo "  Pod ID (from env): $RUNPOD_POD_ID"
fi
export RUNPOD_POD_ID
GPU_URL="https://${RUNPOD_POD_ID}-8080.proxy.runpod.net"

# ── 1. Install packages ─────────────────────────────────────────────────────
echo "[1/6] Checking system packages..."
NEED_UPDATE=0
for pkg in redis-server fail2ban git-lfs tmux htop ffmpeg; do
    which "$pkg" >/dev/null 2>&1 || NEED_UPDATE=1
done
if [ "$NEED_UPDATE" = "1" ]; then
    apt-get update -qq 2>/dev/null
    apt-get install -y -qq redis-server fail2ban git-lfs tmux htop ffmpeg 2>&1 | tail -3
fi
echo "  Packages OK"

# ── 2. Install Python deps ──────────────────────────────────────────────────
echo "[2/6] Checking Python packages..."
python3 -c "import fastapi, uvicorn, diffusers, transformers" 2>/dev/null || {
    echo "  Installing Python deps..."
    pip install --break-system-packages -q \
        fastapi 'uvicorn[standard]' python-multipart aiofiles httpx \
        diffusers transformers accelerate safetensors 2>&1 | tail -3
}
echo "  Python packages OK"

# ── 3. Start services ───────────────────────────────────────────────────────
echo "[3/6] Starting services..."
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
service ssh restart 2>/dev/null || true

redis-server --daemonize yes --save "" --appendonly no 2>/dev/null
redis-cli ping >/dev/null && echo "  Redis: OK"

touch /var/log/auth.log
cat > /etc/fail2ban/jail.local << 'F2B'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3
[sshd]
enabled = true
port = 22
logpath = /var/log/auth.log
maxretry = 3
F2B
fail2ban-server -b 2>/dev/null || true
echo "  fail2ban: OK"

# ── 4. Start GPU inference server ────────────────────────────────────────────
echo "[4/6] Starting GPU server..."
tmux kill-session -t gpu-server 2>/dev/null || true
tmux new-session -d -s gpu-server \
    "cd /workspace && GPU_API_KEY=${GPU_API_KEY:-change-me-in-production} VRAM_LIMIT_GB=30.0 python3 server.py 2>&1 | tee /workspace/logs/gpu-server.log"

for i in $(seq 1 30); do
    curl -sf http://localhost:8080/health > /dev/null 2>&1 && break
    sleep 2
done
curl -sf http://localhost:8080/health > /dev/null 2>&1 \
    && echo "  GPU server: healthy" \
    || echo "  GPU server: FAILED TO START"

python3 -c "import torch; print(f'  GPU: {torch.cuda.get_device_name(0)} | VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB')" 2>/dev/null || echo "  GPU: not available"

# ── 5. Update Pod ID in GitHub & trigger deploy ──────────────────────────────
echo "[5/6] Updating GitHub with new Pod ID..."
GH_TOKEN="${GITHUB_PAT:-}"
GH_REPO="${GITHUB_REPO:-sgadminuk/skyie-studio}"

if [ -n "$GH_TOKEN" ]; then
    # Get repository public key for secret encryption
    PUB_KEY_RESPONSE=$(curl -sf \
        -H "Authorization: token ${GH_TOKEN}" \
        -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/${GH_REPO}/actions/secrets/public-key" 2>/dev/null || echo "")

    if [ -n "$PUB_KEY_RESPONSE" ]; then
        # Install PyNaCl if needed for secret encryption
        python3 -c "import nacl" 2>/dev/null || pip install --break-system-packages -q pynacl 2>/dev/null

        # Encrypt and update the RUNPOD_POD_ID secret
        python3 << PYEOF
import json, base64, sys
try:
    from nacl import encoding, public

    pub_key_data = json.loads('''${PUB_KEY_RESPONSE}''')
    pub_key = public.PublicKey(pub_key_data["key"].encode("utf-8"), encoding.Base64Encoder())
    sealed = public.SealedBox(pub_key).encrypt("${RUNPOD_POD_ID}".encode("utf-8"))
    encrypted = base64.b64encode(sealed).decode("utf-8")

    import urllib.request
    req = urllib.request.Request(
        "https://api.github.com/repos/${GH_REPO}/actions/secrets/RUNPOD_POD_ID",
        data=json.dumps({"encrypted_value": encrypted, "key_id": pub_key_data["key_id"]}).encode(),
        headers={
            "Authorization": "token ${GH_TOKEN}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
        },
        method="PUT",
    )
    resp = urllib.request.urlopen(req)
    print(f"  Pod ID secret updated: {resp.status}")
except Exception as e:
    print(f"  Failed to update secret: {e}")
PYEOF

        # Trigger deploy workflow
        curl -sf -X POST \
            -H "Authorization: token ${GH_TOKEN}" \
            -H "Accept: application/vnd.github+json" \
            "https://api.github.com/repos/${GH_REPO}/actions/workflows/deploy-vps.yml/dispatches" \
            -d '{"ref":"main"}' \
            && echo "  Deploy workflow triggered" \
            || echo "  Deploy trigger failed (non-critical)"
    else
        echo "  Failed to get GitHub public key"
    fi
else
    echo "  SKIPPED: GITHUB_PAT not set in /workspace/config/.env"
fi

# ── 6. Register with VPS + start heartbeat ───────────────────────────────────
echo "[6/6] Registering with VPS..."
VPS_URL="${VPS_BACKEND_URL:-https://api.skyie.studio}"
REG_KEY="${GPU_REGISTRATION_KEY:-}"

if [ -n "$REG_KEY" ]; then
    curl -sf -X POST "${VPS_URL}/api/internal/gpu-register" \
        -H "Content-Type: application/json" \
        -H "X-GPU-Key: ${REG_KEY}" \
        -d "{\"gpu_url\": \"${GPU_URL}\", \"pod_id\": \"${RUNPOD_POD_ID}\"}" \
        && echo "  Registered: ${GPU_URL}" \
        || echo "  Registration failed (VPS may be unreachable)"

    # Persistent heartbeat
    tmux kill-session -t heartbeat 2>/dev/null || true
    tmux new-session -d -s heartbeat "
        while true; do
            sleep 60
            curl -sf -X POST ${VPS_URL}/api/internal/gpu-register \
                -H 'Content-Type: application/json' \
                -H 'X-GPU-Key: ${REG_KEY}' \
                -d '{\"gpu_url\": \"${GPU_URL}\", \"pod_id\": \"${RUNPOD_POD_ID}\"}' \
                > /dev/null 2>&1 || true
        done
    "
    echo "  Heartbeat: running (60s)"
else
    echo "  SKIPPED: GPU_REGISTRATION_KEY not set"
fi

echo ""
echo "========================================="
echo "  Skyie Studio GPU Ready"
echo "  Pod:       ${RUNPOD_POD_ID}"
echo "  GPU URL:   ${GPU_URL}"
echo "  Models:    $(ls /workspace/models/ 2>/dev/null | wc -l | tr -d ' ') directories"
echo "  Sessions:  $(tmux list-sessions 2>/dev/null | wc -l | tr -d ' ') tmux"
echo "========================================="

# Keep container alive
sleep infinity
