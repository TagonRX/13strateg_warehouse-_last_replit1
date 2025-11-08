// ═══════════════════════════════════════════════════════════════════
// ИМПОРТ ДАННЫХ В БАЗУ ДАННЫХ
// ═══════════════════════════════════════════════════════════════════

import { db } from "./server/db";
import { readFileSync } from "fs";
import * as schema from "./shared/schema";

// Читаем конфигурацию
const config = require("./kubuntu-config.js");

console.log("═══════════════════════════════════════════════════════════════════");
console.log("  ИМПОРТ ДАННЫХ В WAREHOUSE");
console.log("═══════════════════════════════════════════════════════════════════");
console.log(`📁 Файл данных: ${config.paths.dataFile}`);
console.log(`📊 База данных: ${config.database.name}`);
console.log("═══════════════════════════════════════════════════════════════════\n");

// Читаем данные
const dataFilePath = config.paths.dataFile;
const data = JSON.parse(readFileSync(dataFilePath, "utf-8"));

// Порядок импорта (с учетом зависимостей foreign keys)
const importOrder = [
  "users",
  "bulkUploadSources",
  "csvSources",
  "columnMappings",
  "pickingListColumnMappings",
  "warehouseSettings",
  "inventoryItems",
  "activeLocations",
  "pendingPlacements",
  "pendingTests",
  "pickingLists",
  "pickingListItems",
  "orders",
  "eventLogs",
  "workerAnalytics",
  "scheduledImports",
  "importHistory",
  "importFieldSettings"
];

async function importData() {
  let totalRecords = 0;
  let totalTables = 0;

  for (const tableName of importOrder) {
    const tableData = data[tableName];
    
    if (!tableData || tableData.length === 0) {
      console.log(`  ⊘ ${tableName.padEnd(30)} пусто`);
      continue;
    }

    try {
      // Получаем таблицу из схемы
      const table = (schema as any)[tableName];
      
      if (!table) {
        console.log(`  ✗ ${tableName.padEnd(30)} таблица не найдена в схеме`);
        continue;
      }

      // Импортируем данные
      await db.insert(table).values(tableData);
      
      totalRecords += tableData.length;
      totalTables++;
      
      console.log(`  ✓ ${tableName.padEnd(30)} ${tableData.length.toLocaleString()} записей`);
    } catch (error: any) {
      console.log(`  ✗ ${tableName.padEnd(30)} ОШИБКА: ${error.message}`);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════════════");
  console.log(`✅ ИМПОРТ ЗАВЕРШЕН!`);
  console.log(`   Таблиц обработано: ${totalTables}`);
  console.log(`   Записей загружено: ${totalRecords.toLocaleString()}`);
  console.log("═══════════════════════════════════════════════════════════════════\n");
}

importData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ КРИТИЧЕСКАЯ ОШИБКА:");
    console.error(error);
    process.exit(1);
  });
