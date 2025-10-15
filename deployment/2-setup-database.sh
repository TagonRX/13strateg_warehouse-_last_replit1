#!/bin/bash
# Скрипт 2: Настройка базы данных PostgreSQL
# Запускать с правами root: sudo bash 2-setup-database.sh

set -e

echo "================================================"
echo "  Настройка базы данных PostgreSQL"
echo "================================================"

# Генерация случайного пароля для БД
DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
SESSION_SECRET=$(openssl rand -base64 32)

echo "Создание пользователя и базы данных..."
sudo -u postgres psql << EOF
-- Создание пользователя
CREATE USER warehouse_user WITH PASSWORD '$DB_PASSWORD';

-- Создание базы данных
CREATE DATABASE warehouse_db OWNER warehouse_user;

-- Предоставление прав
GRANT ALL PRIVILEGES ON DATABASE warehouse_db TO warehouse_user;

\c warehouse_db

-- Предоставление прав на схему
GRANT ALL ON SCHEMA public TO warehouse_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO warehouse_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO warehouse_user;

-- Установка прав по умолчанию
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO warehouse_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO warehouse_user;
EOF

# Создание файла .env с настройками
echo "Создание файла конфигурации..."
cat > /opt/warehouse/warehouse.env << EOF
# Database configuration
DATABASE_URL=postgresql://warehouse_user:$DB_PASSWORD@localhost:5432/warehouse_db
PGHOST=localhost
PGPORT=5432
PGUSER=warehouse_user
PGPASSWORD=$DB_PASSWORD
PGDATABASE=warehouse_db

# Session secret
SESSION_SECRET=$SESSION_SECRET

# Node environment
NODE_ENV=production
PORT=5000
EOF

# Установка прав на файл
chmod 600 /opt/warehouse/warehouse.env

echo "================================================"
echo "  ✅ База данных настроена!"
echo "================================================"
echo ""
echo "База данных: warehouse_db"
echo "Пользователь: warehouse_user"
echo "Пароль сохранен в: /opt/warehouse/warehouse.env"
echo ""
echo "Следующий шаг: sudo bash 3-install-app.sh"
