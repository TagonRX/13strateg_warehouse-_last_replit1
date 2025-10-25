#!/bin/bash

###############################################################################
# Автоматический скрипт установки Warehouse Management System на Kubuntu
# 
# Использование:
#   chmod +x deployment/setup.sh
#   ./deployment/setup.sh
###############################################################################

set -e  # Остановить при ошибке

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Функции вывода
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

print_header() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}$1${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
}

# Проверка прав root
if [ "$EUID" -eq 0 ]; then 
    print_error "Не запускайте этот скрипт от имени root!"
    print_info "Используйте: ./deployment/setup.sh"
    exit 1
fi

print_header "Warehouse Management System - Автоматическая установка"

# Запрос базовой информации
print_info "Введите данные для настройки:"
read -p "Имя базы данных [warehouse_db]: " DB_NAME
DB_NAME=${DB_NAME:-warehouse_db}

read -p "Пользователь БД [warehouse_user]: " DB_USER
DB_USER=${DB_USER:-warehouse_user}

read -sp "Пароль для БД (оставьте пустым для автогенерации): " DB_PASSWORD
echo ""
if [ -z "$DB_PASSWORD" ]; then
    DB_PASSWORD=$(openssl rand -base64 24)
    print_info "Сгенерирован пароль БД: $DB_PASSWORD"
fi

read -p "Домен или IP адрес сервера: " DOMAIN
DOMAIN=${DOMAIN:-localhost}

# Генерация session secret
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || openssl rand -hex 32)

###############################################################################
print_header "ШАГ 1: Обновление системы"
###############################################################################

print_info "Обновление списка пакетов..."
sudo apt update

print_info "Обновление установленных пакетов..."
sudo apt upgrade -y

print_info "Установка базовых утилит..."
sudo apt install -y curl wget git build-essential

print_success "Система обновлена"

###############################################################################
print_header "ШАГ 2: Установка Node.js"
###############################################################################

if ! command -v node &> /dev/null; then
    print_info "Установка Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    print_success "Node.js установлен: $(node -v)"
else
    print_success "Node.js уже установлен: $(node -v)"
fi

###############################################################################
print_header "ШАГ 3: Установка PostgreSQL"
###############################################################################

if ! command -v psql &> /dev/null; then
    print_info "Установка PostgreSQL..."
    sudo apt install -y postgresql postgresql-contrib
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
    print_success "PostgreSQL установлен"
else
    print_success "PostgreSQL уже установлен"
fi

###############################################################################
print_header "ШАГ 4: Настройка базы данных"
###############################################################################

print_info "Создание пользователя и базы данных..."

sudo -u postgres psql -c "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
sudo -u postgres psql <<EOF
CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASSWORD';
ALTER ROLE $DB_USER CREATEDB;
EOF

sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw $DB_NAME || \
sudo -u postgres psql <<EOF
CREATE DATABASE $DB_NAME OWNER $DB_USER;
EOF

print_success "База данных настроена"

###############################################################################
print_header "ШАГ 5: Установка зависимостей приложения"
###############################################################################

print_info "Установка npm зависимостей..."
npm install --production

print_success "Зависимости установлены"

###############################################################################
print_header "ШАГ 6: Настройка переменных окружения"
###############################################################################

print_info "Создание .env файла..."

cat > .env <<EOF
NODE_ENV=production
PORT=5000
HOST=0.0.0.0

DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME

SESSION_SECRET=$SESSION_SECRET

REPLIT_DOMAINS=$DOMAIN
EOF

print_success ".env файл создан"

###############################################################################
print_header "ШАГ 7: Сборка приложения"
###############################################################################

print_info "Установка dev зависимостей для сборки..."
npm install

print_info "Сборка frontend и backend..."
npm run build

print_success "Приложение собрано"

###############################################################################
print_header "ШАГ 8: Настройка базы данных приложения"
###############################################################################

print_info "Применение схемы БД..."
npm run db:push || npm run db:push -- --force

print_info "Создание администратора..."
node dist/hash-admin-password.js

print_info "Создание начальных настроек..."
node dist/seed-warehouse-settings.js

print_success "База данных настроена"

###############################################################################
print_header "ШАГ 9: Установка PM2"
###############################################################################

if ! command -v pm2 &> /dev/null; then
    print_info "Установка PM2..."
    sudo npm install -g pm2
    print_success "PM2 установлен"
else
    print_success "PM2 уже установлен"
fi

print_info "Запуск приложения через PM2..."
pm2 start deployment/ecosystem.config.js --env production

print_info "Настройка автозапуска..."
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME
pm2 save

print_success "Приложение запущено"

###############################################################################
print_header "ШАГ 10: Установка Nginx"
###############################################################################

if ! command -v nginx &> /dev/null; then
    print_info "Установка Nginx..."
    sudo apt install -y nginx
    sudo systemctl start nginx
    sudo systemctl enable nginx
    print_success "Nginx установлен"
else
    print_success "Nginx уже установлен"
fi

print_info "Настройка виртуального хоста..."

# Заменить домен в конфигурации
sed "s/your-domain.com/$DOMAIN/g" deployment/nginx.conf | \
sudo tee /etc/nginx/sites-available/warehouse > /dev/null

sudo ln -sf /etc/nginx/sites-available/warehouse /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

print_info "Проверка конфигурации Nginx..."
sudo nginx -t

print_info "Перезапуск Nginx..."
sudo systemctl restart nginx

print_success "Nginx настроен"

###############################################################################
print_header "ШАГ 11: Настройка файрвола"
###############################################################################

if command -v ufw &> /dev/null; then
    print_info "Настройка UFW..."
    sudo ufw allow OpenSSH
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    sudo ufw --force enable
    print_success "Файрвол настроен"
fi

###############################################################################
print_header "ШАГ 12: Создание директории для логов"
###############################################################################

mkdir -p logs

print_success "Директория логов создана"

###############################################################################
print_header "УСТАНОВКА ЗАВЕРШЕНА!"
###############################################################################

print_success "Warehouse Management System успешно установлен!"
echo ""
echo -e "${GREEN}Данные для доступа:${NC}"
echo -e "  URL: http://$DOMAIN"
echo -e "  Логин: admin"
echo -e "  Пароль: admin123 ${YELLOW}(измените при первом входе!)${NC}"
echo ""
echo -e "${GREEN}База данных:${NC}"
echo -e "  Имя: $DB_NAME"
echo -e "  Пользователь: $DB_USER"
echo -e "  Пароль: $DB_PASSWORD"
echo ""
echo -e "${GREEN}Полезные команды:${NC}"
echo -e "  Статус приложения: ${YELLOW}pm2 status${NC}"
echo -e "  Логи приложения: ${YELLOW}pm2 logs warehouse${NC}"
echo -e "  Перезапуск: ${YELLOW}pm2 restart warehouse${NC}"
echo -e "  Статус Nginx: ${YELLOW}sudo systemctl status nginx${NC}"
echo ""
echo -e "${YELLOW}Рекомендации:${NC}"
echo -e "  1. Измените пароль администратора при первом входе"
echo -e "  2. Настройте SSL сертификат: ${YELLOW}sudo certbot --nginx -d $DOMAIN${NC}"
echo -e "  3. Настройте резервное копирование: ${YELLOW}crontab -e${NC}"
echo ""

print_success "Установка завершена успешно! 🚀"
