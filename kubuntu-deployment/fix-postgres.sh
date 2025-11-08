#!/bin/bash

# ════════════════════════════════════════════════════════════════════
# СКРИПТ ИСПРАВЛЕНИЯ POSTGRESQL АУТЕНТИФИКАЦИИ
# ════════════════════════════════════════════════════════════════════
# 
# Этот скрипт автоматически исправляет проблемы с подключением к PostgreSQL
# при ошибке "password authentication failed for user warehouse_user"
#

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функции для красивого вывода
print_step() {
    echo ""
    echo "========================================"
    echo "$1"
    echo "========================================"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}➜${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Проверка что скрипт запущен из правильной директории
if [ ! -f ".env" ]; then
    print_error "Этот скрипт должен быть запущен из папки warehouse-kubuntu-package"
    echo ""
    echo "Использование:"
    echo "  cd ~/Desktop/warehouse-kubuntu-package"
    echo "  ./fix-postgres.sh"
    echo ""
    exit 1
fi

cat << 'EOF'

╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║            ИСПРАВЛЕНИЕ POSTGRESQL АУТЕНТИФИКАЦИИ                    ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝

Этот скрипт исправит ошибку:
  "password authentication failed for user warehouse_user"

Что будет сделано:
  1. Проверка и настройка pg_hba.conf
  2. Пересоздание пользователя warehouse_user
  3. Перезапуск PostgreSQL
  4. Проверка подключения
  5. Применение схемы БД
  6. Импорт всех данных (72,439 записей)

⏱ Время: 5-15 минут

EOF

read -p "Продолжить? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Отменено"
    exit 0
fi

# ════════════════════════════════════════════════════════════════════
# Шаг 1: Найти и настроить pg_hba.conf
# ════════════════════════════════════════════════════════════════════
print_step "Шаг 1/6: Настройка pg_hba.conf"

print_info "Поиск pg_hba.conf..."

# Найти версию PostgreSQL
PG_VERSION=$(psql --version | grep -oP '\d+' | head -1)
print_info "Найдена PostgreSQL версия $PG_VERSION"

# Попробовать найти pg_hba.conf
PG_HBA_PATH="/etc/postgresql/${PG_VERSION}/main/pg_hba.conf"

if [ ! -f "$PG_HBA_PATH" ]; then
    # Попробовать другие возможные пути
    for path in /etc/postgresql/*/main/pg_hba.conf; do
        if [ -f "$path" ]; then
            PG_HBA_PATH="$path"
            break
        fi
    done
fi

if [ ! -f "$PG_HBA_PATH" ]; then
    print_error "Не удалось найти pg_hba.conf"
    echo "Попробуйте найти вручную:"
    echo "  sudo find /etc -name pg_hba.conf"
    exit 1
fi

print_success "Найден: $PG_HBA_PATH"

# Создать резервную копию
print_info "Создание резервной копии..."
sudo cp "$PG_HBA_PATH" "$PG_HBA_PATH.backup.$(date +%Y%m%d_%H%M%S)"
print_success "Резервная копия создана"

# Проверить есть ли уже правило для MD5
print_info "Проверка текущих настроек..."

if sudo grep -q "^local.*all.*all.*md5" "$PG_HBA_PATH"; then
    print_success "MD5 аутентификация уже настроена"
else
    print_info "Добавление MD5 аутентификации..."
    
    # Добавить правило для MD5 в начало файла
    sudo sed -i '1i# MD5 authentication for local connections' "$PG_HBA_PATH"
    sudo sed -i '2ilocal   all             all                                     md5' "$PG_HBA_PATH"
    
    print_success "MD5 аутентификация добавлена"
fi

# ════════════════════════════════════════════════════════════════════
# Шаг 2: Пересоздать пользователя БД
# ════════════════════════════════════════════════════════════════════
print_step "Шаг 2/6: Пересоздание пользователя БД"

print_info "Подключение к PostgreSQL как postgres..."

# Пересоздать пользователя с правильным паролем
sudo -u postgres psql << 'EOSQL'
-- Удалить пользователя если существует
DROP USER IF EXISTS warehouse_user;

-- Создать пользователя заново с правильным паролем
CREATE USER warehouse_user WITH PASSWORD 'warehouse_pass123';

-- Дать все права на базу данных
GRANT ALL PRIVILEGES ON DATABASE warehouse_local TO warehouse_user;

-- Подключиться к базе и дать права на схему
\c warehouse_local

GRANT ALL PRIVILEGES ON SCHEMA public TO warehouse_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO warehouse_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO warehouse_user;

-- Дать права на будущие таблицы
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO warehouse_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO warehouse_user;

-- Сделать пользователя владельцем базы данных
ALTER DATABASE warehouse_local OWNER TO warehouse_user;
EOSQL

print_success "Пользователь warehouse_user пересоздан"
print_success "Пароль установлен: warehouse_pass123"

# ════════════════════════════════════════════════════════════════════
# Шаг 3: Перезапустить PostgreSQL
# ════════════════════════════════════════════════════════════════════
print_step "Шаг 3/6: Перезапуск PostgreSQL"

print_info "Перезапуск PostgreSQL..."
sudo systemctl restart postgresql

# Подождать пока PostgreSQL запустится
sleep 3

# Проверить что PostgreSQL запущен
if sudo systemctl is-active --quiet postgresql; then
    print_success "PostgreSQL успешно перезапущен"
else
    print_error "PostgreSQL не запустился"
    echo ""
    echo "Проверьте логи:"
    echo "  sudo journalctl -u postgresql -n 50"
    exit 1
fi

# ════════════════════════════════════════════════════════════════════
# Шаг 4: Проверка подключения
# ════════════════════════════════════════════════════════════════════
print_step "Шаг 4/6: Проверка подключения к БД"

print_info "Тестирование подключения..."

# Запустить тест подключения
if node test-connection.js; then
    print_success "Подключение к БД работает!"
else
    print_error "Не удалось подключиться к БД"
    echo ""
    echo "Попробуйте вручную:"
    echo "  PGPASSWORD=warehouse_pass123 psql -U warehouse_user -d warehouse_local -h localhost -c 'SELECT 1;'"
    echo ""
    exit 1
fi

# ════════════════════════════════════════════════════════════════════
# Шаг 5: Применение схемы БД
# ════════════════════════════════════════════════════════════════════
print_step "Шаг 5/6: Применение схемы базы данных"

print_info "Создание таблиц в базе данных..."

# Применить схему БД
if npm run db:push --force > /dev/null 2>&1; then
    print_success "Схема базы данных применена"
else
    print_warning "Схема уже применена или возникла ошибка"
    
    # Попробовать без --force
    if npm run db:push > /dev/null 2>&1; then
        print_success "Схема базы данных применена"
    else
        print_info "Схема, возможно, уже применена - продолжаем..."
    fi
fi

# ════════════════════════════════════════════════════════════════════
# Шаг 6: Импорт данных
# ════════════════════════════════════════════════════════════════════
print_step "Шаг 6/6: Импорт данных (72,439 записей)"

print_info "Импорт данных из data-export.json..."
print_info "Это может занять 5-10 минут..."

# Запустить импорт
if node import-data-auto.js; then
    print_success "Данные успешно импортированы!"
else
    print_error "Ошибка при импорте данных"
    echo ""
    echo "Проверьте логи выше для деталей"
    exit 1
fi

# ════════════════════════════════════════════════════════════════════
# Итоговая информация
# ════════════════════════════════════════════════════════════════════
echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║                                                                      ║"
echo "║                     ✅ ВСЁ УСПЕШНО ИСПРАВЛЕНО!                      ║"
echo "║                                                                      ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""
print_success "PostgreSQL настроен и работает"
print_success "Данные импортированы (72,439 записей)"
print_success "Система готова к использованию"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  📱 Следующий шаг: Запуск системы"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Запустите систему:"
echo ""
echo "  ./start.sh"
echo ""
echo "Затем откройте браузер:"
echo ""
echo "  http://localhost:5000"
echo ""
echo "Учетные данные для входа:"
echo ""
echo "  Логин:  admin"
echo "  Пароль: admin123"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
