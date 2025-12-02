#!/bin/bash

# Скрипт для быстрого запуска проекта на локальном сервере (Kubuntu)

set -e  # Выход при первой ошибке

echo "======================================"
echo "🚀 Warehouse Management System Starter"
echo "======================================"

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Получаем путь к проекту
PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$PROJECT_DIR"

echo -e "${BLUE}📁 Project directory: $PROJECT_DIR${NC}"

# Проверяем Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js $(node --version)${NC}"

# Проверяем npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ npm $(npm --version)${NC}"

# Проверяем наличие package.json
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ package.json not found${NC}"
    exit 1
fi

# Проверяем наличие .env
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️ .env file not found, creating...${NC}"
    cat > .env << 'EOF'
NODE_ENV=development
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0bmFueGNpYXhscWx6c2xrdGxmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyNzIyNzYsImV4cCI6MjA3NTg0ODI3Nn0.9KfwZNBI-0ntTzOG1xnHpxBHja6d1n5OuaAAot9iY-s
EOF
    echo -e "${GREEN}✓ .env created${NC}"
else
    echo -e "${GREEN}✓ .env found${NC}"
fi

# Проверяем node_modules
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️ Dependencies not installed, installing...${NC}"
    npm install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${GREEN}✓ node_modules found${NC}"
fi

# Проверяем наличие warehouse.db
if [ ! -f "warehouse.db" ]; then
    echo -e "${YELLOW}⚠️ SQLite database not found, it will be created on first run${NC}"
fi

# Запускаем dev сервер
echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}🔧 Starting development server${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

npm run dev
