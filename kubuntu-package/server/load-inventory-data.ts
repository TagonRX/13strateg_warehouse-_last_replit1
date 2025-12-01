import { readFileSync } from "fs";
import { join } from "path";
import { db } from "./db";
import { inventoryItems } from "@shared/schema";

interface InventoryDataItem {
  productId?: string;
  name?: string;
  sku: string;
  quantity?: number;
  condition?: string;
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  price?: number;
  itemId?: string;
  ebayUrl?: string;
  ebaySellerName?: string;
  imageUrl1?: string;
  imageUrl2?: string;
  imageUrl3?: string;
  imageUrl4?: string;
  imageUrl5?: string;
  imageUrl6?: string;
  imageUrl7?: string;
  imageUrl8?: string;
  imageUrl9?: string;
  imageUrl10?: string;
  imageUrl11?: string;
  imageUrl12?: string;
  imageUrl13?: string;
  imageUrl14?: string;
  imageUrl15?: string;
  imageUrl16?: string;
  imageUrl17?: string;
  imageUrl18?: string;
  imageUrl19?: string;
  imageUrl20?: string;
  imageUrl21?: string;
  imageUrl22?: string;
  imageUrl23?: string;
  imageUrl24?: string;
  barcodeMappings?: { code: string; qty: number }[];
}

function extractLocationFromSKU(sku: string): string {
  const parts = sku.split("-");
  return parts[0] || sku;
}

function calculateVolume(length?: number, width?: number, height?: number): number | undefined {
  if (length && width && height) {
    return length * width * height;
  }
  return undefined;
}

async function loadInventoryData() {
  try {
    console.log("📦 Загрузка данных из data/inventory.json...");
    
    // Читаем файл
    const filePath = join(process.cwd(), "data", "inventory.json");
    const fileContent = readFileSync(filePath, "utf-8");
    const data: InventoryDataItem[] = JSON.parse(fileContent);
    
    console.log(`📋 Найдено ${data.length} товаров для загрузки`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const item of data) {
      try {
        // Извлекаем локацию из SKU
        const location = extractLocationFromSKU(item.sku);
        
        // Вычисляем объем
        const volume = calculateVolume(item.length, item.width, item.height);
        
        // Конвертируем barcodeMappings в JSON строку
        let barcodeMappings: string | null = null;
        if (item.barcodeMappings && item.barcodeMappings.length > 0) {
          barcodeMappings = JSON.stringify(item.barcodeMappings);
        }
        
        // Подготавливаем данные для вставки
        const inventoryData = {
          productId: item.productId,
          name: item.name,
          sku: item.sku,
          location: location,
          quantity: item.quantity || 1,
          condition: item.condition,
          barcodeMappings: barcodeMappings,
          length: item.length,
          width: item.width,
          height: item.height,
          volume: volume,
          weight: item.weight,
          price: item.price,
          itemId: item.itemId,
          ebayUrl: item.ebayUrl,
          ebaySellerName: item.ebaySellerName,
          imageUrl1: item.imageUrl1,
          imageUrl2: item.imageUrl2,
          imageUrl3: item.imageUrl3,
          imageUrl4: item.imageUrl4,
          imageUrl5: item.imageUrl5,
          imageUrl6: item.imageUrl6,
          imageUrl7: item.imageUrl7,
          imageUrl8: item.imageUrl8,
          imageUrl9: item.imageUrl9,
          imageUrl10: item.imageUrl10,
          imageUrl11: item.imageUrl11,
          imageUrl12: item.imageUrl12,
          imageUrl13: item.imageUrl13,
          imageUrl14: item.imageUrl14,
          imageUrl15: item.imageUrl15,
          imageUrl16: item.imageUrl16,
          imageUrl17: item.imageUrl17,
          imageUrl18: item.imageUrl18,
          imageUrl19: item.imageUrl19,
          imageUrl20: item.imageUrl20,
          imageUrl21: item.imageUrl21,
          imageUrl22: item.imageUrl22,
          imageUrl23: item.imageUrl23,
          imageUrl24: item.imageUrl24,
        };
        
        // Вставляем в базу данных
        await db.insert(inventoryItems).values(inventoryData);
        
        console.log(`✅ Добавлен товар: ${item.name || item.sku}`);
        successCount++;
        
      } catch (error: any) {
        console.error(`❌ Ошибка при добавлении товара ${item.sku}:`, error.message);
        errorCount++;
      }
    }
    
    console.log("\n📊 Результаты загрузки:");
    console.log(`✅ Успешно добавлено: ${successCount}`);
    console.log(`❌ Ошибок: ${errorCount}`);
    console.log(`📦 Всего обработано: ${data.length}`);
    
    process.exit(0);
    
  } catch (error: any) {
    console.error("❌ Критическая ошибка при загрузке данных:", error);
    process.exit(1);
  }
}

// Запускаем загрузку
loadInventoryData();
