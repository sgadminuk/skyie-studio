#!/usr/bin/env bash
# Dedicated application CI identity. Public SSH remains closed.
set -euo pipefail
umask 077
: "${VPS_CI_WIREGUARD_KEY:?Missing VPS_CI_WIREGUARD_KEY}"
: "${VPS_CI_SSH_KEY:?Missing VPS_CI_SSH_KEY}"
sudo apt-get update -qq
sudo apt-get install -y -qq wireguard-tools
VPS_CI_WIREGUARD_KEY=$(printf '%s' "$VPS_CI_WIREGUARD_KEY" | tr -d '\r\n')
if [ "${#VPS_CI_WIREGUARD_KEY}" -ne 44 ] || ! printf '%s' "$VPS_CI_WIREGUARD_KEY" | wg pubkey >/dev/null 2>&1; then
  echo '::error::Invalid dedicated CI WireGuard key'; exit 1
fi
sudo install -m 600 /dev/null /etc/wireguard/app-ci.conf
{
  printf '[Interface]\nPrivateKey = %s\n' "$VPS_CI_WIREGUARD_KEY"
  printf 'Address = 10.203.10.40/32\n\n[Peer]\n'
  printf 'PublicKey = lbRHBmi1lDEEth9QbJO9OcQ27ECiGbjJwAcaynvdpF8=\n'
  printf 'Endpoint = 149.102.133.33:51820\n'
  printf 'AllowedIPs = 10.203.10.1/32\nPersistentKeepalive = 25\n'
} | sudo tee /etc/wireguard/app-ci.conf >/dev/null
unset VPS_CI_WIREGUARD_KEY
sudo wg-quick up app-ci
connected=false
for attempt in $(seq 1 10); do
  if nc -z -w 3 10.203.10.1 22; then
    handshake=$(sudo wg show app-ci latest-handshakes | awk 'NR == 1 { print $2 }')
    if [ -n "$handshake" ] && [ "$handshake" != 0 ]; then connected=true; break; fi
  fi
  sleep 2
done
[ "$connected" = true ] || { echo '::error::Private tunnel or SSH port unavailable'; exit 1; }
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
printf '%s\n' "$VPS_CI_SSH_KEY" > "$HOME/.ssh/deploy_key"
unset VPS_CI_SSH_KEY
ssh-keygen -y -P '' -f "$HOME/.ssh/deploy_key" >/dev/null
printf '%s\n' '10.203.10.1 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJQ99S7xpNzhkZe1xqrBpGpo0h06mJabNR1qJrlsZIV3' > "$HOME/.ssh/known_hosts"
cat > "$HOME/.ssh/config" <<EOF
Host vps 10.203.10.1
  HostName 10.203.10.1
  User claude
  Port 22
  IdentityFile $HOME/.ssh/deploy_key
  IdentitiesOnly yes
  BatchMode yes
  StrictHostKeyChecking yes
  UserKnownHostsFile $HOME/.ssh/known_hosts
  ServerAliveInterval 30
  ServerAliveCountMax 60
  ConnectTimeout 15
EOF
chmod 600 "$HOME/.ssh/deploy_key" "$HOME/.ssh/config" "$HOME/.ssh/known_hosts"
ssh vps 'printf "Private SSH verified\n"'
