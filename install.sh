#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
DST_DIR="/opt/wireguard-wui"
SERVICE_FILE="wireguard-wui.service"
SUDOERS_FILE="/etc/sudoers.d/wireguard-wui"
USER="wireguard-wui"
GROUP="wireguard-wui"

if [ "$EUID" -ne 0 ]; then
  echo "This script must be run as root." >&2
  exit 1
fi

echo "=== WireGuard WUI — Automated Installation ==="
echo ""

# ---- user & group ----
if getent group "$GROUP" >/dev/null 2>&1; then
  echo "[ok] Group '$GROUP' already exists."
else
  groupadd --system "$GROUP"
  echo "[created] Group '$GROUP'"
fi

if id "$USER" >/dev/null 2>&1; then
  echo "[ok] User '$USER' already exists."
else
  useradd --system --gid "$GROUP" --no-create-home --shell /usr/sbin/nologin "$USER"
  echo "[created] User '$USER'"
fi

# ---- copy sources ----
echo ""
echo "Copying sources to $DST_DIR …"
rsync -a --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='db/wireguard-wui.db' \
  --exclude='logs/' \
  "$SRC_DIR/" "$DST_DIR/"
echo "[done] Files copied."

# ---- npm install ----
echo ""
echo "Installing dependencies …"
cd "$DST_DIR"
npm install --omit=dev --no-audit --no-fund
echo "[done] Dependencies installed."

# ---- configuration prompts ----
echo ""
echo "=== Configuration ==="
echo "Press Enter to accept the default value shown in brackets."
echo ""

read -r -p "Port [3000]: " PORT
PORT="${PORT:-3000}"

DEFAULT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
read -r -p "Session secret (leave empty to auto-generate a random one): " SESSION_SECRET
SESSION_SECRET="${SESSION_SECRET:-$DEFAULT_SECRET}"

read -r -p "Database path [${DST_DIR}/db/wireguard-wui.db]: " DB_PATH
DB_PATH="${DB_PATH:-${DST_DIR}/db/wireguard-wui.db}"

# ---- write .env ----
cat > "$DST_DIR/.env" <<EOF
PORT=$PORT
SESSION_SECRET=$SESSION_SECRET
DB_PATH=$DB_PATH
EOF

chown "$USER:$GROUP" "$DST_DIR/.env"
chmod 600 "$DST_DIR/.env"
echo "[created] $DST_DIR/.env (600)"

# ---- create required directories ----
mkdir -p "$DST_DIR/db" "$DST_DIR/logs"
chown "$USER:$GROUP" "$DST_DIR/db" "$DST_DIR/logs"
echo "[created] data directories"

# ---- systemd service ----
cp "$SRC_DIR/$SERVICE_FILE" "/etc/systemd/system/$SERVICE_FILE"
chmod 644 "/etc/systemd/system/$SERVICE_FILE"
systemctl daemon-reload
echo "[created] systemd service: $SERVICE_FILE"

# ---- sudoers ----
cat > "$SUDOERS_FILE" <<EOF
# WireGuard WUI — allow specific WireGuard and system commands
$USER ALL=(root) NOPASSWD: /usr/bin/wg-quick *, /usr/bin/wg show *, /usr/bin/wg syncconf *, /usr/bin/wg set *, /usr/bin/wg pubkey, /usr/bin/iptables *, /usr/bin/ip link *, /usr/bin/firewall-cmd *, /usr/bin/cp, /usr/bin/chmod, /usr/bin/rm, /usr/bin/cat, /usr/bin/find
EOF

chmod 440 "$SUDOERS_FILE"
echo "[created] sudoers: $SUDOERS_FILE"

# ---- permissions ----
chown -R "$USER:$GROUP" "$DST_DIR"
find "$DST_DIR" -type d -exec chmod 755 {} \;
find "$DST_DIR" -type f -exec chmod 644 {} \;
chmod 600 "$DST_DIR/.env"
chmod 755 "$DST_DIR/db" "$DST_DIR/logs"
echo "[done] Permissions set."

echo ""
echo "=== Installation complete ==="
echo ""
echo "Start the service:  systemctl enable --now wireguard-wui"
echo "View logs:           journalctl -u wireguard-wui -f"
echo "Source directory:    $DST_DIR"
echo ""
echo "If you expose this app behind a reverse proxy (nginx, caddy, …),"
echo "uncomment these security settings in $DST_DIR/.env:"
echo "  TRUST_PROXY=1"
echo "  ENABLE_HSTS=true"
echo "  ENABLE_UPGRADE_HTTPS=true"
echo "  SESSION_SECURE=true"
echo ""
echo "Don't forget to set up the admin account by visiting the web interface."
