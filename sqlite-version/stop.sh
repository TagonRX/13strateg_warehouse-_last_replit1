#!/bin/bash

if [ -f warehouse.pid ]; then
    PID=$(cat warehouse.pid)
    if ps -p $PID > /dev/null 2>&1; then
        kill $PID
        rm -f warehouse.pid
        echo "✓ Сервер остановлен"
    else
        rm -f warehouse.pid
        echo "Сервер не был запущен"
    fi
else
    echo "PID файл не найден"
fi
