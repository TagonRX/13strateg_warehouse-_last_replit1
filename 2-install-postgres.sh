#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
# Шаг 2: Установка PostgreSQL
# ═══════════════════════════════════════════════════════════════════════════

set -e

echo "════════════════════════════════════════════════════════════"
echo "  ШАГ 2: УСТАНОВКА POSTGRESQL"
echo "════════════════════════════════════════════════════════════"
echo ""

# Проверка если уже установлен
if command -v psql &> /dev/null; then
    echo "✓ PostgreSQL уже установлен: $(psql --version)"
    exit 0
fi

echo "→ Установка PostgreSQL..."
sudo apt update
sudo apt install -y postgresql postgresql-contrib

echo ""
echo "→ Запуск PostgreSQL..."
sudo systemctl start postgresql
sudo systemctl enable postgresql

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✓ PostgreSQL установлен и запущен"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "→ Следующий шаг: ./3-setup-database.sh"
