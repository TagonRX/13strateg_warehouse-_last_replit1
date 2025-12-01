# Warehouse Management System (SQLite версия)

Простая версия системы управления складом **БЕЗ PostgreSQL**.  
Все данные хранятся в одном файле `warehouse.db`.

## Преимущества SQLite версии

- **Не требует PostgreSQL** - никакой настройки баз данных
- **Один файл** - вся база в `warehouse.db`
- **Легко переносить** - просто скопируйте файл
- **Легко резервировать** - просто скопируйте `warehouse.db`

## Установка

```bash
cd sqlite-version
./install.sh
```

## Запуск

```bash
./start.sh
```

Откройте: http://localhost:5000  
Логин: `admin` / Пароль: `admin123`

## Остановка

```bash
./stop.sh
```

## Файлы

- `warehouse.db` - база данных SQLite
- `warehouse.log` - логи сервера
- `.env` - конфигурация

## Резервное копирование

Просто скопируйте файл `warehouse.db`:

```bash
cp warehouse.db warehouse-backup-$(date +%Y%m%d).db
```

## Требования

- Node.js 18+ (рекомендуется 20)
- Linux/macOS/Windows с WSL
