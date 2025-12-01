import { defineConfig } from "drizzle-kit";

// Читаем конфигурацию из kubuntu-config.js
const config = require("./kubuntu-config.js");

// Строим connection string из конфига
const { host, port, user, password, name } = config.database;

// Если пароль есть - добавляем его в URL
const passwordPart = password ? `:${password}` : '';
const connectionString = `postgresql://${user}${passwordPart}@${host}:${port}/${name}`;

console.log(`📊 Подключение к БД: ${user}@${host}:${port}/${name}`);

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
