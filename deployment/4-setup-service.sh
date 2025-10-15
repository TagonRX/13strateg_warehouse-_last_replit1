#!/bin/bash
# Скрипт 4: Настройка systemd сервиса
# Запускать с правами root: sudo bash 4-setup-service.sh

set -e

echo "================================================"
echo "  Настройка systemd сервиса"
echo "================================================"

# Создание systemd сервиса
echo "Создание службы warehouse.service..."
cat > /etc/systemd/system/warehouse.service << 'EOF'
[Unit]
Description=Warehouse Management System
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/warehouse
EnvironmentFile=/opt/warehouse/warehouse.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=warehouse

# Ограничения ресурсов
MemoryLimit=1G
CPUQuota=200%

[Install]
WantedBy=multi-user.target
EOF

# Перезагрузка systemd
echo "Перезагрузка systemd..."
systemctl daemon-reload

# Включение автозапуска
echo "Включение автозапуска..."
systemctl enable warehouse.service

echo "================================================"
echo "  ✅ Сервис настроен!"
echo "================================================"
echo ""
echo "Управление сервисом:"
echo "  Запуск:      sudo systemctl start warehouse"
echo "  Остановка:   sudo systemctl stop warehouse"
echo "  Перезапуск:  sudo systemctl restart warehouse"
echo "  Статус:      sudo systemctl status warehouse"
echo "  Логи:        sudo journalctl -u warehouse -f"
echo ""
echo "Следующий шаг: sudo bash 5-start.sh"
