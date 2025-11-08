#!/bin/bash

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

if [ -f warehouse.pid ]; then
    PID=$(cat warehouse.pid)
    if ps -p $PID > /dev/null 2>&1; then
        kill $PID
        rm -f warehouse.pid
        echo -e "${GREEN}✓${NC} Сервер остановлен"
    else
        rm -f warehouse.pid
        echo -e "${RED}✗${NC} Сервер не запущен"
    fi
else
    echo -e "${RED}✗${NC} Сервер не запущен"
fi
