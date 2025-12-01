#!/usr/bin/env node

/**
 * Скрипт для проверки подключения к PostgreSQL
 * Использует учетные данные из .env файла
 */

import pg from 'pg';
import fs from 'fs/promises';

const { Pool } = pg;

async function testConnection() {
  try {
    // Прочитать DATABASE_URL из .env
    const envContent = await fs.readFile('.env', 'utf-8');
    const dbUrlMatch = envContent.match(/DATABASE_URL=(.+)/);
    const DATABASE_URL = dbUrlMatch ? dbUrlMatch[1].trim() : null;

    if (!DATABASE_URL) {
      console.error('❌ Ошибка: DATABASE_URL не найден в .env файле');
      process.exit(1);
    }

    console.log('🔍 Тестирование подключения к PostgreSQL...');
    console.log('');

    // Создать подключение
    const pool = new Pool({ 
      connectionString: DATABASE_URL,
      // Таймаут для быстрой проверки
      connectionTimeoutMillis: 5000,
    });

    const client = await pool.connect();

    try {
      // Выполнить простой запрос
      const result = await client.query('SELECT NOW(), current_database(), current_user');
      
      console.log('✅ Подключение успешно!');
      console.log('');
      console.log('Информация о подключении:');
      console.log(`  • База данных: ${result.rows[0].current_database}`);
      console.log(`  • Пользователь: ${result.rows[0].current_user}`);
      console.log(`  • Время сервера: ${result.rows[0].now}`);
      console.log('');

      // Проверить количество таблиц
      const tablesResult = await client.query(`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      
      const tableCount = parseInt(tablesResult.rows[0].count);
      console.log(`Таблиц в базе данных: ${tableCount}`);
      
      if (tableCount === 0) {
        console.log('⚠️  База данных пустая - нужно применить схему (npm run db:push --force)');
      } else {
        console.log('✓ Схема базы данных применена');
      }

      console.log('');
      
    } finally {
      client.release();
      await pool.end();
    }

    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('❌ Ошибка подключения к PostgreSQL:');
    console.error('');
    
    if (error.code === '28P01') {
      console.error('  Проблема: Неверный пароль для пользователя БД');
      console.error('');
      console.error('  Решение:');
      console.error('    1. Запустите ./fix-postgres.sh для исправления');
      console.error('    2. Или пересоздайте пользователя вручную:');
      console.error('');
      console.error('       sudo -u postgres psql << EOF');
      console.error("       DROP USER IF EXISTS warehouse_user;");
      console.error("       CREATE USER warehouse_user WITH PASSWORD 'warehouse_pass123';");
      console.error("       GRANT ALL PRIVILEGES ON DATABASE warehouse_local TO warehouse_user;");
      console.error('       EOF');
      console.error('');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('  Проблема: PostgreSQL не запущен');
      console.error('');
      console.error('  Решение:');
      console.error('    sudo systemctl start postgresql');
      console.error('    sudo systemctl status postgresql');
      console.error('');
    } else {
      console.error(`  Код ошибки: ${error.code || 'неизвестно'}`);
      console.error(`  Сообщение: ${error.message}`);
      console.error('');
    }

    process.exit(1);
  }
}

// Запустить проверку
testConnection();
