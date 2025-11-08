#!/bin/bash

# =====================================================
# Остановка Warehouse Management System
# =====================================================

# Цвета
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Остановка Warehouse Management System${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Проверка PID файла
if [ ! -f warehouse.pid ]; then
    echo -e "${YELLOW}⚠${NC} Сервер не запущен (файл warehouse.pid не найден)"
    echo ""
    
    # Проверяем процессы на порту 5000
    if lsof -ti:5000 > /dev/null 2>&1; then
        echo -e "${YELLOW}➜${NC} Найдены процессы на порту 5000, останавливаю..."
        lsof -ti:5000 | xargs kill -9 2>/dev/null || true
        echo -e "${GREEN}✓${NC} Процессы остановлены"
    fi
    
    echo ""
    exit 0
fi

# Читаем PID
PID=$(cat warehouse.pid)

# Проверяем существует ли процесс
if ! ps -p $PID > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠${NC} Процесс с PID $PID не найден"
    rm -f warehouse.pid
    
    # Проверяем порт 5000
    if lsof -ti:5000 > /dev/null 2>&1; then
        echo -e "${YELLOW}➜${NC} Найдены другие процессы на порту 5000, останавливаю..."
        lsof -ti:5000 | xargs kill -9 2>/dev/null || true
        echo -e "${GREEN}✓${NC} Процессы остановлены"
    fi
    
    echo ""
    exit 0
fi

# Останавливаем процесс
echo -e "${GREEN}➜${NC} Остановка сервера (PID: $PID)..."
kill $PID 2>/dev/null || kill -9 $PID 2>/dev/null

# Ждем остановки
sleep 2

# Проверяем что процесс остановлен
if ps -p $PID > /dev/null 2>&1; then
    echo -e "${YELLOW}➜${NC} Принудительная остановка..."
    kill -9 $PID 2>/dev/null || true
    sleep 1
fi

# Очищаем порт 5000 если занят
if lsof -ti:5000 > /dev/null 2>&1; then
    echo -e "${YELLOW}➜${NC} Очистка порта 5000..."
    lsof -ti:5000 | xargs kill -9 2>/dev/null || true
fi

# Удаляем PID файл
rm -f warehouse.pid

echo ""
echo -e "${GREEN}✓${NC} Сервер остановлен"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
