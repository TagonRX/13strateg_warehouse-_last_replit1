const db = require('better-sqlite3')('warehouse.db');
const fs = require('fs');
const path = require('path');

console.log('=== ОТЧЕТ О ФОТОГРАФИЯХ ===\n');

// Статистика БД
const totalItems = db.prepare('SELECT COUNT(*) as cnt FROM inventory_items').get().cnt;
const inStock = db.prepare('SELECT COUNT(*) as cnt FROM inventory_items WHERE quantity > 0').get().cnt;
const withPhoto = db.prepare("SELECT COUNT(*) as cnt FROM inventory_items WHERE image_url_1 IS NOT NULL AND image_url_1 != ''").get().cnt;
const inStockWithPhoto = db.prepare("SELECT COUNT(*) as cnt FROM inventory_items WHERE quantity > 0 AND image_url_1 IS NOT NULL AND image_url_1 != ''").get().cnt;

console.log('📦 Товары в БД:');
console.log('   Всего товаров:', totalItems);
console.log('   В наличии (qty > 0):', inStock);
console.log('   С главным фото (image_url_1):', withPhoto);
console.log('   В наличии С фото:', inStockWithPhoto);

// Статистика локальных фото
const imagesDir = path.join(__dirname, 'server', 'public', 'images', 'products');
let localPhotos = 0;
let dirSize = 0;

try {
  if (fs.existsSync(imagesDir)) {
    const files = fs.readdirSync(imagesDir);
    localPhotos = files.length;
    
    files.forEach(file => {
      const stats = fs.statSync(path.join(imagesDir, file));
      dirSize += stats.size;
    });
  }
} catch (err) {
  console.log('   Ошибка чтения папки:', err.message);
}

console.log('\n📁 Локальные фото:');
console.log('   Загружено файлов:', localPhotos);
console.log('   Размер папки:', (dirSize / 1024 / 1024).toFixed(2), 'MB');

// Процент покрытия
const coverage = inStockWithPhoto > 0 ? ((localPhotos / inStockWithPhoto) * 100).toFixed(1) : 0;
console.log('\n📊 Покрытие:');
console.log('   Должно быть загружено:', inStockWithPhoto);
console.log('   Реально загружено:', localPhotos);
console.log('   Процент покрытия:', coverage + '%');

// Вывод
console.log('\n💡 Статус:');
if (localPhotos === 0) {
  console.log('   ⚠️  Фото НЕ загружаются автоматически!');
  console.log('   📝 Причина: Система только что создана, фото загрузятся:');
  console.log('      - При первом просмотре товара в таблице');
  console.log('      - При следующем CSV импорте');
  console.log('      - При ручной синхронизации');
} else if (coverage < 50) {
  console.log('   🔄 Идет процесс загрузки фото...');
} else if (coverage < 100) {
  console.log('   ✅ Большинство фото загружено');
} else {
  console.log('   ✅ Все фото загружены!');
}

// Примеры товаров с фото
console.log('\n📸 Примеры товаров с фото (первые 5):');
const examples = db.prepare("SELECT sku, name, image_url_1 FROM inventory_items WHERE quantity > 0 AND image_url_1 IS NOT NULL AND image_url_1 != '' LIMIT 5").all();
examples.forEach((item, i) => {
  const localPath = path.join(imagesDir, `${item.sku.replace(/[^a-zA-Z0-9-_]/g, '_')}.jpg`);
  const hasLocal = fs.existsSync(localPath) ? '✅' : '❌';
  console.log(`   ${i+1}. ${hasLocal} SKU: ${item.sku}`);
});

db.close();
