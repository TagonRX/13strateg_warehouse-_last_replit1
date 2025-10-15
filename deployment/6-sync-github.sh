#!/bin/bash
# Скрипт 6: Синхронизация с GitHub с автоматическим резервным копированием
# Запускать с правами root: sudo bash 6-sync-github.sh

set -e

# Настройки
APP_DIR="/opt/warehouse"
BACKUP_DIR="/opt/warehouse-backups"
MAX_BACKUPS=10
REPO_URL="${GITHUB_REPO_URL:-https://github.com/YOUR_USERNAME/YOUR_REPO.git}"
BRANCH="${GITHUB_BRANCH:-main}"

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ОШИБКА]${NC} $1" >&2
}

warning() {
    echo -e "${YELLOW}[ВНИМАНИЕ]${NC} $1"
}

info() {
    echo -e "${BLUE}[ИНФО]${NC} $1"
}

# Создание резервной копии
create_backup() {
    log "Создание резервной копии текущей версии..."
    
    mkdir -p "$BACKUP_DIR"
    
    TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
    BACKUP_NAME="warehouse_backup_${TIMESTAMP}.tar.gz"
    BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"
    
    if [ -d "$APP_DIR" ]; then
        # Сохраняем информацию о текущей версии
        if [ -d "${APP_DIR}/.git" ]; then
            cd "$APP_DIR"
            CURRENT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
            CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
            
            echo "Commit: $CURRENT_COMMIT" > "${BACKUP_DIR}/.backup_${TIMESTAMP}_info.txt"
            echo "Branch: $CURRENT_BRANCH" >> "${BACKUP_DIR}/.backup_${TIMESTAMP}_info.txt"
            echo "Date: $(date)" >> "${BACKUP_DIR}/.backup_${TIMESTAMP}_info.txt"
            
            info "Текущая версия: $CURRENT_BRANCH @ ${CURRENT_COMMIT:0:7}"
        fi
        
        # Создаем архив (исключая node_modules и .git)
        tar -czf "$BACKUP_PATH" \
            --exclude='node_modules' \
            --exclude='.git' \
            --exclude='*.log' \
            -C "$(dirname $APP_DIR)" "$(basename $APP_DIR)"
        
        if [ $? -eq 0 ]; then
            log "✅ Резервная копия создана: ${BACKUP_NAME}"
            echo "$BACKUP_PATH" > "${BACKUP_DIR}/.last_backup"
            
            # Показываем размер
            BACKUP_SIZE=$(du -h "$BACKUP_PATH" | cut -f1)
            info "Размер резервной копии: $BACKUP_SIZE"
        else
            error "Не удалось создать резервную копию"
            exit 1
        fi
    else
        warning "Директория приложения не найдена, пропускаем резервное копирование"
    fi
    
    # Удаляем старые резервные копии
    cleanup_old_backups
}

# Удаление старых резервных копий
cleanup_old_backups() {
    log "Очистка старых резервных копий (сохраняем последние ${MAX_BACKUPS})..."
    
    cd "$BACKUP_DIR"
    BACKUP_COUNT=$(ls -1 warehouse_backup_*.tar.gz 2>/dev/null | wc -l)
    
    if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
        # Удаляем самые старые
        ls -1t warehouse_backup_*.tar.gz | tail -n +$((MAX_BACKUPS + 1)) | while read backup; do
            rm -f "$backup"
            # Удаляем и информационный файл
            TIMESTAMP=$(echo "$backup" | sed 's/warehouse_backup_\(.*\)\.tar\.gz/\1/')
            rm -f ".backup_${TIMESTAMP}_info.txt"
        done
        info "Удалено резервных копий: $((BACKUP_COUNT - MAX_BACKUPS))"
    fi
}

# Синхронизация с GitHub
sync_from_github() {
    log "================================================"
    log "  Синхронизация с GitHub"
    log "================================================"
    
    # Проверяем URL репозитория
    if [[ "$REPO_URL" == *"YOUR_USERNAME"* ]]; then
        error "Необходимо настроить GITHUB_REPO_URL"
        error "Экспортируйте переменную: export GITHUB_REPO_URL=https://github.com/username/repo.git"
        exit 1
    fi
    
    # Создаем резервную копию перед обновлением
    create_backup
    
    # Останавливаем сервис
    log "Остановка сервиса..."
    systemctl stop warehouse.service || true
    
    cd "$APP_DIR"
    
    # Проверяем наличие Git репозитория
    if [ ! -d ".git" ]; then
        log "Инициализация Git репозитория..."
        git init
        git remote add origin "$REPO_URL"
    fi
    
    # Сохраняем локальные изменения (если есть)
    if ! git diff-index --quiet HEAD -- 2>/dev/null; then
        warning "Обнаружены локальные изменения, сохраняем в stash..."
        git stash save "Auto-stash before sync $(date)"
    fi
    
    # Получаем последние изменения
    log "Получение последних изменений с GitHub..."
    git fetch origin "$BRANCH"
    
    # Получаем информацию о коммитах
    OLD_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "none")
    NEW_COMMIT=$(git rev-parse "origin/$BRANCH" 2>/dev/null)
    
    if [ "$OLD_COMMIT" = "$NEW_COMMIT" ]; then
        info "✅ Уже используется последняя версия"
        log "Запуск сервиса..."
        systemctl start warehouse.service
        return
    fi
    
    # Показываем изменения
    log "Обновление с $OLD_COMMIT на $NEW_COMMIT"
    if [ "$OLD_COMMIT" != "none" ]; then
        info "Изменения:"
        git log --oneline "$OLD_COMMIT..$NEW_COMMIT" | head -5
    fi
    
    # Применяем обновления
    log "Применение обновлений..."
    git reset --hard "origin/$BRANCH"
    
    # Устанавливаем зависимости
    log "Установка/обновление зависимостей..."
    npm install --production
    
    # Применяем миграции базы данных
    log "Применение изменений схемы базы данных..."
    source /opt/warehouse/warehouse.env
    npm run db:push --force || npm run db:push
    
    # Запускаем сервис
    log "Запуск сервиса..."
    systemctl start warehouse.service
    
    # Ждем несколько секунд
    sleep 3
    
    # Проверяем статус
    if systemctl is-active --quiet warehouse.service; then
        log "================================================"
        log "  ✅ Синхронизация завершена успешно!"
        log "================================================"
        info "Новая версия: ${NEW_COMMIT:0:7}"
        info "Резервная копия: $(cat ${BACKUP_DIR}/.last_backup)"
    else
        error "================================================"
        error "  ❌ Сервис не запустился после обновления!"
        error "================================================"
        error "Проверьте логи: sudo journalctl -u warehouse -n 50"
        warning "Для отката используйте: sudo bash 7-rollback.sh"
        exit 1
    fi
}

# Основная функция
main() {
    if [ "$EUID" -ne 0 ]; then
        error "Запускайте с правами root: sudo bash 6-sync-github.sh"
        exit 1
    fi
    
    sync_from_github
}

main "$@"
