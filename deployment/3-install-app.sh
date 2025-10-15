#!/bin/bash
# Скрипт 3: Установка приложения
# Запускать с правами root: sudo bash 3-install-app.sh

set -e

echo "================================================"
echo "  Установка приложения Warehouse Management"
echo "================================================"

# Создание директории приложения
echo "Создание директории /opt/warehouse..."
mkdir -p /opt/warehouse
cd /opt/warehouse

# Копирование файлов проекта
echo "Копирование файлов проекта..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rsync -av --exclude='node_modules' --exclude='.git' --exclude='deployment' "$SCRIPT_DIR/../" /opt/warehouse/

# Установка зависимостей
echo "Установка npm пакетов (это может занять несколько минут)..."
npm install --production

# Создание директорий для данных
echo "Создание директорий для данных..."
mkdir -p /opt/warehouse/data
mkdir -p /opt/warehouse/data/arhiv

# Создание пустого CSV файла для синхронизации
if [ ! -f /opt/warehouse/data/inventory_sync.csv ]; then
  echo "Создание шаблона CSV файла..."
  cat > /opt/warehouse/data/inventory_sync.csv << 'EOF'
productId;name;sku;location;quantity;barcode;price;length;width;height;weight
EOF
fi

# Загрузка переменных окружения и запуск миграций
echo "Применение схемы базы данных..."
source /opt/warehouse/warehouse.env
npm run db:push

# Создание пользователя admin
echo "Создание пользователя admin..."
sudo -u postgres psql warehouse_db << 'EOF'
-- Вставка admin пользователя (пароль: admin123)
INSERT INTO users (id, name, login, password, role, created_at)
VALUES (
  gen_random_uuid(),
  'Администратор',
  'admin',
  '$2b$10$rGwZ8VqF5vP3yX2kH4oN6.KJ7Hy8QmL9fVwE0nC5mXrT1uY4pB3sG',
  'admin',
  NOW()
) ON CONFLICT (login) DO NOTHING;
EOF

# Установка прав на файлы
echo "Установка прав на файлы..."
chown -R root:root /opt/warehouse
chmod -R 755 /opt/warehouse
chmod 600 /opt/warehouse/warehouse.env

echo "================================================"
echo "  ✅ Приложение установлено!"
echo "================================================"
echo ""
echo "Расположение: /opt/warehouse"
echo "Файл конфигурации: /opt/warehouse/warehouse.env"
echo ""
echo "Следующий шаг: sudo bash 4-setup-service.sh"
