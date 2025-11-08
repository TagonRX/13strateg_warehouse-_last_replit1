#!/bin/bash

# =====================================================
# Автоматическая установка Warehouse Management System
# для Kubuntu 25.10
# =====================================================

set -e  # Остановка при ошибке

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функции вывода
print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}➜${NC} $1"
}

print_header "УСТАНОВКА WAREHOUSE MANAGEMENT SYSTEM"

echo "Эта программа автоматически установит:"
echo "  • Node.js 20"
echo "  • PostgreSQL"
echo "  • Warehouse Management System"
echo "  • Все необходимые пакеты и данные"
echo ""
echo "После установки вы сможете:"
echo "  • Запустить систему через ./start.sh"
echo "  • Войти как admin/admin123"
echo ""
read -p "Продолжить установку? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_info "Установка отменена"
    exit 0
fi

# =====================================================
# 1. Проверка и установка Node.js 20
# =====================================================
print_header "Шаг 1/7: Установка Node.js 20"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 20 ]; then
        print_success "Node.js $(node -v) уже установлен"
    else
        print_info "Установлена старая версия Node.js $(node -v)"
        print_info "Требуется Node.js 20+"
        print_info "Установка через nvm..."
        
        # Установка nvm
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
        
        # Загрузка nvm в текущую сессию
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        
        nvm install 20
        nvm use 20
        nvm alias default 20
        print_success "Node.js 20 установлен"
    fi
else
    print_info "Node.js не найден. Установка через nvm..."
    
    # Установка nvm
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    
    # Загрузка nvm в текущую сессию
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    nvm install 20
    nvm use 20
    nvm alias default 20
    print_success "Node.js 20 установлен"
fi

# =====================================================
# 2. Проверка и установка PostgreSQL
# =====================================================
print_header "Шаг 2/7: Установка PostgreSQL"

if command -v psql &> /dev/null; then
    print_success "PostgreSQL уже установлен"
else
    print_info "Установка PostgreSQL..."
    sudo apt-get update
    sudo apt-get install -y postgresql postgresql-contrib
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
    print_success "PostgreSQL установлен и запущен"
fi

# =====================================================
# 3. Создание базы данных
# =====================================================
print_header "Шаг 3/7: Создание базы данных"

DB_NAME="warehouse_local"
DB_USER="warehouse_user"
DB_PASSWORD="warehouse_pass123"

print_info "Создание пользователя и базы данных..."

# Удаляем старую БД если есть
sudo -u postgres psql -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>/dev/null || true
sudo -u postgres psql -c "DROP USER IF EXISTS $DB_USER;" 2>/dev/null || true

# Создаем нового пользователя и БД
sudo -u postgres psql << EOF
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
CREATE DATABASE $DB_NAME OWNER $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF

print_success "База данных создана"
print_success "  • База: $DB_NAME"
print_success "  • Пользователь: $DB_USER"
print_success "  • Пароль: $DB_PASSWORD"

# =====================================================
# 4. Создание .env файла
# =====================================================
print_header "Шаг 4/7: Создание конфигурации"

cat > .env << EOF
# PostgreSQL Database
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME

# Session Secret (для безопасности сессий)
SESSION_SECRET=$(openssl rand -hex 32)

# Node Environment
NODE_ENV=production
EOF

print_success ".env файл создан"

# =====================================================
# 5. Установка npm пакетов
# =====================================================
print_header "Шаг 5/7: Установка зависимостей"

print_info "Установка npm пакетов (это может занять несколько минут)..."
npm install --legacy-peer-deps

print_success "Все пакеты установлены"

# =====================================================
# 6. Применение схемы БД
# =====================================================
print_header "Шаг 6/7: Применение схемы базы данных"

print_info "Создание таблиц в базе данных..."
npm run db:push -- --force

print_success "Схема базы данных применена"

# =====================================================
# 7. Импорт данных
# =====================================================
print_header "Шаг 7/7: Импорт данных"

print_info "Импорт данных из data-export.json..."

# Создаем скрипт импорта
cat > import-data-auto.js << 'EOFIMPORT'
import { neon } from '@neondatabase/serverless';
import fs from 'fs/promises';

const sql = neon(process.env.DATABASE_URL);

async function importData() {
  try {
    console.log('Загрузка данных из data-export.json...');
    const dataStr = await fs.readFile('data-export.json', 'utf-8');
    const data = JSON.parse(dataStr);
    
    console.log('Начало импорта данных...');
    
    // Порядок импорта с учетом зависимостей
    const importOrder = [
      'users',
      'bulk_upload_sources',
      'csv_sources',
      'global_settings',
      'warehouse_settings',
      'scheduler_settings',
      'inventory_items',
      'archived_inventory_items',
      'active_locations',
      'pending_placements',
      'pending_tests',
      'tested_items',
      'faulty_stock',
      'picking_lists',
      'picking_tasks',
      'orders',
      'event_logs',
      'worker_analytics',
      'sku_errors',
      'import_runs',
      'csv_import_sessions',
      'migrations'
    ];
    
    for (const tableName of importOrder) {
      if (!data[tableName] || data[tableName].length === 0) {
        console.log(`  ⊘ ${tableName} - нет данных`);
        continue;
      }
      
      const rows = data[tableName];
      console.log(`  → ${tableName} - импорт ${rows.length} строк...`);
      
      // Получаем имена колонок из первой строки
      const columns = Object.keys(rows[0]);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      const columnNames = columns.join(', ');
      
      // Импортируем по одной строке
      let imported = 0;
      for (const row of rows) {
        try {
          const values = columns.map(col => row[col]);
          await sql(
            `INSERT INTO ${tableName} (${columnNames}) VALUES (${placeholders})`,
            values
          );
          imported++;
        } catch (err) {
          // Игнорируем дубликаты и другие ошибки
          if (!err.message.includes('duplicate') && !err.message.includes('unique')) {
            console.log(`    ⚠ Ошибка в строке: ${err.message.substring(0, 100)}`);
          }
        }
      }
      
      console.log(`  ✓ ${tableName} - импортировано ${imported}/${rows.length} строк`);
    }
    
    console.log('\n✓ Импорт завершен успешно!');
  } catch (error) {
    console.error('Ошибка импорта:', error);
    process.exit(1);
  }
}

importData();
EOFIMPORT

# Запускаем импорт
node import-data-auto.js

print_success "Данные импортированы"

# Удаляем временный скрипт
rm -f import-data-auto.js

# =====================================================
# Финальная информация
# =====================================================
print_header "УСТАНОВКА ЗАВЕРШЕНА!"

echo ""
echo -e "${GREEN}Система установлена и готова к работе!${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${BLUE}Как запустить систему:${NC}"
echo ""
echo "  1. Запуск сервера:"
echo -e "     ${GREEN}./start.sh${NC}"
echo ""
echo "  2. Откройте в браузере:"
echo -e "     ${GREEN}http://localhost:5000${NC}"
echo ""
echo "  3. Войдите в систему:"
echo -e "     Логин:  ${GREEN}admin${NC}"
echo -e "     Пароль: ${GREEN}admin123${NC}"
echo ""
echo "  4. Остановка сервера:"
echo -e "     ${GREEN}./stop.sh${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
print_success "Готово к использованию!"
echo ""
