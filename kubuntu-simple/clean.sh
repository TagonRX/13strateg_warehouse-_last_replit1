#!/bin/bash

# =====================================================
# ПОЛНАЯ ОЧИСТКА СИСТЕМЫ
# Удаляет ВСЕ: БД, node_modules, логи
# =====================================================

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

echo ""
echo -e "${RED}⚠  ВНИМАНИЕ! ПОЛНАЯ ОЧИСТКА${NC}"
echo ""
echo "Будет удалено:"
echo "  • База данных warehouse_local"
echo "  • node_modules/"
echo "  • warehouse.log, warehouse.pid"
echo "  • .env файл"
echo ""
read -p "Продолжить? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
fi

# Остановка сервера
if [ -f warehouse.pid ]; then
    PID=$(cat warehouse.pid)
    if ps -p $PID > /dev/null 2>&1; then
        echo -e "${YELLOW}➜${NC} Остановка сервера..."
        kill $PID
    fi
fi

# Удаление БД
echo -e "${YELLOW}➜${NC} Удаление базы данных..."
psql -U postgres -c "DROP DATABASE IF EXISTS warehouse_local;" 2>/dev/null || true

# Удаление файлов
echo -e "${YELLOW}➜${NC} Удаление файлов..."
rm -rf node_modules
rm -f warehouse.log warehouse.pid .env

echo ""
echo -e "${GREEN}✓${NC} Очистка завершена"
echo ""
echo "Для новой установки запустите: ./install.sh"
echo ""
