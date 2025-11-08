import { db } from "./server/db.js";
import { readFileSync } from "fs";

console.log("Импорт данных в базу...");

const data = JSON.parse(readFileSync("database-export.json", "utf-8"));

// Порядок импорта (с учетом зависимостей)
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
  for (const tableName of importOrder) {
    const tableData = data[tableName];
    if (!tableData || tableData.length === 0) {
      console.log(`  ⊘ ${tableName}: пусто`);
      continue;
    }

    try {
      // Импорт через raw SQL для скорости
      const schema = await import("./shared/schema.js");
      const table = schema[tableName];
      
      if (!table) {
        console.log(`  ✗ ${tableName}: таблица не найдена`);
        continue;
      }

      await db.insert(table).values(tableData);
      console.log(`  ✓ ${tableName}: ${tableData.length} записей`);
    } catch (error) {
      console.log(`  ✗ ${tableName}: ошибка - ${error.message}`);
    }
  }

  console.log("\n✓ Импорт завершен!");
}

importData().catch(console.error);
