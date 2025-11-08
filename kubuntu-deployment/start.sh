#!/bin/bash

# ═══════════════════════════════════════════════════════════════════
# ЗАПУСК WAREHOUSE MANAGEMENT SYSTEM
# Использует настройки из kubuntu-config.js
# ═══════════════════════════════════════════════════════════════════

# Цвета
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Warehouse Management System${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Проверка конфига
if [ ! -f "kubuntu-config.js" ]; then
    echo -e "${RED}❌ Ошибка: Не найден файл kubuntu-config.js${NC}"
    exit 1
fi

# Читаем порт из конфига
SERVER_PORT=$(node -p "require('./kubuntu-config.js').server.port" 2>/dev/null || echo "5000")

# Проверка PID
if [ -f warehouse.pid ]; then
    PID=$(cat warehouse.pid)
    if ps -p $PID > /dev/null 2>&1; then
        echo -e "${RED}✗${NC} Сервер уже запущен (PID: $PID)"
        echo ""
        echo "Остановите: ./stop.sh"
        exit 1
    fi
    rm -f warehouse.pid
fi

# Загрузка nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Запуск
echo -e "${GREEN}➜${NC} Запуск сервера..."
nohup npm run dev > warehouse.log 2>&1 &
echo $! > warehouse.pid

# Ожидание
sleep 3
for i in {1..15}; do
    if curl -s http://localhost:$SERVER_PORT > /dev/null 2>&1; then
        break
    fi
    sleep 1
done

# Проверка
if curl -s http://localhost:$SERVER_PORT > /dev/null 2>&1; then
    echo ""
    echo -e "${GREEN}✓${NC} Сервер запущен!"
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  📍 URL:    http://localhost:$SERVER_PORT"
    echo "  👤 Логин:  admin"
    echo "  🔑 Пароль: admin123"
    echo ""
    echo "  📝 Логи:   tail -f warehouse.log"
    echo "  🛑 Стоп:   ./stop.sh"
    echo ""
    echo -e "${YELLOW}  ⚙️  Настройки: kubuntu-config.js${NC}"
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
else
    echo -e "${RED}✗${NC} Ошибка запуска"
    echo "Смотрите: tail -f warehouse.log"
    rm -f warehouse.pid
    exit 1
fi
