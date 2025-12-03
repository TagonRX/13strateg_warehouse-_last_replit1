#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/etc/warehouse/env"
STATE_FILE="/etc/warehouse/last_ip"
MAIL_TO=""

current_ip=$(hostname -I | awk '{print $1}')
last_ip=""
[ -f "$STATE_FILE" ] && last_ip=$(cat "$STATE_FILE")

if [ "$current_ip" != "$last_ip" ]; then
  echo "IP changed: $last_ip -> $current_ip"
  echo "$current_ip" | sudo tee "$STATE_FILE" >/dev/null
  # Здесь можно обновить конфиг, если IP где-то захардкожен
  # В данном проекте использованы localhost/порт, поэтому только уведомление
  if [ -n "$MAIL_TO" ]; then
    echo "Server IP changed to $current_ip" | mail -s "Warehouse IP Changed" "$MAIL_TO" || true
  fi
  sudo systemctl restart warehouse.service || true
fi