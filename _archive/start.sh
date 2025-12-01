#!/bin/bash

# =====================================================
# Warehouse Management System - Start Script
# =====================================================
# Ручной запуск для тестирования

set -e

# Цвета
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_info() {
    echo -e "${BLUE}ℹ ${NC}$1"
}

print_success() {
    echo -e "${GREEN}✓ ${NC}$1"
}

print_warning() {
    echo -e "${YELLOW}⚠ ${NC}$1"
}

print_error() {
    echo -e "${RED}✗ ${NC}$1"
}

# Проверка что находимся в директории проекта
if [ ! -f "package.json" ]; then
    print_warning "package.json не найден!"
    print_info "Запустите скрипт из директории проекта:"
    print_info "cd /home/ruslan/Desktop/Main-project-13strategyexperts"
    print_info "./start.sh"
    exit 1
fi

# Проверка что .env существует
if [ ! -f ".env" ]; then
    print_warning ".env файл не найден!"
    print_info "Запустите сначала: ./setup.sh"
    exit 1
fi

# Проверка что PostgreSQL запущен
if ! sudo systemctl is-active --quiet postgresql; then
    print_info "Запуск PostgreSQL..."
    sudo systemctl start postgresql
    sleep 2
fi

# Проверка что порт 5000 свободен
if sudo lsof -Pi :5000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    print_warning "Порт 5000 уже занят!"
    print_info "Останавливаю существующий процесс..."
    sudo kill -9 $(sudo lsof -Pi :5000 -sTCP:LISTEN -t) 2>/dev/null || true
    sleep 2
fi

print_info "========================================"
print_info "  Запуск Warehouse Management System"
print_info "========================================"
echo ""

# Создаем директорию для логов если её нет
sudo mkdir -p /var/log/warehouse
sudo chown $USER:$USER /var/log/warehouse

print_success "Порт 5000 свободен"
print_success "PostgreSQL запущен"
echo ""
print_info "Запуск сервера..."
print_info "Логи: /var/log/warehouse/manual_run.log"
echo ""
print_info "Приложение доступно по адресу: ${GREEN}http://localhost:5000${NC}"
print_info "Для остановки нажмите: ${GREEN}Ctrl+C${NC}"
echo ""

# Запуск сервера с перенаправлением логов
npm run dev 2>&1 | tee /var/log/warehouse/manual_run.log
