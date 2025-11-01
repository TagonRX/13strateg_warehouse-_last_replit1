import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Пользователи (упрощенная аутентификация)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  login: text("login").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull(), // 'admin' или 'worker'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Товары в инвентаре
export const inventoryItems = pgTable("inventory_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: text("product_id"), // ID товара (опционально, автоматически из CSV)
  name: text("name"), // Название (опционально, может добавиться через CSV)
  sku: text("sku").notNull(), // SKU = Локация (обязательно)
  location: text("location").notNull(), // Автоматически извлекается из SKU
  quantity: integer("quantity").notNull().default(1),
  barcode: text("barcode"), // Опционально (устаревшее - используется для обратной совместимости)
  barcodeMappings: text("barcode_mappings"), // JSON массив: [{ code: "123", qty: 2 }, { code: "456", qty: 3 }]
  condition: text("condition"), // Состояние товара: New, Used, Exdisplay, Parts, Faulty (для товаров без штрихкода)
  length: integer("length"), // Длина в см (до 3 знаков, макс 999)
  width: integer("width"), // Ширина в см (до 3 знаков, макс 999)
  height: integer("height"), // Высота в см (до 3 знаков, макс 999)
  volume: integer("volume"), // Объем (перемножение length * width * height)
  weight: integer("weight"), // Вес в кг (до 3 знаков, макс 999)
  price: integer("price"), // Цена товара (целое число)
  itemId: text("item_id"), // eBay item ID из CSV (например "397123149682")
  ebayUrl: text("ebay_url"), // Ссылка на страницу товара на eBay
  ebaySellerName: text("ebay_seller_name"), // Имя продавца eBay (например "toponesale")
  imageUrl1: text("image_url_1"),
  imageUrl2: text("image_url_2"),
  imageUrl3: text("image_url_3"),
  imageUrl4: text("image_url_4"),
  imageUrl5: text("image_url_5"),
  imageUrl6: text("image_url_6"),
  imageUrl7: text("image_url_7"),
  imageUrl8: text("image_url_8"),
  imageUrl9: text("image_url_9"),
  imageUrl10: text("image_url_10"),
  imageUrl11: text("image_url_11"),
  imageUrl12: text("image_url_12"),
  imageUrl13: text("image_url_13"),
  imageUrl14: text("image_url_14"),
  imageUrl15: text("image_url_15"),
  imageUrl16: text("image_url_16"),
  imageUrl17: text("image_url_17"),
  imageUrl18: text("image_url_18"),
  imageUrl19: text("image_url_19"),
  imageUrl20: text("image_url_20"),
  imageUrl21: text("image_url_21"),
  imageUrl22: text("image_url_22"),
  imageUrl23: text("image_url_23"),
  imageUrl24: text("image_url_24"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Логи событий
export const eventLogs = pgTable("event_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  action: text("action").notNull(), // STOCK_IN, STOCK_OUT, CSV_UPLOAD, CONDITION_OVERRIDE, etc
  details: text("details").notNull(),
  // Дополнительная информация о товаре для отслеживания истории
  productId: text("product_id"), // ID товара (для отслеживания одного товара с разными SKU)
  itemName: text("item_name"), // Название товара
  sku: text("sku"), // SKU/Локация на момент действия
  location: text("location"), // Локация на момент действия
  quantity: integer("quantity"), // Количество товара на момент действия
  price: integer("price"), // Цена товара на момент действия
  isWarning: boolean("is_warning").notNull().default(false), // Критическое событие (подсветка красным для админа)
  withoutTest: boolean("without_test").notNull().default(false), // Товар добавлен без тестирования (подсветка желтым для админа)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Аналитика работников
export const workerAnalytics = pgTable("worker_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  date: text("date").notNull(), // YYYY-MM-DD
  itemsReceived: integer("items_received").notNull().default(0),
  itemsPicked: integer("items_picked").notNull().default(0),
  itemsPacked: integer("items_packed").notNull().default(0),
  csvErrors: integer("csv_errors").notNull().default(0),
});

// Picking Lists
export const pickingLists = pgTable("picking_lists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  status: text("status").notNull().default("PENDING"), // PENDING, IN_PROGRESS, COMPLETED
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Задачи для picking list
export const pickingTasks = pgTable("picking_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  listId: varchar("list_id").references(() => pickingLists.id),
  sku: text("sku").notNull(), // SKU to pick (not specific item ID)
  itemName: text("item_name"), // Name of the item from inventory
  itemNameSource: text("item_name_source"), // 'file' (from CSV) or 'inventory' (looked up)
  ebaySellerName: text("ebay_seller_name"), // Имя продавца eBay для сверки при сборке
  requiredQuantity: integer("required_quantity").notNull().default(1), // How many needed
  pickedQuantity: integer("picked_quantity").notNull().default(0), // How many picked
  status: text("status").notNull().default("PENDING"), // PENDING, COMPLETED
  pickedItemIds: text("picked_item_ids").array(), // IDs of picked inventory items
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// SKU Errors - несовпадения SKU при bulk upload
export const skuErrors = pgTable("sku_errors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: text("product_id").notNull(),
  name: text("name").notNull(),
  csvSku: text("csv_sku").notNull(), // SKU из CSV файла
  existingSku: text("existing_sku").notNull(), // Существующий SKU в системе
  quantity: integer("quantity").notNull().default(1),
  barcode: text("barcode"),
  status: text("status").notNull().default("PENDING"), // PENDING, RESOLVED
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

// Настройки склада - TSKU и MAXQ для групп локаций
export const warehouseSettings = pgTable("warehouse_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationPattern: text("location_pattern").notNull().unique(), // Например: "A1", "B1", "C1" и т.д.
  tsku: integer("tsku").notNull().default(4), // Максимальное количество SKU
  maxq: integer("maxq").notNull().default(10), // Максимальное количество товаров
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Активные локации (вводит администратор)
export const activeLocations = pgTable("active_locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  location: text("location").notNull().unique(), // Например: "A101", "B102"
  barcode: text("barcode"), // Баркод локации для проверки при размещении
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// CSV источники (общие для всех пользователей)
export const csvSources = pgTable("csv_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  url: text("url").notNull(),
  name: text("name").notNull(), // Короткое имя (например "S1", "S2")
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0), // Порядок отображения
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Глобальные настройки (ключ-значение для общих параметров)
export const globalSettings = pgTable("global_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // Например: "csv_global_username", "csv_global_password"
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Товары на тестировании (первое сканирование - начало теста)
export const pendingTests = pgTable("pending_tests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barcode: text("barcode").notNull().unique(), // Штрихкод товара
  sku: text("sku"), // SKU если известен
  productId: text("product_id"), // ID товара
  name: text("name"), // Название товара
  firstScanAt: timestamp("first_scan_at").defaultNow().notNull(), // Когда начали тестировать
  firstScanBy: varchar("first_scan_by").references(() => users.id).notNull(), // Кто начал тестировать
});

// Протестированные товары (все кроме Faulty)
export const testedItems = pgTable("tested_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barcode: text("barcode").notNull(),
  sku: text("sku"),
  productId: text("product_id"),
  name: text("name"),
  condition: text("condition").notNull(), // Used, Exdisplay, New, Parts
  firstScanAt: timestamp("first_scan_at").notNull(), // Когда начали тестировать
  firstScanBy: varchar("first_scan_by").references(() => users.id).notNull(),
  decisionAt: timestamp("decision_at").defaultNow().notNull(), // Когда приняли решение
  decisionBy: varchar("decision_by").references(() => users.id).notNull(), // Кто принял решение
});

// Бракованные товары (Faulty и Parts) с аналитикой рабочих часов
export const faultyStock = pgTable("faulty_stock", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barcode: text("barcode").notNull(),
  sku: text("sku"),
  productId: text("product_id"),
  name: text("name"),
  condition: text("condition").notNull(), // Faulty или Parts
  firstScanAt: timestamp("first_scan_at").notNull(), // Когда начали тестировать
  firstScanBy: varchar("first_scan_by").references(() => users.id).notNull(), // Кто начал тестировать
  decisionAt: timestamp("decision_at").defaultNow().notNull(), // Когда приняли решение что faulty/parts
  decisionBy: varchar("decision_by").references(() => users.id).notNull(), // Кто принял решение
  workingHours: integer("working_hours").notNull(), // Рабочие часы между первым и вторым сканированием (в минутах)
});

// Товары ожидающие размещения (после Stock-In, до Placement)
export const pendingPlacements = pgTable("pending_placements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barcode: text("barcode").notNull(),
  sku: text("sku").notNull(), // Целевой SKU для размещения
  location: text("location").notNull(), // Целевая локация (из SKU)
  productId: text("product_id"),
  name: text("name"),
  condition: text("condition").notNull(), // Used, Exdisplay, New, Parts (автоматически из testedItems)
  quantity: integer("quantity").notNull().default(1),
  price: integer("price"),
  length: integer("length"),
  width: integer("width"),
  height: integer("height"),
  volume: integer("volume"),
  weight: integer("weight"),
  stockInAt: timestamp("stock_in_at").defaultNow().notNull(), // Когда принято на склад
  stockInBy: varchar("stock_in_by").references(() => users.id).notNull(), // Кто принял
});

// Сессии импорта CSV (для массовой загрузки товаров из внешних источников)
export const csvImportSessions = pgTable("csv_import_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceType: text("source_type").notNull(), // 'url' или 'file'
  sourceUrl: text("source_url"), // URL если sourceType = 'url'
  fileName: text("file_name"), // Имя файла если sourceType = 'file'
  status: text("status").notNull().default("PARSING"), // PARSING, READY_FOR_REVIEW, RESOLVING, COMMITTED, FAILED
  error: text("error"), // Ошибка если status = FAILED
  parsedData: text("parsed_data"), // JSON: массив распарсенных строк CSV
  conflicts: text("conflicts"), // JSON: массив конфликтов для разрешения
  resolutions: text("resolutions"), // JSON: решения администратора для конфликтов
  totalRows: integer("total_rows").notNull().default(0),
  matchedRows: integer("matched_rows").notNull().default(0),
  conflictRows: integer("conflict_rows").notNull().default(0),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  committedAt: timestamp("committed_at"),
});

// Заказы (для Dispatch и Packing workflow)
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderNumber: text("order_number").notNull().unique(), // Уникальный номер заказа
  customerName: text("customer_name"), // Имя покупателя
  shippingAddress: text("shipping_address"), // Адрес доставки
  orderDate: timestamp("order_date"), // Дата заказа
  status: text("status").notNull().default("PENDING"), // PENDING, DISPATCHED, PACKED, SHIPPED
  shippingLabel: text("shipping_label"), // Баркод/QR код лейбла посылки
  items: text("items"), // JSON массив: [{sku, barcode, imageUrl, ebayUrl, itemName, quantity}, ...]
  dispatchedBy: varchar("dispatched_by").references(() => users.id), // Кто обработал в Dispatch
  dispatchedAt: timestamp("dispatched_at"), // Когда обработан в Dispatch
  dispatchedBarcodes: text("dispatched_barcodes"), // JSON массив баркодов отсканированных в Dispatch для верификации в Packing
  packedBy: varchar("packed_by").references(() => users.id), // Кто упаковал
  packedAt: timestamp("packed_at"), // Когда упакован
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEventLogSchema = createInsertSchema(eventLogs).omit({
  id: true,
  createdAt: true,
});

export const insertPickingListSchema = createInsertSchema(pickingLists).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export const insertPickingTaskSchema = createInsertSchema(pickingTasks).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export const insertSkuErrorSchema = createInsertSchema(skuErrors).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
});

export const insertWarehouseSettingSchema = createInsertSchema(warehouseSettings).omit({
  id: true,
  updatedAt: true,
});

export const insertActiveLocationSchema = createInsertSchema(activeLocations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCsvSourceSchema = createInsertSchema(csvSources).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGlobalSettingSchema = createInsertSchema(globalSettings).omit({
  id: true,
  updatedAt: true,
});

export const insertPendingTestSchema = createInsertSchema(pendingTests).omit({
  id: true,
  firstScanAt: true,
});

export const insertTestedItemSchema = createInsertSchema(testedItems).omit({
  id: true,
  decisionAt: true,
});

export const insertFaultyStockSchema = createInsertSchema(faultyStock).omit({
  id: true,
  decisionAt: true,
});

export const insertPendingPlacementSchema = createInsertSchema(pendingPlacements).omit({
  id: true,
  stockInAt: true,
});

export const insertCsvImportSessionSchema = createInsertSchema(csvImportSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  committedAt: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryItem = typeof inventoryItems.$inferSelect;

export type InsertEventLog = z.infer<typeof insertEventLogSchema>;
export type EventLog = typeof eventLogs.$inferSelect;

export type InsertPickingList = z.infer<typeof insertPickingListSchema>;
export type PickingList = typeof pickingLists.$inferSelect;

export type InsertPickingTask = z.infer<typeof insertPickingTaskSchema>;
export type PickingTask = typeof pickingTasks.$inferSelect;

export type InsertSkuError = z.infer<typeof insertSkuErrorSchema>;
export type SkuError = typeof skuErrors.$inferSelect;

export type InsertWarehouseSetting = z.infer<typeof insertWarehouseSettingSchema>;
export type WarehouseSetting = typeof warehouseSettings.$inferSelect;

export type InsertActiveLocation = z.infer<typeof insertActiveLocationSchema>;
export type ActiveLocation = typeof activeLocations.$inferSelect;

export type InsertCsvSource = z.infer<typeof insertCsvSourceSchema>;
export type CsvSource = typeof csvSources.$inferSelect;

export type InsertGlobalSetting = z.infer<typeof insertGlobalSettingSchema>;
export type GlobalSetting = typeof globalSettings.$inferSelect;

export type InsertPendingTest = z.infer<typeof insertPendingTestSchema>;
export type PendingTest = typeof pendingTests.$inferSelect;

export type InsertTestedItem = z.infer<typeof insertTestedItemSchema>;
export type TestedItem = typeof testedItems.$inferSelect;

export type InsertFaultyStock = z.infer<typeof insertFaultyStockSchema>;
export type FaultyStock = typeof faultyStock.$inferSelect;

export type InsertPendingPlacement = z.infer<typeof insertPendingPlacementSchema>;
export type PendingPlacement = typeof pendingPlacements.$inferSelect;

export type InsertCsvImportSession = z.infer<typeof insertCsvImportSessionSchema>;
export type CsvImportSession = typeof csvImportSessions.$inferSelect;

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
