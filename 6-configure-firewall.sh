#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
# Шаг 6: Настройка Firewall (UFW)
# ═══════════════════════════════════════════════════════════════════════════

set -e

echo "════════════════════════════════════════════════════════════"
echo "  ШАГ 6: НАСТРОЙКА FIREWALL"
echo "════════════════════════════════════════════════════════════"
echo ""

# Проверка наличия UFW
if ! command -v ufw &> /dev/null; then
    echo "→ UFW не установлен, устанавливаем..."
    sudo apt-get update
    sudo apt-get install -y ufw
fi

echo "→ Настройка правил firewall..."

# Разрешаем SSH (важно сделать это первым!)
sudo ufw allow 22/tcp comment 'SSH'
echo "  ✓ SSH (порт 22) разрешён"

# Разрешаем порт приложения
sudo ufw allow 5000/tcp comment 'Warehouse App'
echo "  ✓ Приложение (порт 5000) разрешено"

# Разрешаем HTTP и HTTPS (если будет nginx)
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
echo "  ✓ HTTP (порт 80) и HTTPS (порт 443) разрешены"

# Включаем UFW (если ещё не включен)
echo ""
echo "→ Включение firewall..."
sudo ufw --force enable

echo ""
echo "→ Текущие правила firewall:"
sudo ufw status verbose

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✓ Firewall настроен"
echo ""
echo "Открытые порты:"
echo "  • 22 (SSH)"
echo "  • 5000 (Warehouse App)"
echo "  • 80 (HTTP)"
echo "  • 443 (HTTPS)"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "→ Следующий шаг (опционально): ./7-setup-nginx.sh"
echo "  или проверьте приложение: http://$(hostname -I | awk '{print $1}'):5000"
