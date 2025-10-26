#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
# Шаг 7: Настройка Nginx (ОПЦИОНАЛЬНО)
# ═══════════════════════════════════════════════════════════════════════════
#
# Этот скрипт ОПЦИОНАЛЕН. Он нужен если вы хотите:
# - Использовать стандартный порт 80 вместо 5000
# - Настроить SSL/HTTPS
# - Использовать доменное имя
#
# Если вы просто тестируете на локальном IP, можете пропустить этот шаг
# ═══════════════════════════════════════════════════════════════════════════

set -e

echo "════════════════════════════════════════════════════════════"
echo "  ШАГ 7: НАСТРОЙКА NGINX (ОПЦИОНАЛЬНО)"
echo "════════════════════════════════════════════════════════════"
echo ""

# Спрашиваем пользователя
read -p "Хотите установить Nginx? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "→ Nginx не будет установлен"
    echo "  Приложение доступно на: http://$(hostname -I | awk '{print $1}'):5000"
    exit 0
fi

echo "→ Установка Nginx..."
sudo apt-get update
sudo apt-get install -y nginx

echo ""
echo "→ Создание конфигурации Nginx..."

# Создаём конфигурацию nginx
sudo tee /etc/nginx/sites-available/warehouse > /dev/null << 'EOF'
server {
    listen 80;
    listen [::]:80;
    
    # Замените на ваш IP или доменное имя
    server_name _;

    # Логи
    access_log /var/log/nginx/warehouse-access.log;
    error_log /var/log/nginx/warehouse-error.log;

    # Размер загружаемых файлов
    client_max_body_size 50M;

    # Основной прокси
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        
        # Заголовки
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_cache_bypass $http_upgrade;
        
        # Таймауты
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket поддержка для сканера
    location /ws {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # WebSocket таймауты
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }
}
EOF

# Активируем конфигурацию
sudo ln -sf /etc/nginx/sites-available/warehouse /etc/nginx/sites-enabled/

# Удаляем дефолтную конфигурацию
sudo rm -f /etc/nginx/sites-enabled/default

# Проверяем конфигурацию
echo ""
echo "→ Проверка конфигурации Nginx..."
sudo nginx -t

# Перезапускаем Nginx
echo ""
echo "→ Перезапуск Nginx..."
sudo systemctl restart nginx
sudo systemctl enable nginx

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✓ Nginx настроен"
echo ""
echo "Приложение теперь доступно на:"
echo "  • http://$(hostname -I | awk '{print $1}')  (порт 80)"
echo "  • http://$(hostname -I | awk '{print $1}'):5000  (прямой доступ)"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "→ Финальная проверка: ./8-final-check.sh"
