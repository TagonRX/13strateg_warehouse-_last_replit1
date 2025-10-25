#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
# Warehouse Management System - Скрипт Запуска
# ═══════════════════════════════════════════════════════════════════════════

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функция вывода
print_header() {
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# ═══════════════════════════════════════════════════════════════════════════
# Определение режима запуска
# ═══════════════════════════════════════════════════════════════════════════

MODE="${1:-auto}"

if [ "$MODE" = "auto" ]; then
    # Автоматически определить режим
    if command -v pm2 &> /dev/null; then
        MODE="production"
    else
        MODE="development"
    fi
fi

print_header "WAREHOUSE MANAGEMENT SYSTEM"

echo ""
echo -e "Режим запуска: ${GREEN}${MODE}${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# Проверка зависимостей
# ═══════════════════════════════════════════════════════════════════════════

print_info "Проверка зависимостей..."

# Проверка Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js не установлен!"
    echo "Установите Node.js 20+ и запустите скрипт снова."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Требуется Node.js 18+. Установлена версия: $(node -v)"
    exit 1
fi

print_success "Node.js $(node -v)"

# Проверка npm
if ! command -v npm &> /dev/null; then
    print_error "npm не установлен!"
    exit 1
fi

print_success "npm $(npm -v)"

# ═══════════════════════════════════════════════════════════════════════════
# Установка зависимостей
# ═══════════════════════════════════════════════════════════════════════════

if [ ! -d "node_modules" ]; then
    print_info "Установка зависимостей..."
    if [ "$MODE" = "production" ]; then
        npm install --production
    else
        npm install
    fi
    print_success "Зависимости установлены"
else
    print_success "Зависимости уже установлены"
fi

# ═══════════════════════════════════════════════════════════════════════════
# Проверка переменных окружения
# ═══════════════════════════════════════════════════════════════════════════

if [ ! -f ".env" ]; then
    print_info "Файл .env не найден"
    
    if [ -f "deployment/.env.production.example" ]; then
        print_info "Создание .env из примера..."
        cp deployment/.env.production.example .env
        
        # Генерация случайного SESSION_SECRET
        SESSION_SECRET=$(openssl rand -base64 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)
        
        # Замена в .env
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/your-secret-session-key-change-this/${SESSION_SECRET}/" .env
        else
            sed -i "s/your-secret-session-key-change-this/${SESSION_SECRET}/" .env
        fi
        
        print_success "Файл .env создан"
        print_info "⚠️  Проверьте настройки в .env перед запуском в production!"
    else
        print_error "Не найден пример .env файла!"
        exit 1
    fi
fi

# Проверка DATABASE_URL
if ! grep -q "DATABASE_URL" .env 2>/dev/null; then
    print_error "DATABASE_URL не найден в .env"
    exit 1
fi

print_success "Переменные окружения настроены"

# ═══════════════════════════════════════════════════════════════════════════
# Запуск в режиме DEVELOPMENT
# ═══════════════════════════════════════════════════════════════════════════

if [ "$MODE" = "development" ] || [ "$MODE" = "dev" ]; then
    print_header "ЗАПУСК В РЕЖИМЕ РАЗРАБОТКИ"
    
    print_info "Синхронизация базы данных..."
    npm run db:push 2>/dev/null || npm run db:push -- --force
    print_success "База данных синхронизирована"
    
    echo ""
    print_success "Запуск приложения на http://localhost:5000"
    print_info "Логин: admin / Пароль: admin123"
    echo ""
    
    # Запуск в development режиме
    npm run dev
fi

# ═══════════════════════════════════════════════════════════════════════════
# Запуск в режиме PRODUCTION
# ═══════════════════════════════════════════════════════════════════════════

if [ "$MODE" = "production" ] || [ "$MODE" = "prod" ]; then
    print_header "ЗАПУСК В РЕЖИМЕ PRODUCTION"
    
    # Проверка PM2
    if ! command -v pm2 &> /dev/null; then
        print_error "PM2 не установлен!"
        print_info "Установка PM2..."
        npm install -g pm2
        print_success "PM2 установлен"
    fi
    
    print_success "PM2 $(pm2 -v)"
    
    # Сборка приложения
    if [ ! -d "dist" ] || [ "$2" = "--rebuild" ]; then
        print_info "Сборка приложения..."
        npm run build
        print_success "Приложение собрано"
    else
        print_success "Приложение уже собрано (используйте --rebuild для пересборки)"
    fi
    
    # Синхронизация БД
    print_info "Синхронизация базы данных..."
    npm run db:push 2>/dev/null || npm run db:push -- --force
    print_success "База данных синхронизирована"
    
    # Запуск через PM2
    if [ -f "deployment/ecosystem.config.js" ]; then
        print_info "Запуск через PM2..."
        
        # Остановка старого процесса
        pm2 delete warehouse 2>/dev/null || true
        
        # Запуск нового
        pm2 start deployment/ecosystem.config.js --env production
        
        # Сохранение для автозапуска
        pm2 save
        
        print_success "Приложение запущено через PM2"
        
        echo ""
        print_info "Управление приложением:"
        echo "  pm2 status              - статус"
        echo "  pm2 logs warehouse      - логи"
        echo "  pm2 restart warehouse   - перезапуск"
        echo "  pm2 stop warehouse      - остановка"
        echo "  pm2 monit               - мониторинг"
        echo ""
        
        # Показать статус
        pm2 status
        
        echo ""
        print_success "Приложение работает!"
        
        # Получить IP адрес
        IP=$(hostname -I 2>/dev/null | awk '{print $1}')
        if [ -z "$IP" ]; then
            IP="localhost"
        fi
        
        echo ""
        print_info "Откройте в браузере: http://${IP}:5000"
        print_info "Логин: admin / Пароль: admin123"
        echo ""
        
    else
        print_error "Файл ecosystem.config.js не найден!"
        print_info "Запуск через node..."
        NODE_ENV=production node dist/index.js
    fi
fi

# ═══════════════════════════════════════════════════════════════════════════
# Справка
# ═══════════════════════════════════════════════════════════════════════════

if [ "$MODE" = "help" ] || [ "$MODE" = "--help" ] || [ "$MODE" = "-h" ]; then
    print_header "СПРАВКА"
    echo ""
    echo "Использование: ./start.sh [режим] [опции]"
    echo ""
    echo "Режимы:"
    echo "  auto         - Автоматический выбор режима (по умолчанию)"
    echo "  development  - Режим разработки (npm run dev)"
    echo "  production   - Production режим (PM2 + build)"
    echo ""
    echo "Опции (для production):"
    echo "  --rebuild    - Принудительная пересборка приложения"
    echo ""
    echo "Примеры:"
    echo "  ./start.sh                    # Автоматический режим"
    echo "  ./start.sh development        # Режим разработки"
    echo "  ./start.sh production         # Production режим"
    echo "  ./start.sh production --rebuild  # Пересборка и запуск"
    echo ""
    exit 0
fi
