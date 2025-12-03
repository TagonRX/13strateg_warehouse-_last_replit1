#!/usr/bin/env bash
set -euo pipefail

# Upgrade script: updates /opt/warehouse from either a local folder or a Git URL
# Usage:
#   sudo bash kubuntu-package/upgrade.sh /path/to/new/source
#   sudo bash kubuntu-package/upgrade.sh https://github.com/owner/repo.git [branch]

SRC_ARG=${1:-}
BRANCH=${2:-main}

if [ -z "$SRC_ARG" ]; then
  echo "Usage: upgrade.sh <local_path|git_url> [branch]"
  exit 1
fi

INSTALL_DIR="/opt/warehouse"
ENV_FILE="/etc/warehouse/env"

echo "== Warehouse Upgrade =="
echo "Source: $SRC_ARG"
echo "Target: $INSTALL_DIR"

sudo systemctl stop warehouse.service || true

TMP_DIR=$(mktemp -d)
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

if [[ "$SRC_ARG" =~ ^https?:// ]]; then
  echo "Cloning Git repo..."
  git clone --depth 1 --branch "$BRANCH" "$SRC_ARG" "$TMP_DIR/src"
else
  echo "Copying local source..."
  rsync -a --delete "$SRC_ARG/" "$TMP_DIR/src/"
fi

echo "Syncing to $INSTALL_DIR..."
sudo rsync -a --delete "$TMP_DIR/src/" "$INSTALL_DIR/"

echo "Installing dependencies and building..."
cd "$INSTALL_DIR"
sudo npm ci
sudo npm run build

echo "Verifying env file..."
if [ ! -f "$ENV_FILE" ]; then
  echo "PORT=5000" | sudo tee "$ENV_FILE" >/dev/null
  echo "SQLITE_PATH=/var/lib/warehouse/warehouse.db" | sudo tee -a "$ENV_FILE" >/dev/null
  echo "NODE_ENV=production" | sudo tee -a "$ENV_FILE" >/dev/null
fi

echo "Starting service..."
sudo systemctl start warehouse.service
sudo systemctl status warehouse.service --no-pager || true

echo "Running smoke test:"
bash "$INSTALL_DIR/kubuntu-package/smoke.sh" $(grep -E '^PORT=' "$ENV_FILE" | cut -d'=' -f2 || echo 5000) || true

echo "Upgrade finished."