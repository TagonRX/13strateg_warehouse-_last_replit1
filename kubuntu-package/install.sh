#!/usr/bin/env bash
set -euo pipefail

PROJECT_SRC_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
INSTALL_DIR="/opt/warehouse"
ENV_DIR="/etc/warehouse"
DATA_DIR="/var/lib/warehouse"
ENV_FILE="$ENV_DIR/env"

echo "== Warehouse Installer =="

# 1) Проверка зависимостей
command -v node >/dev/null 2>&1 || { echo "Node.js не найден"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm не найден"; exit 1; }

# Для better-sqlite3 иногда требуется toolchain
sudo apt-get update -y
sudo apt-get install -y build-essential python3

# 2) Копирование проекта
sudo mkdir -p "$INSTALL_DIR"
sudo rsync -a --delete "$PROJECT_SRC_DIR/" "$INSTALL_DIR/"

# 3) Установка зависимостей и сборка
cd "$INSTALL_DIR"
sudo npm ci
sudo npm run build

# 4) Подготовка каталога данных
sudo mkdir -p "$DATA_DIR"
if [ -f "$INSTALL_DIR/warehouse.db" ] && [ ! -f "$DATA_DIR/warehouse.db" ]; then
  sudo mv "$INSTALL_DIR/warehouse.db" "$DATA_DIR/warehouse.db"
fi
sudo chown root:root "$DATA_DIR"
sudo chmod 755 "$DATA_DIR"
sudo touch "$DATA_DIR/warehouse.db"
sudo chown root:root "$DATA_DIR/warehouse.db"
sudo chmod 640 "$DATA_DIR/warehouse.db"

# 5) ENV
sudo mkdir -p "$ENV_DIR"
cat <<EOF | sudo tee "$ENV_FILE" >/dev/null
PORT=5000
SQLITE_PATH=$DATA_DIR/warehouse.db
NODE_ENV=production
EOF
sudo chmod 640 "$ENV_FILE"

# 6) systemd unit
SERVICE_FILE="/etc/systemd/system/warehouse.service"
cat <<'EOF' | sudo tee "$SERVICE_FILE" >/dev/null
[Unit]
Description=Warehouse Management System
After=network.target

[Service]
Type=simple
EnvironmentFile=/etc/warehouse/env
WorkingDirectory=/opt/warehouse
ExecStart=/usr/bin/node /opt/warehouse/dist/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now warehouse.service

echo "Installer completed. Service status:"
systemctl --no-pager status warehouse.service || true

echo "Running smoke test:"
bash kubuntu-package/smoke.sh 5000 || true