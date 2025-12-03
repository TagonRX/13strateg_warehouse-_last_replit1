#!/usr/bin/env bash
set -euo pipefail

echo "== Warehouse Uninstall =="

sudo systemctl disable --now warehouse.service || true
sudo rm -f /etc/systemd/system/warehouse.service
sudo systemctl daemon-reload

# Не удаляем данные по умолчанию
echo "Data kept at /var/lib/warehouse/warehouse.db"
echo "To remove: sudo rm -rf /var/lib/warehouse /etc/warehouse /opt/warehouse"