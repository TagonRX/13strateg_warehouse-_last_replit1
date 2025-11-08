#!/bin/bash

# =====================================================
# ПРОСТАЯ УСТАНОВКА БЕЗ ПАРОЛЕЙ
# Warehouse Management System для Kubuntu
# =====================================================

set -e

# Цвета
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  УСТАНОВКА WAREHOUSE MANAGEMENT SYSTEM               ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Будет установлено:"
echo "  • Node.js 20"
echo "  • PostgreSQL (БЕЗ паролей)"
echo "  • Все данные (72,439 записей)"
echo ""
read -p "Продолжить? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
fi

# =====================================================
# 1. Установка Node.js 20
# =====================================================
echo ""
echo -e "${BLUE}[1/5] Установка Node.js 20${NC}"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 20 ]; then
        echo -e "${GREEN}✓${NC} Node.js $(node -v) установлен"
    else
        echo "Установка Node.js 20 через nvm..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        nvm install 20
        nvm use 20
        nvm alias default 20
    fi
else
    echo "Установка Node.js 20 через nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install 20
    nvm use 20
    nvm alias default 20
fi

# =====================================================
# 2. Установка PostgreSQL
# =====================================================
echo ""
echo -e "${BLUE}[2/5] Установка PostgreSQL${NC}"

if command -v psql &> /dev/null; then
    echo -e "${GREEN}✓${NC} PostgreSQL установлен"
else
    echo "Установка PostgreSQL..."
    sudo apt-get update
    sudo apt-get install -y postgresql postgresql-contrib
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
fi

# =====================================================
# 3. Настройка PostgreSQL БЕЗ ПАРОЛЕЙ (trust)
# =====================================================
echo ""
echo -e "${BLUE}[3/5] Настройка PostgreSQL${NC}"

# Находим pg_hba.conf
PG_HBA=$(sudo -u postgres psql -t -P format=unaligned -c 'SHOW hba_file;' 2>/dev/null || echo "/etc/postgresql/*/main/pg_hba.conf")

# Резервная копия
sudo cp $PG_HBA ${PG_HBA}.backup 2>/dev/null || true

# Меняем все local на trust (БЕЗ ПАРОЛЕЙ)
sudo sed -i 's/^local.*all.*postgres.*/local   all             postgres                                trust/' $PG_HBA
sudo sed -i 's/^local.*all.*all.*/local   all             all                                     trust/' $PG_HBA
sudo sed -i 's/^host.*all.*all.*127\.0\.0\.1.*md5/host    all             all             127.0.0.1\/32            trust/' $PG_HBA

# Перезапуск
sudo systemctl restart postgresql
sleep 2

echo -e "${GREEN}✓${NC} PostgreSQL настроен БЕЗ паролей"

# =====================================================
# 4. Создание БД
# =====================================================
echo ""
echo -e "${BLUE}[4/5] Создание базы данных${NC}"

DB_NAME="warehouse_local"

# Удаляем старую БД
psql -U postgres -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>/dev/null || true

# Создаем новую БД
psql -U postgres -c "CREATE DATABASE $DB_NAME;"

echo -e "${GREEN}✓${NC} База данных создана"

# =====================================================
# 5. Создание .env
# =====================================================
cat > .env << EOF
DATABASE_URL=postgresql://postgres@localhost:5432/$DB_NAME
SESSION_SECRET=$(openssl rand -hex 32)
NODE_ENV=production
EOF

echo -e "${GREEN}✓${NC} Конфигурация создана"

# =====================================================
# 6. Установка пакетов
# =====================================================
echo ""
echo -e "${BLUE}[5/5] Установка пакетов и данных${NC}"
echo "Это займет 10-15 минут..."

npm install --legacy-peer-deps

# Применение схемы
npm run db:push -- --force

# Импорт данных
node import-data.js

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✓ УСТАНОВКА ЗАВЕРШЕНА!                              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Запустите сервер:"
echo -e "  ${BLUE}./start.sh${NC}"
echo ""
echo "Откройте: http://localhost:5000"
echo "Логин: admin / Пароль: admin123"
echo ""
