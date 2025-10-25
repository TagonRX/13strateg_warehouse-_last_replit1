#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
# Шаг 1: Установка Node.js 20 LTS
# ═══════════════════════════════════════════════════════════════════════════

set -e

echo "════════════════════════════════════════════════════════════"
echo "  ШАГ 1: УСТАНОВКА NODE.JS 20 LTS"
echo "════════════════════════════════════════════════════════════"
echo ""

# Проверка если уже установлен
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 20 ]; then
        echo "✓ Node.js $(node -v) уже установлен"
        exit 0
    fi
fi

echo "→ Обновление системы..."
sudo apt update

echo ""
echo "→ Установка curl..."
sudo apt install -y curl

echo ""
echo "→ Добавление репозитория Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

echo ""
echo "→ Установка Node.js..."
sudo apt install -y nodejs

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✓ Node.js установлен: $(node -v)"
echo "✓ npm установлен: $(npm -v)"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "→ Следующий шаг: ./2-install-postgres.sh"
