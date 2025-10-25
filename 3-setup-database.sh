#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
# Шаг 3: Настройка базы данных
# ═══════════════════════════════════════════════════════════════════════════

set -e

echo "════════════════════════════════════════════════════════════"
echo "  ШАГ 3: НАСТРОЙКА БАЗЫ ДАННЫХ"
echo "════════════════════════════════════════════════════════════"
echo ""

# Параметры БД (можно изменить)
DB_NAME="warehouse_db"
DB_USER="warehouse_user"
DB_PASS="warehouse_pass_$(date +%s)"

echo "→ Создание пользователя и базы данных..."

# Создание пользователя и БД
sudo -u postgres psql << EOF
-- Создание пользователя
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = '$DB_USER') THEN
        CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';
    END IF;
END
\$\$;

-- Создание базы данных
SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_USER'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec

-- Права доступа
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF

echo ""
echo "→ Создание файла .env..."

# Создание .env файла
cat > .env << EOF
# Database
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME

# Session
SESSION_SECRET=$(openssl rand -base64 32)
NODE_ENV=production
EOF

chmod 600 .env

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✓ База данных настроена"
echo ""
echo "Параметры подключения:"
echo "  База данных: $DB_NAME"
echo "  Пользователь: $DB_USER"
echo "  Пароль сохранён в .env"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "→ Следующий шаг: ./4-install-app.sh"
