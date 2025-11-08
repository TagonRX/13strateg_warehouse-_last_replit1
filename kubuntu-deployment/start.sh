#!/bin/bash

# =====================================================
# Запуск Warehouse Management System
# =====================================================

# Цвета
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Warehouse Management System${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Проверка существования PID файла
if [ -f warehouse.pid ]; then
    PID=$(cat warehouse.pid)
    if ps -p $PID > /dev/null 2>&1; then
        echo -e "${RED}✗${NC} Сервер уже запущен (PID: $PID)"
        echo ""
        echo "Для остановки выполните: ./stop.sh"
        echo ""
        exit 1
    else
        # Удаляем старый PID файл
        rm -f warehouse.pid
    fi
fi

# Проверка .env файла
if [ ! -f .env ]; then
    echo -e "${RED}✗${NC} Файл .env не найден!"
    echo ""
    echo "Сначала запустите установку: ./install.sh"
    echo ""
    exit 1
fi

# Загрузка nvm если установлен
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Запуск сервера
echo -e "${GREEN}➜${NC} Запуск сервера..."
echo ""

nohup npm run dev > warehouse.log 2>&1 &
SERVER_PID=$!

# Сохраняем PID
echo $SERVER_PID > warehouse.pid

# Ждем запуска сервера
echo -n "  Ожидание запуска"
for i in {1..15}; do
    if curl -s http://localhost:5000 > /dev/null 2>&1; then
        echo ""
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

# Проверка что сервер запущен
if curl -s http://localhost:5000 > /dev/null 2>&1; then
    echo ""
    echo -e "${GREEN}✓${NC} Сервер успешно запущен!"
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  📍 URL:    http://localhost:5000"
    echo "  👤 Логин:  admin"
    echo "  🔑 Пароль: admin123"
    echo ""
    echo "  📝 Логи:   tail -f warehouse.log"
    echo "  🛑 Стоп:   ./stop.sh"
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
else
    echo ""
    echo -e "${RED}✗${NC} Ошибка запуска сервера"
    echo ""
    echo "Проверьте логи: tail -f warehouse.log"
    echo ""
    # Удаляем PID файл при ошибке
    rm -f warehouse.pid
    exit 1
fi
