// server.js

// ИМПОРТ И НАСТРОЙКА
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data', 'inventory.json');
const PICKING_FILE = path.join(__dirname, 'data', 'picking_tasks.json');

// Middleware: обработка JSON-запросов и статический файловый сервер
// ВАЖНО: УВЕЛИЧЕН ЛИМИТ ДЛЯ БОЛЬШИХ CSV
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static('public'));

// ----------------------------------------------------------------------
// ФУНКЦИИ РАБОТЫ С ФАЙЛАМИ
// ----------------------------------------------------------------------

function readData(file) {
  try {
    if (!fs.existsSync(file)) {
      // Создаем пустой файл, если он не существует
      if (file === DATA_FILE) {
        fs.writeFileSync(file, '[]');
        return [];
      } else if (file === PICKING_FILE) {
        fs.writeFileSync(file, '[]');
        return [];
      }
    }
    const rawData = fs.readFileSync(file);
    return JSON.parse(rawData);
  } catch (error) {
    console.error(`Ошибка чтения данных из файла ${file}:`, error);
    return [];
  }
}

function writeData(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Ошибка записи данных в файл ${file}:`, error);
  }
}

// ----------------------------------------------------------------------
// МАРШРУТ 1 - ДОБАВЛЕНИЕ НОВОГО ТОВАРА (Приход/Пополнение)
// ----------------------------------------------------------------------

// Используется assign.html
app.post('/api/stockin', (req, res) => {
  const { sku, name, location, barcode, quantity } = req.body;
  const qty = parseInt(quantity || 1);

  if (!sku || !barcode || !location || qty < 1) {
    return res
      .status(400)
      .json({
        error:
          'Необходимо указать SKU, Локацию, Штрихкод и Количество (минимум 1).',
      });
  }

  let inventory = readData(DATA_FILE);
  const newItem = {
    sku: sku.toUpperCase(),
    name: name || `Товар ${sku}`,
    location: location.toUpperCase(),
    barcode: barcode,
    quantity: qty,
    status: 'IN_STOCK', // Всегда IN_STOCK при приходе
    timestamp: new Date().toISOString(),
  };
  inventory.push(newItem);
  writeData(DATA_FILE, inventory);

  res.json({
    message: `Успешно добавлено ${qty} ед. товара ${sku} по ШК ${barcode} в локацию ${location}.`,
    newItem: newItem,
  });
});

// ----------------------------------------------------------------------
// МАРШРУТ 2 - СПИСАНИЕ ТОВАРА (Сборка/Списание)
// ----------------------------------------------------------------------

// Используется stockout.html и pick-list.html
app.post('/api/stockout', (req, res) => {
  const { barcode, location } = req.body;

  if (!barcode || !location) {
    return res
      .status(400)
      .json({ error: 'Необходимо указать Штрихкод и Локацию для списания.' });
  }

  let inventory = readData(DATA_FILE); // 1. Ищем товар по ШК И Локации со статусом IN_STOCK

  const targetIndex = inventory.findIndex(
    (item) =>
      item.barcode === barcode &&
      item.location === location.toUpperCase() &&
      item.status === 'IN_STOCK'
  );

  if (targetIndex === -1) {
    // Проверяем, есть ли товар в запасе, но в другой локации
    const wrongLocationItem = inventory.find(
      (item) => item.barcode === barcode && item.status === 'IN_STOCK'
    );

    if (wrongLocationItem) {
      return res
        .status(400)
        .json({
          error: `Ошибка: Товар ${
            wrongLocationItem.sku
          } найден по ШК ${barcode}, но в локации ${
            wrongLocationItem.location
          }. Ожидалась локация ${location.toUpperCase()}.`,
        });
    } else {
      return res
        .status(404)
        .json({
          error: `Ошибка: Товар с ШК ${barcode} в локации ${location.toUpperCase()} не найден в запасе (IN_STOCK).`,
        });
    }
  } // 2. Списываем (меняем статус)

  const itemToPick = inventory[targetIndex];
  itemToPick.status = 'PICKED'; // Списано/Собрано
  itemToPick.pickedTimestamp = new Date().toISOString(); // 3. Обновляем inventory.json
  writeData(DATA_FILE, inventory); // 4. Считаем остаток

  const remaining_in_stock = inventory
    .filter((item) => item.sku === itemToPick.sku && item.status === 'IN_STOCK')
    .reduce((sum, item) => sum + item.quantity, 0);

  res.json({
    message: `Товар ${
      itemToPick.sku
    } (ШК: ${barcode}) списан из локации ${location.toUpperCase()}.`,
    sku: itemToPick.sku,
    name: itemToPick.name,
    remaining_in_stock: remaining_in_stock,
  });
});

// ----------------------------------------------------------------------
// МАРШРУТ 3 - ПОЛУЧЕНИЕ СВОДКИ ПО ИНВЕНТАРЮ (Для inventory-view.html)
// ----------------------------------------------------------------------

// Используется inventory-view.html и assign.html (для сводки)
app.get('/api/inventory-summary', (req, res) => {
  const inventory = readData(DATA_FILE);
  const summary = {};

  inventory.forEach((item) => {
    const key = item.sku;
    if (!summary[key]) {
      summary[key] = {
        sku: item.sku,
        name: item.name,
        in_stock: 0,
        picked: 0,
        barcodes: {}, // { barcode: { barcode: 'X', count: N } }
        locations: {}, // { location: count }
      };
    } // Подсчет остатков

    if (item.status === 'IN_STOCK') {
      summary[key].in_stock += item.quantity; // Агрегация по локациям
      if (item.location) {
        if (!summary[key].locations[item.location]) {
          summary[key].locations[item.location] = 0;
        }
        summary[key].locations[item.location] += item.quantity;
      }
    } else if (item.status === 'PICKED') {
      summary[key].picked += item.quantity;
    } // Подсчет уникальных штрихкодов

    if (item.barcode) {
      if (!summary[key].barcodes[item.barcode]) {
        summary[key].barcodes[item.barcode] = {
          barcode: item.barcode,
          count: 0,
        };
      }
      summary[key].barcodes[item.barcode].count += item.quantity;
    }
  }); // Преобразование объекта summary в массив и вложение массивов

  const finalSummary = Object.values(summary).map((item) => ({
    ...item,
    barcodes: Object.values(item.barcodes), // Преобразуем объект locations в строку для удобства отображения на клиенте
    locationDetails: Object.entries(item.locations)
      .map(([loc, qty]) => `${loc}: ${qty}`)
      .sort()
      .join('\n'),
  })); // Сортировка по SKU (алфавитная)
  finalSummary.sort((a, b) => a.sku.localeCompare(b.sku));

  res.json(finalSummary);
});
// ----------------------------------------------------------------------
// МАРШРУТ 4 - ОБРАБОТКА СПИСКА ПОДБОРА (Для pick-list.html)
// ----------------------------------------------------------------------

// Используется pick-list.html
app.post('/api/picking-list', (req, res) => {
  const { listText } = req.body;
  if (!listText) {
    return res
      .status(400)
      .json({ error: 'Необходимо предоставить список заданий.' });
  }

  const inventorySummary = readData(DATA_FILE);
  const pickingTasks = readData(PICKING_FILE);
  const finalPickingList = [];
  let taskIdCounter =
    pickingTasks.length > 0
      ? Math.max(...pickingTasks.map((t) => t.id)) + 1
      : 1;
  let errorCount = 0; // Разбиваем текст на задания. Формат: Локация [пробел] Количество (например, C225-A 1)

  const taskLines = listText
    .split('\n')
    .filter((line) => line.trim().length > 0);

  for (const line of taskLines) {
    const parts = line.trim().split(/\s+/); // Разделение по пробелам
    if (parts.length < 2) {
      console.warn(`Пропущена строка из-за неверного формата: ${line}`);
      errorCount++;
      continue;
    }

    const location = parts[0].toUpperCase();
    const requestedQty = parseInt(parts[1]);

    if (isNaN(requestedQty) || requestedQty < 1) {
      console.warn(`Пропущена строка из-за неверного количества: ${line}`);
      errorCount++;
      continue;
    } // Находим доступный товар в инвентаре по этой локации (который еще IN_STOCK)
    const availableItems = inventorySummary.filter(
      (item) => item.location === location && item.status === 'IN_STOCK'
    );

    if (availableItems.length === 0) {
      console.warn(`Нет товара в локации ${location} для подбора: ${line}`);
      errorCount++;
      continue;
    } // В простейшем случае: берем первый попавшийся товар из этой локации // В реальной системе тут была бы сложная логика подбора SKU/Партии

    const itemToPick = availableItems[0]; // Добавляем требуемое количество заданий
    for (let i = 0; i < requestedQty; i++) {
      const newTask = {
        id: taskIdCounter++,
        location: itemToPick.location,
        sku: itemToPick.sku,
        name: itemToPick.name,
        barcode: itemToPick.barcode,
        qty: 1, // В этом простом примере всегда 1
        status: 'PENDING', // В ожидании сбора
        created_at: new Date().toISOString(),
      };
      pickingTasks.push(newTask);
      finalPickingList.push({
        id: newTask.id,
        location: newTask.location,
        sku: newTask.sku,
        name: newTask.name,
        barcode: newTask.barcode,
        picked: false, // Статус на фронте
      });
    }
  }
  writeData(PICKING_FILE, pickingTasks);
  if (finalPickingList.length === 0) {
    return res.status(400).json({
      error: `Не удалось создать ни одного задания. Ошибок формата: ${errorCount}.`,
    });
  }

  res.json({
    message: `Успешно создано ${finalPickingList.length} заданий для сбора. Ошибок формата: ${errorCount}.`,
    list: finalPickingList,
  });
});
// ----------------------------------------------------------------------
// МАРШРУТ 5 - МАССОВЫЙ ПРИХОД (BULK STOCK-IN)
// ----------------------------------------------------------------------
app.post('/api/bulk-stockin', (req, res) => {
  const csvData = req.body.csvData;
  if (!csvData) {
    return res.status(400).json({ error: 'CSV-данные не предоставлены.' });
  }

  let inventory = readData(DATA_FILE);
  const newItems = [];
  let successCount = 0;
  let errorCount = 0;

  const lines = csvData.split('\n').filter((line) => line.trim() !== '');

  if (lines.length <= 1) {
    // Если только заголовок или пустой файл
    return res
      .status(400)
      .json({ error: 'Файл пуст или содержит только заголовок.' });
  }

  // --- УНИВЕРСАЛЬНОЕ ОПРЕДЕЛЕНИЕ РАЗДЕЛИТЕЛЯ ---
  const headerLine = lines[0];
  let delimiter = ','; // По умолчанию

  if (headerLine.includes(';')) {
    delimiter = ';';
  } else if (headerLine.includes('\t')) {
    delimiter = '\t';
  }
  // ----------------------------------------------

  // Пропускаем первую строку (заголовок) с помощью .slice(1)
  lines.slice(1).forEach((line, index) => {
    // Индекс + 2 для корректного отображения номера строки в ошибке

    const parts = line.split(delimiter);

    // Ожидаем только 3 поля: SKU, Имя_товара, Количество
    if (parts.length < 3) {
      console.warn(
        `Ошибка парсинга строки ${
          index + 2
        }: Недостаточно полей (Ожидается 3, найдено ${
          parts.length
        }). Строка: ${line}`
      );
      errorCount++;
      return;
    }

    // Деструктурируем 3 поля
    const [sku, name, quantityStr] = parts;

    // ВАЛИДАЦИЯ
    const quantity = parseInt(quantityStr);
    const trimmedSku = sku ? sku.trim().toUpperCase() : '';

    // Проверка обязательных полей
    if (!trimmedSku || isNaN(quantity) || quantity < 1) {
      console.warn(
        `Ошибка валидации строки ${
          index + 2
        }: Неверные SKU или Количество. Строка: ${line}`
      );
      errorCount++;
      return;
    }

    // Присвоение значений по умолчанию для Локации и Штрихкода
    const defaultLocation = 'UNKNOWN'; // Локация по умолчанию
    const defaultBarcode = `SKU-${trimmedSku}`; // ШК по умолчанию

    // Создание нового элемента
    const newItem = {
      sku: trimmedSku,
      name: name ? name.trim() : `Товар ${trimmedSku}`,
      location: defaultLocation,
      barcode: defaultBarcode,
      quantity: quantity,
      status: 'IN_STOCK',
      timestamp: new Date().toISOString(),
    };

    newItems.push(newItem);
    successCount++;
  });

  if (newItems.length > 0) {
    inventory.push(...newItems);
    writeData(DATA_FILE, inventory);
  }
  if (successCount > 0) {
    res.json({
      message: `Успешно обработано ${successCount} строк. Добавлено ${newItems.length} новых записей в инвентарь.`,
      successCount,
      errorCount,
    });
  } else {
    // Если все строки были с ошибками
    res
      .status(400)
      .json({
        error: `Все ${
          lines.length - 1
        } строк содержат ошибки. Ничего не добавлено.`,
        successCount,
        errorCount,
      });
  }
});

// ----------------------------------------------------------------------
// ЗАПУСК СЕРВЕРА
// ----------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Сервер запущен. Откройте http://localhost:${PORT}`);
  console.log(
    `Перейдите на http://localhost:${PORT}/pick-list.html для листа подбора.`
  );
});
