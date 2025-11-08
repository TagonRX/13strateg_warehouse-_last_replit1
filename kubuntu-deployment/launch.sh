#!/bin/bash

# ══════════════════════════════════════════════════════════════════════════════
# ЗАПУСК / ПЕРЕЗАПУСК WAREHOUSE MANAGEMENT SYSTEM
# ══════════════════════════════════════════════════════════════════════════════

set -e

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  ЗАПУСК WAREHOUSE MANAGEMENT SYSTEM"
echo "════════════════════════════════════════════════════════════"
echo ""

# Проверка что приложение собрано
if [ ! -d "dist" ]; then
    echo "✗ Приложение не собрано!"
    echo "→ Запустите: npm run build"
    exit 1
fi

# Проверка .env
if [ ! -f ".env" ]; then
    echo "✗ Файл .env не найден!"
    echo "→ Запустите сначала: ./install-kubuntu.sh"
    exit 1
fi

# Останавливаем старый процесс
echo "→ Остановка старого процесса..."
pm2 delete warehouse 2>/dev/null || true

# Читаем .env и экспортируем переменные для PM2
echo "→ Загрузка переменных из .env..."
set -a
source .env
set +a

# Запускаем PM2
echo "→ Запуск сервера через PM2..."
pm2 start dist/index.js \
    --name warehouse \
    --time \
    -i 1 \
    --env production

# Сохраняем конфигурацию
pm2 save

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
echo "════════════════════════════════════════════════════════════"
echo ""
echo "💡 ПОЛЕЗНЫЕ КОМАНДЫ:"
echo ""
echo "  Просмотр логов:"
echo "    pm2 logs warehouse"
echo ""
echo "  Статус:"
echo "    pm2 status"
echo ""
echo "  Остановка:"
echo "    pm2 stop warehouse"
echo ""
echo "  Перезапуск:"
echo "    pm2 restart warehouse"
echo ""
