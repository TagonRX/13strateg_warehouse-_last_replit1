#!/bin/bash

# =====================================================
# Warehouse Management System - Log Collection Script
# =====================================================
# Собирает все логи для отправки на диагностику

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

# Создаем временную директорию для сбора логов
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TEMP_DIR="/tmp/warehouse_logs_$TIMESTAMP"
ARCHIVE_NAME="warehouse-logs-$(date +%Y-%m-%d-%H%M%S).tar.gz"

mkdir -p "$TEMP_DIR"

print_info "Сбор логов Warehouse Management System..."
echo ""

# =====================================================
# 1. Системная информация
# =====================================================
print_info "[1/7] Сбор системной информации..."

cat > "$TEMP_DIR/system_info.txt" << EOF
=== СИСТЕМНАЯ ИНФОРМАЦИЯ ===
Дата сбора: $(date)
Hostname: $(hostname)
ОС: $(lsb_release -d | cut -f2)
Версия ядра: $(uname -r)

=== ВЕРСИИ ПРОГРАММ ===
Node.js: $(node -v 2>&1 || echo "не установлен")
npm: $(npm -v 2>&1 || echo "не установлен")
PostgreSQL: $(psql --version 2>&1 || echo "не установлен")

=== ПАМЯТЬ И ДИСК ===
$(free -h)

=== ДИСК ===
$(df -h)

=== ЗАПУЩЕННЫЕ ПРОЦЕССЫ ===
$(ps aux | grep -E "(node|postgres|warehouse)" | grep -v grep)

=== ПОРТЫ ===
$(sudo netstat -tlnp 2>/dev/null | grep -E ":(5000|5432)" || echo "netstat не доступен")
EOF

print_success "Системная информация собрана"

# =====================================================
# 2. Конфигурационные файлы
# =====================================================
print_info "[2/7] Сбор конфигурационных файлов..."

# .env (без паролей)
if [ -f ".env" ]; then
    cat .env | sed 's/PASSWORD=.*/PASSWORD=***HIDDEN***/g' | sed 's/SECRET=.*/SECRET=***HIDDEN***/g' > "$TEMP_DIR/env_sanitized.txt"
fi

# package.json
if [ -f "package.json" ]; then
    cp package.json "$TEMP_DIR/"
fi

# drizzle.config.ts
if [ -f "drizzle.config.ts" ]; then
    cp drizzle.config.ts "$TEMP_DIR/"
fi

print_success "Конфигурационные файлы собраны"

# =====================================================
# 3. Логи приложения
# =====================================================
print_info "[3/7] Сбор логов приложения..."

if [ -d "/var/log/warehouse" ]; then
    cp -r /var/log/warehouse "$TEMP_DIR/app_logs"
    print_success "Логи приложения собраны"
else
    echo "Директория /var/log/warehouse не существует" > "$TEMP_DIR/app_logs_missing.txt"
    print_info "Директория логов приложения отсутствует"
fi

# =====================================================
# 4. Systemd логи
# =====================================================
print_info "[4/7] Сбор systemd логов..."

if systemctl list-unit-files | grep -q warehouse.service; then
    journalctl -u warehouse.service --no-pager -n 500 > "$TEMP_DIR/systemd_warehouse.log" 2>&1
    print_success "Systemd логи собраны"
else
    echo "Сервис warehouse.service не установлен" > "$TEMP_DIR/systemd_not_installed.txt"
    print_info "Systemd сервис не установлен"
fi

# =====================================================
# 5. PostgreSQL логи
# =====================================================
print_info "[5/7] Сбор PostgreSQL логов..."

# Путь к логам PostgreSQL на Ubuntu/Kubuntu
PG_LOG_DIR="/var/log/postgresql"

if [ -d "$PG_LOG_DIR" ]; then
    # Копируем только последний лог-файл
    LATEST_PG_LOG=$(sudo ls -t $PG_LOG_DIR/*.log 2>/dev/null | head -1)
    if [ -n "$LATEST_PG_LOG" ]; then
        sudo tail -n 1000 "$LATEST_PG_LOG" > "$TEMP_DIR/postgresql.log" 2>&1
        print_success "PostgreSQL логи собраны"
    else
        echo "Логи PostgreSQL не найдены" > "$TEMP_DIR/postgresql_logs_missing.txt"
        print_info "Логи PostgreSQL не найдены"
    fi
else
    echo "Директория $PG_LOG_DIR не существует" > "$TEMP_DIR/postgresql_dir_missing.txt"
    print_info "Директория PostgreSQL логов отсутствует"
fi

# Статус PostgreSQL
sudo systemctl status postgresql > "$TEMP_DIR/postgresql_status.txt" 2>&1 || true

# =====================================================
# 6. Database schema и статистика
# =====================================================
print_info "[6/7] Сбор информации о БД..."

if [ -f ".env" ]; then
    source .env
    
    # Получаем список таблиц
    psql "$DATABASE_URL" -c "\dt" > "$TEMP_DIR/db_tables.txt" 2>&1 || echo "Не удалось подключиться к БД" > "$TEMP_DIR/db_error.txt"
    
    # Получаем размер БД
    psql "$DATABASE_URL" -c "SELECT pg_size_pretty(pg_database_size('$PGDATABASE'));" > "$TEMP_DIR/db_size.txt" 2>&1 || true
    
    # Получаем статистику по таблицам
    psql "$DATABASE_URL" -c "SELECT schemaname,tablename,n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;" > "$TEMP_DIR/db_stats.txt" 2>&1 || true
    
    print_success "Информация о БД собрана"
else
    echo ".env файл не найден" > "$TEMP_DIR/db_no_env.txt"
    print_info ".env файл отсутствует"
fi

# =====================================================
# 7. Недавние ошибки из syslog
# =====================================================
print_info "[7/7] Сбор системных ошибок..."

sudo journalctl -p err -n 200 --no-pager > "$TEMP_DIR/system_errors.log" 2>&1 || true

print_success "Системные ошибки собраны"

# =====================================================
# Создание архива
# =====================================================
print_info "Создание архива..."

cd /tmp
tar -czf "$ARCHIVE_NAME" "warehouse_logs_$TIMESTAMP"

# Перемещаем архив в текущую директорию
mv "/tmp/$ARCHIVE_NAME" "$OLDPWD/"

# Очистка
rm -rf "$TEMP_DIR"

echo ""
print_success "========================================"
print_success "   Логи успешно собраны!"
print_success "========================================"
echo ""
print_info "Архив создан: ${GREEN}$ARCHIVE_NAME${NC}"
print_info "Размер: $(du -h "$OLDPWD/$ARCHIVE_NAME" | cut -f1)"
echo ""
print_info "Отправьте этот файл для диагностики проблем"
echo ""
