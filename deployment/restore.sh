#!/bin/bash

###############################################################################
# Скрипт восстановления базы данных из резервной копии
# 
# Использование:
#   chmod +x deployment/restore.sh
#   ./deployment/restore.sh [путь_к_резервной_копии]
#
# Пример:
#   ./deployment/restore.sh backups/warehouse_backup_20250125_120000.sql.gz
###############################################################################

set -e

# Проверка аргумента
if [ -z "$1" ]; then
    echo "ОШИБКА: Укажите путь к файлу резервной копии!"
    echo ""
    echo "Использование:"
    echo "  ./deployment/restore.sh <путь_к_резервной_копии>"
    echo ""
    echo "Доступные резервные копии:"
    ls -lh backups/warehouse_backup_*.sql.gz 2>/dev/null || echo "  Нет резервных копий"
    exit 1
fi

BACKUP_FILE=$1

# Проверка существования файла
if [ ! -f "$BACKUP_FILE" ]; then
    echo "ОШИБКА: Файл не найден: $BACKUP_FILE"
    exit 1
fi

# Загрузка переменных окружения
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Извлечение параметров подключения из DATABASE_URL
DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASSWORD=$(echo $DATABASE_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')

echo "========================================="
echo "ВНИМАНИЕ! ВОССТАНОВЛЕНИЕ БАЗЫ ДАННЫХ"
echo "========================================="
echo "База данных: $DB_NAME"
echo "Файл резервной копии: $BACKUP_FILE"
echo ""
echo "ВСЕ ТЕКУЩИЕ ДАННЫЕ БУДУТ УДАЛЕНЫ!"
echo ""
read -p "Вы уверены? Введите 'yes' для продолжения: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Отменено."
    exit 0
fi

# Остановить приложение
echo ""
echo "Остановка приложения..."
pm2 stop warehouse || true

# Распаковать, если файл сжат
TEMP_FILE=""
if [[ $BACKUP_FILE == *.gz ]]; then
    echo "Распаковка резервной копии..."
    TEMP_FILE="/tmp/warehouse_restore_$$.sql"
    gunzip -c $BACKUP_FILE > $TEMP_FILE
    SQL_FILE=$TEMP_FILE
else
    SQL_FILE=$BACKUP_FILE
fi

# Удалить существующие подключения к БД
echo "Закрытие существующих подключений..."
PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d postgres <<EOF
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();
EOF

# Удалить и пересоздать базу данных
echo "Пересоздание базы данных..."
PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d postgres <<EOF
DROP DATABASE IF EXISTS $DB_NAME;
CREATE DATABASE $DB_NAME OWNER $DB_USER;
EOF

# Восстановить данные
echo "Восстановление данных..."
PGPASSWORD=$DB_PASSWORD psql \
    -U $DB_USER \
    -h $DB_HOST \
    -p $DB_PORT \
    -d $DB_NAME \
    < $SQL_FILE

# Удалить временный файл
if [ ! -z "$TEMP_FILE" ]; then
    rm -f $TEMP_FILE
fi

# Запустить приложение
echo "Запуск приложения..."
pm2 start warehouse

echo ""
echo "========================================="
echo "Восстановление завершено успешно!"
echo "========================================="
echo ""
echo "Проверьте работу приложения:"
echo "  pm2 logs warehouse"
echo ""

exit 0
