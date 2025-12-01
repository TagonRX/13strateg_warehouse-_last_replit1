#!/bin/bash

# =====================================================
# Warehouse Management System - Stop Script
# =====================================================
# Остановка сервера

set -e

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
    echo -e "${BLUE}ℹ ${NC}$1"
}

print_success() {
    echo -e "${GREEN}✓ ${NC}$1"
}

print_info "Остановка Warehouse Management System..."

# Остановка через systemd если запущен как сервис
if systemctl list-unit-files | grep -q warehouse.service; then
    if sudo systemctl is-active --quiet warehouse; then
        sudo systemctl stop warehouse
        print_success "Systemd сервис остановлен"
    fi
fi

# Остановка процессов на порту 5000
if sudo lsof -Pi :5000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    print_info "Остановка процессов на порту 5000..."
    sudo kill $(sudo lsof -Pi :5000 -sTCP:LISTEN -t) 2>/dev/null || true
    sleep 2
    print_success "Процессы остановлены"
fi

# Остановка Node.js процессов warehouse
WAREHOUSE_PIDS=$(ps aux | grep -E "npm run dev|warehouse" | grep -v grep | awk '{print $2}')
if [ -n "$WAREHOUSE_PIDS" ]; then
    print_info "Остановка warehouse процессов..."
    echo "$WAREHOUSE_PIDS" | xargs kill 2>/dev/null || true
    sleep 1
    print_success "Все процессы остановлены"
fi

print_success "Warehouse Management System остановлен"
