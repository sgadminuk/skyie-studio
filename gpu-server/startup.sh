#!/bin/bash
###############################################################################
# Skyie Studio GPU Pod — Startup Script
# Run after every pod restart: bash /workspace/config/startup.sh
#
# This script:
#   1. Hardens SSH
#   2. Installs missing packages
#   3. Starts Redis + fail2ban
#   4. Starts the GPU inference server
#   5. Self-registers with the VPS backend
#   6. Runs a heartbeat loop in the background
###############################################################################

set -euo pipefail

# Load environment variables
source /workspace/config/.env

echo "=== Skyie Studio GPU Startup ==="

# ── 1. SSH Hardening ──────────────────────────────────────────────────────────
echo "[1/6] Hardening SSH..."
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitEmptyPasswords.*/PermitEmptyPasswords no/' /etc/ssh/sshd_config
sed -i 's/^#\?LoginGraceTime.*/LoginGraceTime 30s/' /etc/ssh/sshd_config
sed -i 's/^#\?MaxAuthTries.*/MaxAuthTries 3/' /etc/ssh/sshd_config
sed -i 's/^#\?X11Forwarding.*/X11Forwarding no/' /etc/ssh/sshd_config
grep -q "ClientAliveInterval" /etc/ssh/sshd_config || echo -e "\nClientAliveInterval 300\nClientAliveCountMax 2" >> /etc/ssh/sshd_config
service ssh restart 2>/dev/null || true
echo "  SSH hardened"

# ── 2. Install packages ──────────────────────────────────────────────────────
echo "[2/6] Checking packages..."
which redis-server >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq redis-server 2>&1 | tail -1; }
which fail2ban-server >/dev/null 2>&1 || apt-get install -y -qq fail2ban 2>&1 | tail -1
which git-lfs >/dev/null 2>&1 || apt-get install -y -qq git-lfs 2>&1 | tail -1
which tmux >/dev/null 2>&1 || apt-get install -y -qq tmux htop 2>&1 | tail -1
which ffmpeg >/dev/null 2>&1 || apt-get install -y -qq ffmpeg 2>&1 | tail -1
echo "  Packages OK"

# ── 3. Start Redis + fail2ban ────────────────────────────────────────────────
echo "[3/6] Starting services..."
redis-server --daemonize yes --save "" --appendonly no 2>/dev/null
redis-cli ping >/dev/null && echo "  Redis: OK"

touch /var/log/auth.log
cat > /etc/fail2ban/jail.local << 'F2B'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3
backend = auto
[sshd]
enabled = true
port = 22
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
F2B
fail2ban-server -b 2>/dev/null || true
echo "  fail2ban: started"

# ── 4. Start GPU inference server ────────────────────────────────────────────
echo "[4/6] Starting GPU inference server..."
tmux kill-session -t gpu-server 2>/dev/null || true
tmux new-session -d -s gpu-server "cd /workspace && GPU_API_KEY=${GPU_API_KEY:-change-me-in-production} VRAM_LIMIT_GB=30.0 python3 server.py 2>&1 | tee /workspace/logs/gpu-server.log"

# Wait for server to be healthy
echo "  Waiting for server..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:8080/health > /dev/null 2>&1; then
        echo "  GPU server: healthy"
        break
    fi
    sleep 2
done

# ── 5. Verify GPU ────────────────────────────────────────────────────────────
echo "[5/6] Verifying GPU..."
python3 -c "import torch; print(f'  GPU: {torch.cuda.get_device_name(0)} | VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB | PyTorch: {torch.__version__}')"

# ── 6. Self-register with VPS backend ────────────────────────────────────────
echo "[6/6] Registering with VPS..."

# Determine this pod's proxy URL
# RUNPOD_POD_ID is set automatically by RunPod
POD_ID="${RUNPOD_POD_ID:-unknown}"
GPU_URL="https://${POD_ID}-8080.proxy.runpod.net"

VPS_URL="${VPS_BACKEND_URL:-https://api.skyie.studio}"
REG_KEY="${GPU_REGISTRATION_KEY:-}"

if [ -n "$REG_KEY" ]; then
    # Initial registration
    curl -sf -X POST "${VPS_URL}/api/internal/gpu-register" \
        -H "Content-Type: application/json" \
        -H "X-GPU-Key: ${REG_KEY}" \
        -d "{\"gpu_url\": \"${GPU_URL}\", \"pod_id\": \"${POD_ID}\"}" \
        && echo "  Registered: ${GPU_URL}" \
        || echo "  Registration failed (VPS may be unreachable)"

    # Start heartbeat loop in background (every 60s)
    (
        while true; do
            sleep 60
            curl -sf -X POST "${VPS_URL}/api/internal/gpu-register" \
                -H "Content-Type: application/json" \
                -H "X-GPU-Key: ${REG_KEY}" \
                -d "{\"gpu_url\": \"${GPU_URL}\", \"pod_id\": \"${POD_ID}\"}" \
                > /dev/null 2>&1 || true
        done
    ) &
    echo "  Heartbeat: running (60s interval)"
else
    echo "  SKIPPED: GPU_REGISTRATION_KEY not set in /workspace/config/.env"
fi

echo ""
echo "=== Skyie Studio GPU Ready ==="
echo "  GPU URL:    ${GPU_URL}"
echo "  Workspace:  $(df -h /workspace | awk 'NR==2 {print $3 " used / " $2 " total"}')"
echo "  Models:     $(ls /workspace/models/ 2>/dev/null | wc -l) directories"
