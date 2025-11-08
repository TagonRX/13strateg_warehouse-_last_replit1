#!/bin/bash

# =====================================================
# Warehouse Management System - Local Setup Script
# =====================================================
# Этот скрипт автоматически настраивает проект на локальной машине Kubuntu
# Запускать из папки проекта: ./setup.sh

set -e  # Остановка при любой ошибке

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функция вывода с цветом
print_info() {
    echo -e "${BLUE}ℹ ${NC}$1"
}

print_success() {
    echo -e "${GREEN}✓ ${NC}$1"
}

print_warning() {
    echo -e "${YELLOW}⚠ ${NC}$1"
}

print_error() {
    echo -e "${RED}✗ ${NC}$1"
}

# Проверка что скрипт запущен из правильной директории
if [ ! -f "package.json" ]; then
    print_error "package.json не найден!"
    print_error "Запустите скрипт из директории проекта:"
    print_error "cd /home/ruslan/Desktop/Main-project-13strategyexperts"
    print_error "./setup.sh"
    exit 1
fi

print_info "========================================"
print_info "   Установка Warehouse Management System"
print_info "========================================"
echo ""

# =====================================================
# 1. Проверка и установка Node.js
# =====================================================
print_info "Шаг 1/8: Проверка Node.js..."

if ! command -v node &> /dev/null; then
    print_warning "Node.js не установлен. Устанавливаю..."
    
    # Установка nvm
    if [ ! -d "$HOME/.nvm" ]; then
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    fi
    
    # Установка Node.js 20
    nvm install 20
    nvm use 20
    print_success "Node.js 20 установлен"
else
    NODE_VERSION=$(node -v)
    print_success "Node.js уже установлен: $NODE_VERSION"
fi

# =====================================================
# 2. Проверка и установка PostgreSQL
# =====================================================
print_info "Шаг 2/8: Проверка PostgreSQL..."

if ! command -v psql &> /dev/null; then
    print_warning "PostgreSQL не установлен. Устанавливаю..."
    sudo apt update
    sudo apt install -y postgresql postgresql-contrib
    sudo systemctl enable postgresql
    sudo systemctl start postgresql
    print_success "PostgreSQL установлен и запущен"
else
    PG_VERSION=$(psql --version | awk '{print $3}')
    print_success "PostgreSQL уже установлен: $PG_VERSION"
    
    # Проверка что PostgreSQL запущен
    if ! sudo systemctl is-active --quiet postgresql; then
        print_warning "PostgreSQL не запущен. Запускаю..."
        sudo systemctl start postgresql
    fi
fi

# =====================================================
# 3. Создание базы данных
# =====================================================
print_info "Шаг 3/8: Настройка базы данных..."

DB_NAME="warehouse_local"
DB_USER="warehouse_user"
DB_PASSWORD="warehouse_pass_$(date +%s | sha256sum | base64 | head -c 16)"

# Создание пользователя и БД
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

print_success "База данных создана: $DB_NAME"

# =====================================================
# 4. Создание .env файла
# =====================================================
print_info "Шаг 4/8: Создание .env файла..."

DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
SESSION_SECRET=$(openssl rand -base64 32)

cat > .env << EOF
# PostgreSQL Database
DATABASE_URL=$DATABASE_URL
PGHOST=localhost
PGPORT=5432
PGDATABASE=$DB_NAME
PGUSER=$DB_USER
PGPASSWORD=$DB_PASSWORD

# Session Secret
SESSION_SECRET=$SESSION_SECRET

# Environment
NODE_ENV=production
EOF

print_success ".env файл создан"

# =====================================================
# 5. Установка npm зависимостей
# =====================================================
print_info "Шаг 5/8: Установка npm пакетов..."

# Очистка кэша на всякий случай
npm cache clean --force 2>/dev/null || true

# Установка пакетов
npm install

print_success "Все пакеты установлены"

# =====================================================
# 6. Применение схемы БД
# =====================================================
print_info "Шаг 6/8: Применение схемы базы данных..."

# Попытка обычного push
if npm run db:push 2>/dev/null; then
    print_success "Схема БД применена успешно"
else
    print_warning "Обычный db:push не сработал, пробую с --force..."
    npm run db:push -- --force
    print_success "Схема БД применена с --force"
fi

# =====================================================
# 7. Создание директорий для логов
# =====================================================
print_info "Шаг 7/8: Создание директорий для логов..."

sudo mkdir -p /var/log/warehouse
sudo chown $USER:$USER /var/log/warehouse
sudo chmod 755 /var/log/warehouse

print_success "Директории для логов созданы: /var/log/warehouse"

# =====================================================
# 8. Инструкция по созданию admin пользователя
# =====================================================
print_info "Шаг 8/8: Создание admin пользователя..."

print_info "После запуска сервера создайте admin пользователя через bootstrap endpoint"
print_success "Инструкция готова"

# =====================================================
# Финальная информация
# =====================================================
echo ""
print_success "========================================"
print_success "   Установка завершена успешно! ✓"
print_success "========================================"
echo ""
print_info "Следующие шаги:"
echo ""
echo "1. Запуск вручную для тестирования:"
echo "   ${GREEN}./start.sh${NC}"
echo ""
echo "2. Установка автозапуска:"
echo "   ${GREEN}sudo cp warehouse.service /etc/systemd/system/${NC}"
echo "   ${GREEN}sudo systemctl enable warehouse${NC}"
echo "   ${GREEN}sudo systemctl start warehouse${NC}"
echo ""
echo "3. Проверка статуса:"
echo "   ${GREEN}sudo systemctl status warehouse${NC}"
echo ""
echo "4. Создание admin пользователя:"
echo "   ${GREEN}curl -X POST http://localhost:5000/api/admin/bootstrap${NC}"
echo ""
echo "5. Доступ к приложению:"
echo "   ${GREEN}http://localhost:5000${NC}"
echo ""
echo "6. Учетные данные admin (после создания):"
echo "   Логин: ${GREEN}admin${NC}"
echo "   Пароль: ${GREEN}admin123${NC}"
echo ""
echo "7. Сбор логов для отладки:"
echo "   ${GREEN}./collect-logs.sh${NC}"
echo ""
print_info "Подробная документация: README-LOCAL.md"
echo ""
