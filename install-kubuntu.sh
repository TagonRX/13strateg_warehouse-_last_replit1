#!/bin/bash

# ══════════════════════════════════════════════════════════════════════════════
# ПОЛНАЯ УСТАНОВКА WAREHOUSE MANAGEMENT SYSTEM НА KUBUNTU 25.10
# ══════════════════════════════════════════════════════════════════════════════
# 
# Этот скрипт выполняет полную установку системы:
# 1. Node.js 20 LTS
# 2. PostgreSQL
# 3. База данных (пароль: 1234q)
# 4. Приложение и зависимости
# 5. PM2 и запуск сервера
# 6. Firewall (порты 22, 80, 443, 5000)
# 7. Nginx (опционально)
#
# Использование:
#   chmod +x install-kubuntu.sh
#   ./install-kubuntu.sh
#
# ══════════════════════════════════════════════════════════════════════════════

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Логирование
LOG_FILE="$(pwd)/installation.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo ""
echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                              ║"
echo "║         АВТОМАТИЧЕСКАЯ УСТАНОВКА WAREHOUSE MANAGEMENT SYSTEM                 ║"
echo "║                                                                              ║"
echo "║                         KUBUNTU 25.10 SERVER                                 ║"
echo "║                                                                              ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "→ Дата и время начала: $(date '+%Y-%m-%d %H:%M:%S')"
echo "→ Папка проекта: $(pwd)"
echo "→ Файл логов: $LOG_FILE"
echo "→ Пользователь: $USER"
echo "→ Система: $(uname -a)"
echo ""
echo "⏱️  Примерное время установки: 15-20 минут"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# ШАГ 1: УСТАНОВКА NODE.JS 20 LTS
# ══════════════════════════════════════════════════════════════════════════════
echo "════════════════════════════════════════════════════════════"
echo "  ШАГ 1: УСТАНОВКА NODE.JS 20 LTS"
echo "════════════════════════════════════════════════════════════"
echo ""

if command -v node &> /dev/null && [ "$(node -v | cut -d'.' -f1 | tr -d 'v')" -ge 20 ]; then
    echo "✓ Node.js $(node -v) уже установлен"
else
    echo "→ Установка Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    echo "✓ Node.js $(node -v) установлен"
fi

echo ""

# ══════════════════════════════════════════════════════════════════════════════
# ШАГ 2: УСТАНОВКА POSTGRESQL
# ══════════════════════════════════════════════════════════════════════════════
echo "════════════════════════════════════════════════════════════"
echo "  ШАГ 2: УСТАНОВКА POSTGRESQL"
echo "════════════════════════════════════════════════════════════"
echo ""

if command -v psql &> /dev/null; then
    echo "✓ PostgreSQL уже установлен: $(psql --version)"
else
    echo "→ Установка PostgreSQL..."
    sudo apt-get update
    sudo apt-get install -y postgresql postgresql-contrib
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
    echo "✓ PostgreSQL установлен"
fi

echo ""

# ══════════════════════════════════════════════════════════════════════════════
# ШАГ 3: НАСТРОЙКА БАЗЫ ДАННЫХ (ПАРОЛЬ: 1234q)
# ══════════════════════════════════════════════════════════════════════════════
echo "════════════════════════════════════════════════════════════"
echo "  ШАГ 3: НАСТРОЙКА БАЗЫ ДАННЫХ"
echo "════════════════════════════════════════════════════════════"
echo ""

DB_NAME="warehouse_db"
DB_USER="warehouse_user"
DB_PASSWORD="1234q"

echo "→ Создание пользователя и базы данных..."
sudo -u postgres psql << EOF
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = '$DB_USER') THEN
        CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME') THEN
        CREATE DATABASE $DB_NAME OWNER $DB_USER;
    END IF;
END
\$\$;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF

echo ""
echo "→ Создание файла .env..."

cat > .env << EOF
# Database
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME

# Session
NODE_ENV=production
SESSION_SECRET=$(openssl rand -base64 32)
PGPASSWORD=$DB_PASSWORD
EOF

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✓ База данных настроена"
echo ""
echo "Параметры подключения:"
echo "  База данных: $DB_NAME"
echo "  Пользователь: $DB_USER"
echo "  Пароль: $DB_PASSWORD"
echo "════════════════════════════════════════════════════════════"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# ШАГ 4: УСТАНОВКА ПРИЛОЖЕНИЯ
# ══════════════════════════════════════════════════════════════════════════════
echo "════════════════════════════════════════════════════════════"
echo "  ШАГ 4: УСТАНОВКА ПРИЛОЖЕНИЯ"
echo "════════════════════════════════════════════════════════════"
echo ""

if [ ! -f "package.json" ]; then
    echo "✗ Ошибка: package.json не найден!"
    echo "→ Убедитесь, что вы находитесь в папке проекта"
    exit 1
fi

echo "→ Установка зависимостей..."
npm install

echo ""
echo "→ Сборка приложения..."
npm run build

echo ""
echo "→ Синхронизация базы данных..."
npm run db:push || npm run db:push -- --force

echo ""
echo "→ Создание admin пользователя..."
npx tsx server/create-admin.ts

echo ""
echo "→ Установка PM2 (Process Manager)..."
sudo npm install -g pm2

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✓ Приложение установлено и готово к запуску"
echo "════════════════════════════════════════════════════════════"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# ШАГ 5: ЗАПУСК PM2 СЕРВЕРА
# ══════════════════════════════════════════════════════════════════════════════
echo "════════════════════════════════════════════════════════════"
echo "  ШАГ 5: ЗАПУСК СЕРВЕРА"
echo "════════════════════════════════════════════════════════════"
echo ""

