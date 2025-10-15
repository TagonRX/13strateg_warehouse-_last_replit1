#!/bin/bash
# Скрипт 1: Установка системных зависимостей
# Запускать с правами root: sudo bash 1-install-dependencies.sh

set -e

echo "================================================"
echo "  Установка Node.js 20 и PostgreSQL 16"
echo "================================================"

# Обновление системы
echo "Обновление списка пакетов..."
apt-get update

# Установка необходимых утилит
echo "Установка curl и базовых утилит..."
apt-get install -y curl wget gnupg2 software-properties-common

# Установка Node.js 20
echo "Установка Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Проверка версии Node.js
echo "Установлен Node.js версии:"
node --version
npm --version

# Установка PostgreSQL 16
echo "Установка PostgreSQL 16..."
sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
apt-get update
apt-get install -y postgresql-16 postgresql-contrib-16

# Запуск PostgreSQL
echo "Запуск PostgreSQL..."
systemctl start postgresql
systemctl enable postgresql

echo "================================================"
echo "  ✅ Системные зависимости установлены!"
echo "================================================"
echo ""
echo "Node.js версия: $(node --version)"
echo "PostgreSQL версия: $(sudo -u postgres psql --version)"
echo ""
echo "Следующий шаг: sudo bash 2-setup-database.sh"
