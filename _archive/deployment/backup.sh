#!/bin/bash

###############################################################################
# Скрипт резервного копирования базы данных
# 
# Использование:
#   chmod +x deployment/backup.sh
#   ./deployment/backup.sh
#
# Автоматическое резервное копирование (добавить в crontab):
#   crontab -e
#   # Ежедневно в 2 AM:
#   0 2 * * * /var/www/warehouse/deployment/backup.sh
###############################################################################

set -e

# Загрузка переменных окружения
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Настройки
BACKUP_DIR="./backups"
RETENTION_DAYS=7  # Хранить резервные копии за последние 7 дней
DATE=$(date +%Y%m%d_%H%M%S)

# Извлечение параметров подключения из DATABASE_URL
# Формат: postgresql://user:password@host:port/database
DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASSWORD=$(echo $DATABASE_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')

# Создать директорию для резервных копий
mkdir -p $BACKUP_DIR

echo "========================================="
echo "Начало резервного копирования"
echo "========================================="
echo "База данных: $DB_NAME"
echo "Дата: $(date)"
echo ""

# Имя файла резервной копии
BACKUP_FILE="$BACKUP_DIR/warehouse_backup_$DATE.sql"
COMPRESSED_FILE="$BACKUP_FILE.gz"

# Создать резервную копию
echo "Создание резервной копии..."
PGPASSWORD=$DB_PASSWORD pg_dump \
    -U $DB_USER \
    -h $DB_HOST \
    -p $DB_PORT \
    -d $DB_NAME \
    -F p \
    --no-owner \
    --no-acl \
    > $BACKUP_FILE

# Проверить, что резервная копия создана
if [ ! -f $BACKUP_FILE ]; then
    echo "ОШИБКА: Резервная копия не создана!"
    exit 1
fi

# Сжать резервную копию
echo "Сжатие резервной копии..."
gzip $BACKUP_FILE

# Проверить размер
BACKUP_SIZE=$(du -h $COMPRESSED_FILE | cut -f1)
echo "Размер резервной копии: $BACKUP_SIZE"

# Удалить старые резервные копии (старше RETENTION_DAYS дней)
echo "Удаление старых резервных копий (старше $RETENTION_DAYS дней)..."
find $BACKUP_DIR -name "warehouse_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete

# Показать список резервных копий
echo ""
echo "Список резервных копий:"
ls -lh $BACKUP_DIR/warehouse_backup_*.sql.gz 2>/dev/null || echo "Нет резервных копий"

echo ""
echo "========================================="
echo "Резервное копирование завершено успешно!"
echo "========================================="
echo "Файл: $COMPRESSED_FILE"
echo "Размер: $BACKUP_SIZE"
echo ""

# Опционально: загрузить резервную копию на внешнее хранилище
# Примеры:
#
# 1. Копировать на удаленный сервер через SCP:
# scp $COMPRESSED_FILE user@backup-server:/path/to/backups/
#
# 2. Загрузить в облако (AWS S3):
# aws s3 cp $COMPRESSED_FILE s3://your-bucket/backups/
#
# 3. Загрузить в облако (Google Cloud Storage):
# gsutil cp $COMPRESSED_FILE gs://your-bucket/backups/

exit 0