# Останавливаем старый процесс
pm2 delete warehouse 2>/dev/null || true

# Читаем .env и экспортируем переменные для PM2
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

echo "→ Запуск сервера через PM2..."
pm2 start dist/index.js \
    --name warehouse \
    --time \
    -i 1 \
    --env production

pm2 save
pm2 startup | grep 'sudo' | bash || true

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✓ СЕРВЕР ЗАПУЩЕН!"
echo "════════════════════════════════════════════════════════════"
echo ""

# Получение IP
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$IP" ]; then
    IP="localhost"
fi

echo "→ Откройте в браузере: http://$IP:5000"
echo ""
echo "→ Данные для входа:"
echo "   Логин:  admin"
echo "   Пароль: admin123"
echo ""
echo "⚠️  ВАЖНО: Измените пароль после первого входа!"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# ШАГ 6: НАСТРОЙКА FIREWALL
# ══════════════════════════════════════════════════════════════════════════════
echo "════════════════════════════════════════════════════════════"
echo "  ШАГ 6: НАСТРОЙКА FIREWALL"
echo "════════════════════════════════════════════════════════════"
echo ""

if command -v ufw &> /dev/null; then
    echo "→ Настройка правил firewall..."
    sudo ufw allow 22/tcp comment 'SSH'
    sudo ufw allow 5000/tcp comment 'Warehouse App'
    sudo ufw allow 80/tcp comment 'HTTP'
    sudo ufw allow 443/tcp comment 'HTTPS'
    
    echo ""
    echo "→ Включение firewall..."
    sudo ufw --force enable
    
    echo ""
    echo "✓ Firewall настроен (порты 22, 80, 443, 5000 открыты)"
else
    echo "⚠ UFW не установлен, пропускаем настройку firewall"
fi

echo ""

# ══════════════════════════════════════════════════════════════════════════════
# ШАГ 7: NGINX (ОПЦИОНАЛЬНО)
# ══════════════════════════════════════════════════════════════════════════════
echo "════════════════════════════════════════════════════════════"
echo "  ШАГ 7: NGINX (ОПЦИОНАЛЬНО)"
echo "════════════════════════════════════════════════════════════"
echo ""

read -p "Установить Nginx? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "→ Установка Nginx..."
    sudo apt-get update
    sudo apt-get install -y nginx
    
    echo ""
    echo "→ Создание конфигурации Nginx..."
    
    sudo tee /etc/nginx/sites-available/warehouse << 'NGINX_EOF'
server {
    listen 80;
    server_name _;
    
    client_max_body_size 100M;
    
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
NGINX_EOF
    
    sudo ln -sf /etc/nginx/sites-available/warehouse /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    
    sudo nginx -t
    sudo systemctl restart nginx
    sudo systemctl enable nginx
    
    echo ""
    echo "✓ Nginx настроен"
    echo "   Приложение доступно на: http://$IP"
else
    echo "⊘ Nginx не установлен"
fi

echo ""

# ══════════════════════════════════════════════════════════════════════════════
# ФИНАЛЬНАЯ ПРОВЕРКА
# ══════════════════════════════════════════════════════════════════════════════
echo "════════════════════════════════════════════════════════════"
echo "  ФИНАЛЬНАЯ ПРОВЕРКА"
echo "════════════════════════════════════════════════════════════"
echo ""

sleep 3

echo "→ Проверка PM2..."
pm2 list

echo ""
echo "→ Проверка порта 5000..."
if nc -z localhost 5000 2>/dev/null; then
    echo "  ✓ Порт 5000 слушается"
else
    echo "  ⚠ Порт 5000 не слушается, проверьте логи: pm2 logs warehouse"
fi

echo ""
echo ""
echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                              ║"
echo "║                    ✅ УСТАНОВКА ЗАВЕРШЕНА!                                   ║"
echo "║                                                                              ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "→ Дата и время завершения: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
echo "════════════════════════════════════════════════════════════"
echo "📱 ДОСТУП К ПРИЛОЖЕНИЮ:"
echo "════════════════════════════════════════════════════════════"
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "  🌐 Через Nginx (рекомендуется):"
    echo "     http://$IP"
    echo ""
fi
echo "  🔧 Прямой доступ:"
echo "     http://$IP:5000"
echo ""
echo "  👤 Данные для входа:"
echo "     Логин:  admin"
echo "     Пароль: admin123"
echo ""
echo "════════════════════════════════════════════════════════════"
echo ""
echo "💡 ПОЛЕЗНЫЕ КОМАНДЫ:"
echo ""
echo "  Просмотр логов PM2:"
echo "    pm2 logs warehouse"
echo ""
echo "  Перезапуск приложения:"
echo "    pm2 restart warehouse"
echo ""
echo "  Статус PM2:"
echo "    pm2 status"
echo ""
echo "  Остановка приложения:"
echo "    pm2 stop warehouse"
echo ""
echo "  Запуск приложения:"
echo "    pm2 start warehouse"
echo ""
echo "════════════════════════════════════════════════════════════"
echo ""
echo "📋 ФАЙЛ С ПОЛНЫМИ ЛОГАМИ:"
echo "   $LOG_FILE"
echo ""
echo "   Если что-то не работает, покажите этот файл разработчику!"
echo ""
