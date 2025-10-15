#!/bin/bash
# Скрипт 5: Запуск приложения
# Запускать с правами root: sudo bash 5-start.sh

set -e

echo "================================================"
echo "  Запуск Warehouse Management System"
echo "================================================"

# Запуск сервиса
echo "Запуск сервиса..."
systemctl start warehouse.service

# Ожидание запуска (5 секунд)
echo "Ожидание запуска..."
sleep 5

# Проверка статуса
echo "Проверка статуса..."
systemctl status warehouse.service --no-pager || true

# Получение IP адреса
IP_ADDRESS=$(hostname -I | awk '{print $1}')

echo ""
echo "================================================"
echo "  ✅ Приложение запущено!"
echo "================================================"
echo ""
echo "Доступ к приложению:"
echo "  Локально:  http://localhost:5000"
echo "  В сети:    http://$IP_ADDRESS:5000"
echo ""
echo "Данные для входа:"
echo "  Логин:  admin"
echo "  Пароль: admin123"
echo ""
echo "⚠️  ВАЖНО: Смените пароль после первого входа!"
echo ""
echo "Просмотр логов:"
echo "  sudo journalctl -u warehouse -f"
echo ""
echo "Управление сервисом:"
echo "  sudo systemctl stop warehouse    # Остановка"
echo "  sudo systemctl restart warehouse # Перезапуск"
echo "  sudo systemctl status warehouse  # Статус"
echo ""
