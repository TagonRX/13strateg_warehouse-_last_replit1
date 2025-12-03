#!/usr/bin/env bash
set -euo pipefail

DOMAIN=${1:-}
EMAIL=${2:-}

if [ -z "$DOMAIN" ]; then
  echo "Usage: setup-nginx.sh <domain> [email]"
  echo "Example: setup-nginx.sh warehouse.example.com admin@example.com"
  exit 1
fi

echo "== Setup nginx reverse proxy for $DOMAIN =="
sudo apt-get update -y
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Prepare ACME challenge root
sudo mkdir -p /var/www/letsencrypt
sudo chown -R www-data:www-data /var/www/letsencrypt

# Install nginx conf
CONF_SRC="$(cd "$(dirname "$0")" && pwd)/nginx-warehouse.conf"
CONF_DST="/etc/nginx/sites-available/warehouse.conf"
sudo cp "$CONF_SRC" "$CONF_DST"

# Replace server_name and cert paths
sudo sed -i "s/server_name _;/server_name $DOMAIN;/g" "$CONF_DST"
sudo sed -i "s#/etc/letsencrypt/live/_/#/etc/letsencrypt/live/$DOMAIN/#g" "$CONF_DST"

sudo ln -sf "$CONF_DST" /etc/nginx/sites-enabled/warehouse.conf
sudo nginx -t
sudo systemctl restart nginx

# Obtain certificate
if [ -n "$EMAIL" ]; then
  sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" || true
else
  sudo certbot --nginx -d "$DOMAIN" || true
fi

sudo systemctl restart nginx
echo "Nginx reverse proxy is configured for $DOMAIN"