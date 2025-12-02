import { drizzle as drizzleSQLite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SQLite БД находится в корне проекта
const dbPath = path.join(__dirname, "..", "warehouse.db");

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

console.log(`🔌 Database: SQLite (${dbPath})`);

export const db = drizzleSQLite({ client: sqlite });
