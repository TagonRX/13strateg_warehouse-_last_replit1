#!/bin/bash

# ═══════════════════════════════════════════════════════════════════
# ПРОСТАЯ УСТАНОВКА WAREHOUSE MANAGEMENT SYSTEM
# Использует настройки из kubuntu-config.js
# ═══════════════════════════════════════════════════════════════════

set -e

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# ═══════════════════════════════════════════════════════════════════
# Читаем конфигурацию из kubuntu-config.js
# ═══════════════════════════════════════════════════════════════════

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  УСТАНОВКА WAREHOUSE MANAGEMENT SYSTEM${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo ""

if [ ! -f "kubuntu-config.js" ]; then
    echo -e "${RED}❌ Ошибка: Не найден файл kubuntu-config.js${NC}"
    echo "Убедитесь что вы находитесь в папке проекта"
    exit 1
fi

# Извлекаем параметры из конфига
DB_HOST=$(node -p "require('./kubuntu-config.js').database.host")
DB_PORT=$(node -p "require('./kubuntu-config.js').database.port")
DB_USER=$(node -p "require('./kubuntu-config.js').database.user")
DB_PASSWORD=$(node -p "require('./kubuntu-config.js').database.password")
DB_NAME=$(node -p "require('./kubuntu-config.js').database.name")
SERVER_PORT=$(node -p "require('./kubuntu-config.js').server.port")
DATA_FILE=$(node -p "require('./kubuntu-config.js').paths.dataFile")

echo -e "${YELLOW}📋 Настройки из kubuntu-config.js:${NC}"
echo "   PostgreSQL: $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
if [ -z "$DB_PASSWORD" ]; then
    echo "   Режим: БЕЗ пароля (trust)"
else
    echo "   Режим: С паролем"
fi
echo "   Веб-сервер: http://localhost:$SERVER_PORT"
echo "   Файл данных: $DATA_FILE"
echo ""
read -p "Продолжить установку? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
fi

# ═══════════════════════════════════════════════════════════════════
# 1. Установка Node.js 20
# ═══════════════════════════════════════════════════════════════════
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

# ═══════════════════════════════════════════════════════════════════
# 2. Установка PostgreSQL
# ═══════════════════════════════════════════════════════════════════
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

# ═══════════════════════════════════════════════════════════════════
# 3. Настройка PostgreSQL
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${BLUE}[3/5] Настройка PostgreSQL${NC}"

# Если пароль пустой - настраиваем trust
if [ -z "$DB_PASSWORD" ]; then
    echo "Настройка режима trust (БЕЗ пароля)..."
    
    # Находим pg_hba.conf
    PG_HBA=$(sudo -u postgres psql -t -P format=unaligned -c 'SHOW hba_file;' 2>/dev/null || echo "/etc/postgresql/*/main/pg_hba.conf")
    
    # Резервная копия
    sudo cp $PG_HBA ${PG_HBA}.backup 2>/dev/null || true
    
    # Меняем все local на trust (БЕЗ ПАРОЛЕЙ)
    sudo sed -i 's/^local.*all.*postgres.*/local   all             postgres                                trust/' $PG_HBA
    sudo sed -i 's/^local.*all.*all.*/local   all             all                                     trust/' $PG_HBA
    sudo sed -i 's/^host.*all.*all.*127\.0\.0\.1.*md5/host    all             all             127.0.0.1\/32            trust/' $PG_HBA
    sudo sed -i 's/^host.*all.*all.*127\.0\.0\.1.*scram-sha-256/host    all             all             127.0.0.1\/32            trust/' $PG_HBA
    
    # Перезапуск
    sudo systemctl restart postgresql
    sleep 2
    
    echo -e "${GREEN}✓${NC} PostgreSQL настроен БЕЗ паролей (trust)"
else
    echo -e "${YELLOW}⚠${NC}  Используется пароль из конфига"
    echo "Убедитесь что пользователь $DB_USER имеет пароль: $DB_PASSWORD"
fi

# ═══════════════════════════════════════════════════════════════════
# 4. Создание базы данных
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${BLUE}[4/5] Создание базы данных${NC}"

# Формируем команду подключения
if [ -z "$DB_PASSWORD" ]; then
    PSQL_CMD="psql -h $DB_HOST -p $DB_PORT -U $DB_USER"
else
    export PGPASSWORD="$DB_PASSWORD"
    PSQL_CMD="psql -h $DB_HOST -p $DB_PORT -U $DB_USER"
fi

# Удаляем старую БД
$PSQL_CMD -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>/dev/null || true

# Создаем новую БД
$PSQL_CMD -c "CREATE DATABASE $DB_NAME;"

echo -e "${GREEN}✓${NC} База данных $DB_NAME создана"

# ═══════════════════════════════════════════════════════════════════
# 5. Создание .env из конфига
# ═══════════════════════════════════════════════════════════════════

# Строим DATABASE_URL
if [ -z "$DB_PASSWORD" ]; then
    DATABASE_URL="postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
else
    DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"
fi

cat > .env << EOF
DATABASE_URL=$DATABASE_URL
SESSION_SECRET=$(openssl rand -hex 32)
NODE_ENV=production
PORT=$SERVER_PORT
EOF

echo -e "${GREEN}✓${NC} Конфигурация .env создана"

# ═══════════════════════════════════════════════════════════════════
# 6. Установка пакетов и импорт данных
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${BLUE}[5/5] Установка пакетов и данных${NC}"
echo "Это займет 10-15 минут..."
echo ""

# Установка пакетов
npm install --legacy-peer-deps

# Применение схемы базы данных
echo ""
echo "Создание таблиц в базе данных..."
npm run db:push -- --force

# Импорт данных через tsx
echo ""
echo "Импорт данных (это может занять несколько минут)..."
npx tsx import-data.ts

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ УСТАНОВКА ЗАВЕРШЕНА!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Запустите сервер:"
echo -e "  ${BLUE}./start.sh${NC}"
echo ""
echo "Откройте браузер:"
echo "  http://localhost:$SERVER_PORT"
echo ""
echo "Логин: admin / Пароль: admin123"
echo ""
echo -e "${YELLOW}📝 Настройки можно изменить в файле kubuntu-config.js${NC}"
echo ""
