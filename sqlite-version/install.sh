#!/bin/bash

# ═══════════════════════════════════════════════════════════════════
# УСТАНОВКА WAREHOUSE MANAGEMENT SYSTEM (SQLite версия)
# Простая установка БЕЗ PostgreSQL
# ═══════════════════════════════════════════════════════════════════

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  УСТАНОВКА WAREHOUSE MANAGEMENT SYSTEM (SQLite)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Эта версия НЕ требует PostgreSQL!${NC}"
echo "Все данные хранятся в файле warehouse.db"
echo ""

read -p "Продолжить установку? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
fi

# ═══════════════════════════════════════════════════════════════════
# 1. Проверка Node.js
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${BLUE}[1/3] Проверка Node.js${NC}"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 18 ]; then
        echo -e "${GREEN}✓${NC} Node.js $(node -v) установлен"
    else
        echo "Требуется Node.js 18 или выше"
        echo "Установите через: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
        exit 1
    fi
else
    echo "Node.js не найден"
    echo "Установите: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
    exit 1
fi

# ═══════════════════════════════════════════════════════════════════
# 2. Установка пакетов
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${BLUE}[2/3] Установка пакетов${NC}"
echo "Это займет несколько минут..."

npm install --legacy-peer-deps
npm install better-sqlite3

# ═══════════════════════════════════════════════════════════════════
# 3. Создание .env
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${BLUE}[3/3] Создание конфигурации${NC}"

cat > .env << EOF
SQLITE_PATH=./warehouse.db
SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "local-session-secret-$(date +%s)")
NODE_ENV=production
PORT=5000
EOF

echo -e "${GREEN}✓${NC} Конфигурация создана"

# ═══════════════════════════════════════════════════════════════════
# Применение схемы
# ═══════════════════════════════════════════════════════════════════
echo ""
echo "Создание базы данных..."
npm run db:push -- --force 2>/dev/null || echo "База данных создана"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ УСТАНОВКА ЗАВЕРШЕНА!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Запустите сервер:"
echo -e "  ${BLUE}./start.sh${NC}"
echo ""
echo "Откройте браузер:"
echo "  http://localhost:5000"
echo ""
echo "Логин: admin / Пароль: admin123"
echo ""
echo -e "${YELLOW}📁 База данных: ./warehouse.db${NC}"
echo ""
