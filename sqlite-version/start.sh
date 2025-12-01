#!/bin/bash

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Warehouse Management System (SQLite)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ -f warehouse.pid ]; then
    PID=$(cat warehouse.pid)
    if ps -p $PID > /dev/null 2>&1; then
        echo -e "${RED}✗${NC} Сервер уже запущен (PID: $PID)"
        echo "Остановите: ./stop.sh"
        exit 1
    fi
    rm -f warehouse.pid
fi

echo -e "${GREEN}➜${NC} Запуск сервера..."
nohup npm run dev > warehouse.log 2>&1 &
echo $! > warehouse.pid

sleep 3
for i in {1..15}; do
    if curl -s http://localhost:5000 > /dev/null 2>&1; then
        break
    fi
    sleep 1
done

if curl -s http://localhost:5000 > /dev/null 2>&1; then
    echo ""
    echo -e "${GREEN}✓${NC} Сервер запущен!"
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  📍 URL:    http://localhost:5000"
    echo "  👤 Логин:  admin"
    echo "  🔑 Пароль: admin123"
    echo ""
    echo "  📁 БД:     ./warehouse.db"
    echo "  📝 Логи:   tail -f warehouse.log"
    echo "  🛑 Стоп:   ./stop.sh"
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
else
    echo -e "${RED}✗${NC} Ошибка запуска"
    echo "Смотрите: tail -f warehouse.log"
    rm -f warehouse.pid
    exit 1
fi
