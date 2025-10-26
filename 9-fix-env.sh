#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
# Шаг 9: Исправление .env файла и перезапуск
# ═══════════════════════════════════════════════════════════════════════════
#
# Этот скрипт исправляет проблему "DATABASE_URL must be set"
# Он создаёт .env файл в правильном месте и перезапускает PM2
# ═══════════════════════════════════════════════════════════════════════════

set -e

echo "════════════════════════════════════════════════════════════"
echo "  ШАГ 9: ИСПРАВЛЕНИЕ .ENV И ПЕРЕЗАПУСК"
echo "════════════════════════════════════════════════════════════"
echo ""

# Определяем папку проекта (где находится этот скрипт)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "→ Текущая папка проекта: $SCRIPT_DIR"
echo ""

# Проверяем есть ли файл .env
if [ -f ".env" ]; then
    echo "→ Файл .env найден, проверяем содержимое..."
    
    if grep -q "DATABASE_URL=postgresql://" .env; then
        echo "  ✓ DATABASE_URL присутствует в .env"
    else
        echo "  ✗ DATABASE_URL отсутствует или неправильный"
        echo ""
        echo "→ Пересоздаём .env файл..."
        rm -f .env
    fi
else
    echo "→ Файл .env не найден, создаём..."
fi

# Создаём или пересоздаём .env файл
if [ ! -f ".env" ] || ! grep -q "DATABASE_URL=postgresql://" .env; then
    echo ""
    echo "→ Создание .env файла с правильными параметрами..."
    
    # Генерируем SESSION_SECRET
    SESSION_SECRET=$(openssl rand -base64 32 | tr -d '\n')
    
    cat > .env << EOF
# Database Connection
DATABASE_URL=postgresql://warehouse_user:1234q@localhost:5432/warehouse_db

# Session Secret
SESSION_SECRET=${SESSION_SECRET}

# Server Configuration
NODE_ENV=production
PORT=5000
HOST=0.0.0.0

# PostgreSQL Connection Details
PGHOST=localhost
PGPORT=5432
PGUSER=warehouse_user
PGPASSWORD=1234q
PGDATABASE=warehouse_db
EOF

    chmod 600 .env
    echo "  ✓ Файл .env создан"
fi

echo ""
echo "→ Проверка содержимого .env:"
echo "────────────────────────────────────────────────────────────"
cat .env | grep -v "SESSION_SECRET" | grep -v "PGPASSWORD"
echo "  SESSION_SECRET=****** (скрыт)"
echo "  PGPASSWORD=****** (скрыт)"
echo "────────────────────────────────────────────────────────────"

echo ""
echo "→ Остановка PM2..."
pm2 delete warehouse 2>/dev/null || true

echo ""
echo "→ Запуск PM2 с правильным путём..."
cd "$SCRIPT_DIR"

# Запускаем PM2 через ecosystem.config.cjs (правильно загружает .env)
echo "  ✓ Использую ecosystem.config.cjs для правильной загрузки .env"
pm2 start ecosystem.config.cjs

# Настройка автозапуска
pm2 save
pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || true

echo ""
echo "→ Ожидание запуска приложения (5 секунд)..."
sleep 5

echo ""
echo "→ Проверка статуса PM2:"
pm2 list

echo ""
echo "→ Проверка последних логов:"
pm2 logs warehouse --lines 10 --nostream || true

echo ""
echo "→ Проверка порта 5000:"
if sudo ss -tulpn | grep -q ":5000"; then
    echo "  ✓ Порт 5000 слушается"
else
    echo "  ✗ Порт 5000 не слушается"
    echo ""
    echo "  Показываю последние 20 строк логов для диагностики:"
    pm2 logs warehouse --lines 20 --nostream || true
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✓ Исправление завершено"
echo ""
echo "Текущий статус:"
pm2 status
echo ""
echo "════════════════════════════════════════════════════════════"
echo ""
echo "📱 ДОСТУП К ПРИЛОЖЕНИЮ:"
echo ""
SERVER_IP=$(hostname -I | awk '{print $1}')
echo "  🌐 Через Nginx:"
echo "     http://$SERVER_IP"
echo ""
echo "  🔧 Прямой доступ:"
echo "     http://$SERVER_IP:5000"
echo ""
echo "  👤 Данные для входа:"
echo "     Логин:  admin"
echo "     Пароль: admin123"
echo ""
echo "════════════════════════════════════════════════════════════"
echo ""
echo "💡 ЕСЛИ ПРОБЛЕМА ОСТАЁТСЯ:"
echo ""
echo "  1. Проверьте логи подробно:"
echo "     pm2 logs warehouse"
echo ""
echo "  2. Проверьте .env файл:"
echo "     cat .env"
echo ""
echo "  3. Проверьте базу данных:"
echo "     sudo -u postgres psql -c \"\\l\" | grep warehouse"
echo ""
echo "  4. Запустите финальную проверку:"
echo "     ./8-final-check.sh"
echo ""
