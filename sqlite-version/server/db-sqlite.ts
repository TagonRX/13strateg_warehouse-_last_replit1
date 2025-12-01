// ═══════════════════════════════════════════════════════════════════
// SQLite DATABASE CONNECTION
// Альтернатива PostgreSQL для простой локальной установки
// ═══════════════════════════════════════════════════════════════════

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../shared/schema';
import path from 'path';
import fs from 'fs';

// Путь к базе данных SQLite
const DB_PATH = process.env.SQLITE_PATH || './warehouse.db';

// Убедимся что папка существует
const dbDir = path.dirname(DB_PATH);
if (dbDir && !fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Создаем подключение к SQLite
const sqlite = new Database(DB_PATH);

// Включаем foreign keys для SQLite
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Экспортируем drizzle instance
export const db = drizzle(sqlite, { schema });

console.log(`📁 SQLite база данных: ${DB_PATH}`);
