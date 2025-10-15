#!/bin/bash
# Скрипт 7: Откат к предыдущей версии
# Запускать с правами root: sudo bash 7-rollback.sh [имя_резервной_копии]

set -e

APP_DIR="/opt/warehouse"
BACKUP_DIR="/opt/warehouse-backups"

# Цвета
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

# Показать список доступных резервных копий
list_backups() {
    echo "================================================"
    echo "  Доступные резервные копии"
    echo "================================================"
    echo ""
    
    if [ ! -d "$BACKUP_DIR" ]; then
        warning "Директория резервных копий не найдена"
        return
    fi
    
    cd "$BACKUP_DIR"
    
    if ! ls warehouse_backup_*.tar.gz >/dev/null 2>&1; then
        warning "Резервные копии не найдены"
        return
    fi
    
    # Список резервных копий с информацией
    ls -1t warehouse_backup_*.tar.gz | while read backup; do
        TIMESTAMP=$(echo "$backup" | sed 's/warehouse_backup_\(.*\)\.tar\.gz/\1/')
        SIZE=$(du -h "$backup" | cut -f1)
        
        echo -e "${BLUE}$backup${NC} (${SIZE})"
        
        # Показываем информацию о версии, если есть
        if [ -f ".backup_${TIMESTAMP}_info.txt" ]; then
            cat ".backup_${TIMESTAMP}_info.txt" | sed 's/^/  /'
        fi
        
        echo ""
    done
}

# Откат к конкретной резервной копии
rollback_to_backup() {
    BACKUP_FILE="$1"
    
    # Если передано только имя без пути
    if [ ! -f "$BACKUP_FILE" ]; then
        BACKUP_FILE="${BACKUP_DIR}/${BACKUP_FILE}"
    fi
    
    if [ ! -f "$BACKUP_FILE" ]; then
        error "Резервная копия не найдена: $BACKUP_FILE"
        list_backups
        exit 1
    fi
    
    log "================================================"
    log "  Откат к резервной копии"
    log "================================================"
    
    info "Файл: $(basename $BACKUP_FILE)"
    
    # Показываем информацию о версии
    TIMESTAMP=$(basename "$BACKUP_FILE" | sed 's/warehouse_backup_\(.*\)\.tar\.gz/\1/')
    if [ -f "${BACKUP_DIR}/.backup_${TIMESTAMP}_info.txt" ]; then
        info "Информация о версии:"
        cat "${BACKUP_DIR}/.backup_${TIMESTAMP}_info.txt" | sed 's/^/  /'
    fi
    
    # Подтверждение
    echo ""
    warning "Это действие остановит сервис и восстановит предыдущую версию"
    read -p "Продолжить? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        info "Отмена"
        exit 0
    fi
    
    # Останавливаем сервис
    log "Остановка сервиса..."
    systemctl stop warehouse.service || true
    
    # Создаем резервную копию текущей версии перед откатом
    log "Создание резервной копии текущей версии..."
    ROLLBACK_BACKUP="${BACKUP_DIR}/warehouse_backup_before_rollback_$(date +%Y-%m-%d_%H-%M-%S).tar.gz"
    tar -czf "$ROLLBACK_BACKUP" \
        --exclude='node_modules' \
        --exclude='.git' \
        -C "$(dirname $APP_DIR)" "$(basename $APP_DIR)" || true
    
    # Удаляем текущую версию
    log "Удаление текущей версии..."
    rm -rf "${APP_DIR}"
    
    # Восстанавливаем из резервной копии
    log "Восстановление из резервной копии..."
    mkdir -p "$(dirname $APP_DIR)"
    tar -xzf "$BACKUP_FILE" -C "$(dirname $APP_DIR)"
    
    if [ $? -eq 0 ]; then
        log "✅ Файлы восстановлены"
        
        # Устанавливаем зависимости
        log "Установка зависимостей..."
        cd "$APP_DIR"
        npm install --production
        
        # Запускаем сервис
        log "Запуск сервиса..."
        systemctl start warehouse.service
        
        # Ждем несколько секунд
        sleep 3
        
        # Проверяем статус
        if systemctl is-active --quiet warehouse.service; then
            log "================================================"
            log "  ✅ Откат выполнен успешно!"
            log "================================================"
            info "Резервная копия текущей версии: $(basename $ROLLBACK_BACKUP)"
        else
            error "================================================"
            error "  ❌ Сервис не запустился после отката!"
            error "================================================"
            error "Проверьте логи: sudo journalctl -u warehouse -n 50"
        fi
    else
        error "Не удалось восстановить из резервной копии"
        exit 1
    fi
}

# Откат к последней резервной копии
rollback_to_last() {
    if [ ! -f "${BACKUP_DIR}/.last_backup" ]; then
        error "Последняя резервная копия не найдена"
        list_backups
        exit 1
    fi
    
    LAST_BACKUP=$(cat "${BACKUP_DIR}/.last_backup")
    
    if [ ! -f "$LAST_BACKUP" ]; then
        error "Файл резервной копии не найден: $LAST_BACKUP"
        list_backups
        exit 1
    fi
    
    rollback_to_backup "$LAST_BACKUP"
}

# Основная функция
main() {
    if [ "$EUID" -ne 0 ]; then
        error "Запускайте с правами root: sudo bash 7-rollback.sh"
        exit 1
    fi
    
    case "$1" in
        list)
            list_backups
            ;;
        "")
            # Откат к последней резервной копии
            rollback_to_last
            ;;
        *)
            # Откат к конкретной резервной копии
            rollback_to_backup "$1"
            ;;
    esac
}

main "$@"
