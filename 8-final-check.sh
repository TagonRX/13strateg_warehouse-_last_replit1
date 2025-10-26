#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
# Шаг 8: Финальная проверка установки
# ═══════════════════════════════════════════════════════════════════════════

echo "════════════════════════════════════════════════════════════"
echo "  ШАГ 8: ФИНАЛЬНАЯ ПРОВЕРКА"
echo "════════════════════════════════════════════════════════════"
echo ""

ERRORS=0
WARNINGS=0

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Функция для проверки
check() {
    if [ $? -eq 0 ]; then
        echo -e "  ${GREEN}✓${NC} $1"
    else
        echo -e "  ${RED}✗${NC} $1"
        ((ERRORS++))
    fi
}

warn() {
    echo -e "  ${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

echo "→ Проверка Node.js..."
node --version > /dev/null 2>&1
check "Node.js установлен ($(node --version 2>/dev/null || echo 'НЕ УСТАНОВЛЕН'))"

echo ""
echo "→ Проверка PostgreSQL..."
sudo systemctl is-active --quiet postgresql
check "PostgreSQL запущен"

sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname='warehouse_db';" | grep -q 1
check "База данных warehouse_db существует"

echo ""
echo "→ Проверка файлов проекта..."
[ -f "package.json" ]
check "package.json найден"

[ -f ".env" ]
check ".env файл создан"

[ -d "node_modules" ]
check "Зависимости установлены (node_modules)"

[ -d "dist" ]
check "Приложение собрано (dist)"

echo ""
echo "→ Проверка PM2..."
command -v pm2 > /dev/null 2>&1
check "PM2 установлен"

if command -v pm2 > /dev/null 2>&1; then
    pm2 describe warehouse > /dev/null 2>&1
    check "PM2 процесс warehouse найден"
    
    PM2_STATUS=$(pm2 jlist 2>/dev/null | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ "$PM2_STATUS" = "online" ]; then
        echo -e "  ${GREEN}✓${NC} Статус PM2: $PM2_STATUS"
    else
        echo -e "  ${RED}✗${NC} Статус PM2: $PM2_STATUS (должен быть online)"
        ((ERRORS++))
    fi
fi

echo ""
echo "→ Проверка портов..."
if sudo ss -tulpn | grep -q ":5000"; then
    echo -e "  ${GREEN}✓${NC} Порт 5000 слушается"
else
    echo -e "  ${RED}✗${NC} Порт 5000 не слушается"
    ((ERRORS++))
fi

echo ""
echo "→ Проверка Firewall..."
if command -v ufw > /dev/null 2>&1; then
    if sudo ufw status | grep -q "5000.*ALLOW"; then
        echo -e "  ${GREEN}✓${NC} Firewall: порт 5000 открыт"
    else
        warn "Firewall: порт 5000 не открыт (запустите ./6-configure-firewall.sh)"
    fi
else
    warn "UFW не установлен"
fi

echo ""
echo "→ Проверка Nginx..."
if command -v nginx > /dev/null 2>&1; then
    if sudo systemctl is-active --quiet nginx; then
        echo -e "  ${GREEN}✓${NC} Nginx установлен и запущен"
    else
        warn "Nginx установлен но не запущен"
    fi
else
    warn "Nginx не установлен (опционально)"
fi

echo ""
echo "→ Тест HTTP запроса..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:5000 | grep -q "200"; then
    echo -e "  ${GREEN}✓${NC} HTTP сервер отвечает (200 OK)"
else
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000 2>/dev/null || echo "FAILED")
    if [ "$HTTP_CODE" != "FAILED" ]; then
        warn "HTTP сервер отвечает с кодом: $HTTP_CODE"
    else
        echo -e "  ${RED}✗${NC} HTTP сервер не отвечает"
        ((ERRORS++))
    fi
fi

echo ""
echo "════════════════════════════════════════════════════════════"

# Итоги
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ ВСЁ ОТЛИЧНО!${NC} Установка завершена успешно"
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ УСТАНОВКА ЗАВЕРШЕНА С ПРЕДУПРЕЖДЕНИЯМИ${NC}"
    echo "  Найдено предупреждений: $WARNINGS"
else
    echo -e "${RED}✗ ОБНАРУЖЕНЫ ОШИБКИ${NC}"
    echo "  Найдено ошибок: $ERRORS"
    echo "  Найдено предупреждений: $WARNINGS"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

# Информация о доступе
SERVER_IP=$(hostname -I | awk '{print $1}')

echo "📱 ДОСТУП К ПРИЛОЖЕНИЮ:"
echo ""

if command -v nginx > /dev/null 2>&1 && sudo systemctl is-active --quiet nginx; then
    echo "  🌐 Через Nginx (рекомендуется):"
    echo "     http://$SERVER_IP"
    echo ""
fi

echo "  🔧 Прямой доступ:"
echo "     http://$SERVER_IP:5000"
echo ""

echo "  👤 Данные для входа:"
echo "     Логин:  admin"
echo "     Пароль: admin123"
echo ""

echo "════════════════════════════════════════════════════════════"
echo ""

# Полезные команды
echo "💡 ПОЛЕЗНЫЕ КОМАНДЫ:"
echo ""
echo "  Просмотр логов PM2:"
echo "    pm2 logs warehouse"
echo ""
echo "  Перезапуск приложения:"
echo "    pm2 restart warehouse"
echo ""
echo "  Статус PM2:"
echo "    pm2 status"
echo ""
echo "  Проверка базы данных:"
echo "    sudo -u postgres psql warehouse_db"
echo ""

if [ $ERRORS -gt 0 ]; then
    echo "════════════════════════════════════════════════════════════"
    echo ""
    echo "⚠️  Обнаружены ошибки. Рекомендации:"
    echo ""
    echo "  1. Проверьте логи PM2:"
    echo "     pm2 logs warehouse --lines 50"
    echo ""
    echo "  2. Проверьте .env файл:"
    echo "     cat .env"
    echo ""
    echo "  3. Попробуйте перезапустить:"
    echo "     pm2 restart warehouse"
    echo ""
    echo "  4. Прочитайте TROUBLESHOOTING_KUBUNTU.txt"
    echo ""
    exit 1
fi

exit 0
