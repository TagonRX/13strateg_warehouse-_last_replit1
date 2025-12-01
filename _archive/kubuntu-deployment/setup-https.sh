#!/bin/bash

# =============================================================================
# Скрипт автоматической настройки HTTPS для Warehouse Management System
# Для локального сервера Kubuntu 25.10
# =============================================================================

set -e  # Остановка при ошибке

echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║  Настройка HTTPS для Warehouse Management System                        ║"
echo "║  Это позволит камере телефона работать через браузер!                   ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""

# Получить IP адрес сервера
SERVER_IP=$(hostname -I | awk '{print $1}')
echo "📍 IP адрес сервера: $SERVER_IP"
echo ""

# Проверка что скрипт запущен с sudo
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Пожалуйста, запустите скрипт с sudo:"
    echo "   sudo ./setup-https.sh"
    exit 1
fi

echo "📦 Шаг 1/5: Установка Nginx..."
apt update -qq
apt install -y nginx openssl > /dev/null 2>&1
echo "✅ Nginx установлен"
echo ""

echo "🔐 Шаг 2/5: Создание SSL сертификата..."
mkdir -p /etc/nginx/ssl

# Создать self-signed сертификат
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/warehouse.key \
    -out /etc/nginx/ssl/warehouse.crt \
    -subj "/C=RU/ST=Moscow/L=Moscow/O=Warehouse/CN=$SERVER_IP" \
    > /dev/null 2>&1

chmod 600 /etc/nginx/ssl/warehouse.key
chmod 644 /etc/nginx/ssl/warehouse.crt
echo "✅ SSL сертификат создан для $SERVER_IP"
echo ""

echo "⚙️  Шаг 3/5: Настройка Nginx..."

# Создать конфигурацию Nginx
cat > /etc/nginx/sites-available/warehouse << 'EOF'
# HTTP redirect to HTTPS
server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}

# HTTPS server
server {
    listen 443 ssl;
    server_name _;
    
    # SSL Configuration
    ssl_certificate /etc/nginx/ssl/warehouse.crt;
    ssl_certificate_key /etc/nginx/ssl/warehouse.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    # Увеличить размер загрузки для CSV файлов
    client_max_body_size 10M;
    
    # Proxy to Node.js app
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
    
    # WebSocket support для удалённого сканера
    location /ws {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
EOF

# Активировать конфигурацию
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/warehouse /etc/nginx/sites-enabled/warehouse

# Проверить конфигурацию
nginx -t > /dev/null 2>&1
echo "✅ Конфигурация Nginx создана"
echo ""

echo "🚀 Шаг 4/5: Запуск Nginx..."
systemctl enable nginx > /dev/null 2>&1
systemctl restart nginx
echo "✅ Nginx запущен"
echo ""

echo "🔍 Шаг 5/5: Проверка приложения..."
if pm2 list | grep -q warehouse; then
    echo "✅ Приложение warehouse работает на порту 5000"
else
    echo "⚠️  Приложение warehouse не запущено!"
    echo "   Запустите его командой: pm2 start ecosystem.config.js"
fi
echo ""

echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║  ✅ HTTPS НАСТРОЕН УСПЕШНО!                                              ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "📱 КАК ИСПОЛЬЗОВАТЬ С ТЕЛЕФОНА:"
echo ""
echo "1. На телефоне откройте браузер (Chrome/Brave/Firefox)"
echo ""
echo "2. Откройте адрес:"
echo "   👉 https://$SERVER_IP"
echo ""
echo "3. Браузер покажет предупреждение 'Небезопасное соединение'"
echo "   (это нормально для self-signed сертификата)"
echo ""
echo "4. Нажмите:"
echo "   Chrome/Brave: 'Дополнительно' → 'Перейти на сайт'"
echo "   Firefox: 'Дополнительно' → 'Принять риск и продолжить'"
echo ""
echo "5. Войдите: admin / admin123"
echo ""
echo "6. Перейдите в 'Режим сканера'"
echo ""
echo "7. Нажмите 'Запустить камеру'"
echo "   ✅ КАМЕРА БУДЕТ РАБОТАТЬ!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 ПОЛЕЗНЫЕ КОМАНДЫ:"
echo ""
echo "Проверить статус Nginx:"
echo "  sudo systemctl status nginx"
echo ""
echo "Перезапустить Nginx:"
echo "  sudo systemctl restart nginx"
echo ""
echo "Просмотреть логи Nginx:"
echo "  sudo tail -f /var/log/nginx/error.log"
echo ""
echo "Отключить HTTPS (вернуться к HTTP):"
echo "  sudo systemctl stop nginx"
echo "  sudo systemctl disable nginx"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
