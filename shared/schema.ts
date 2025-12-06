import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Миграции (для отслеживания выполненных миграций)
export const migrations = sqliteTable("migrations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  executedAt: text("executed_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Пользователи (упрощенная аутентификация)
export const users = sqliteTable("users", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  name: text("name").notNull(),
  login: text("login").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull(), // 'admin' или 'worker'
  defaultPassword: text("default_password"),
  requiresPasswordChange: integer("requires_password_change", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Товары в инвентаре
export const inventoryItems = sqliteTable("inventory_items", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  productId: text("product_id"),
  name: text("name"),
  sku: text("sku").notNull(),
  location: text("location").notNull(),
  quantity: integer("quantity").notNull().default(1),
  expectedQuantity: integer("expected_quantity"),
  zeroQuantitySince: text("zero_quantity_since"),
  barcode: text("barcode"),
  barcodeMappings: text("barcode_mappings"),
  condition: text("condition"),
  length: integer("length"),
  width: integer("width"),
  height: integer("height"),
  volume: integer("volume"),
  weight: integer("weight"),
  price: integer("price"),
  itemId: text("item_id"),
  ebayUrl: text("ebay_url"),
  imageUrls: text("image_urls"),
  ebaySellerName: text("ebay_seller_name"),
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
  createdBy: text("created_by"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Логи событий
export const eventLogs = sqliteTable("event_logs", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  userId: text("user_id"),
  action: text("action").notNull(),
  details: text("details").notNull(),
  productId: text("product_id"),
  itemName: text("item_name"),
  sku: text("sku"),
  location: text("location"),
  quantity: integer("quantity"),
  price: integer("price"),
  isWarning: integer("is_warning", { mode: "boolean" }).notNull().default(false),
  withoutTest: integer("without_test", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Аналитика работников
export const workerAnalytics = sqliteTable("worker_analytics", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  userId: text("user_id"),
  date: text("date").notNull(),
  itemsReceived: integer("items_received").notNull().default(0),
  itemsPicked: integer("items_picked").notNull().default(0),
  itemsPacked: integer("items_packed").notNull().default(0),
  csvErrors: integer("csv_errors").notNull().default(0),
});

// Picking Lists
export const pickingLists = sqliteTable("picking_lists", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  name: text("name").notNull(),
  status: text("status").notNull().default("PENDING"),
  createdBy: text("created_by"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: text("completed_at"),
});

// Задачи для picking list
export const pickingTasks = sqliteTable("picking_tasks", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  listId: text("list_id"),
  itemId: text("item_id"),
  sku: text("sku").notNull(),
  itemName: text("item_name"),
  itemNameSource: text("item_name_source"),
  buyerUsername: text("buyer_username"),
  buyerName: text("buyer_name"),
  addressPostalCode: text("address_postal_code"),
  sellerEbayId: text("seller_ebay_id"),
  orderDate: text("order_date"),
  ebaySellerName: text("ebay_seller_name"),
  requiredQuantity: integer("required_quantity").notNull().default(1),
  pickedQuantity: integer("picked_quantity").notNull().default(0),
  status: text("status").notNull().default("PENDING"),
  pickedItemIds: text("picked_item_ids"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: text("completed_at"),
});

// SKU Errors
export const skuErrors = sqliteTable("sku_errors", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  productId: text("product_id").notNull(),
  name: text("name").notNull(),
  csvSku: text("csv_sku").notNull(),
  existingSku: text("existing_sku").notNull(),
  quantity: integer("quantity").notNull().default(1),
  barcode: text("barcode"),
  status: text("status").notNull().default("PENDING"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  resolvedAt: text("resolved_at"),
});

// Настройки склада - TSKU и MAXQ
export const warehouseSettings = sqliteTable("warehouse_settings", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  locationPattern: text("location_pattern").notNull().unique(),
  tsku: integer("tsku").notNull().default(4),
  maxq: integer("maxq").notNull().default(10),
  bypassCode: text("bypass_code"),
  // Color thresholds (percentages 0-100) for TSKU and MAXQ indicators
  greenThreshold: integer("green_threshold").default(25),  // 0-25% = green
  yellowThreshold: integer("yellow_threshold").default(50),  // 25-50% = yellow
  orangeThreshold: integer("orange_threshold").default(75),  // 50-75% = orange
  // 75-100% = red (implicit)
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Активные локации
export const activeLocations = sqliteTable("active_locations", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  location: text("location").notNull().unique(),
  barcode: text("barcode"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// CSV источники для Picking Lists
export const csvSources = sqliteTable("csv_sources", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  url: text("url").notNull(),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Источники для массовой загрузки инвентаря
export const bulkUploadSources = sqliteTable("bulk_upload_sources", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  url: text("url").notNull(),
  label: text("label").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  fieldSyncSettings: text("field_sync_settings"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Глобальные настройки
export const globalSettings = sqliteTable("global_settings", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Товары на тестировании
export const pendingTests = sqliteTable("pending_tests", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  barcode: text("barcode").notNull().unique(),
  sku: text("sku"),
  productId: text("product_id"),
  name: text("name"),
  firstScanAt: text("first_scan_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  firstScanBy: text("first_scan_by").notNull(),
});

// Протестированные товары
export const testedItems = sqliteTable("tested_items", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  barcode: text("barcode").notNull(),
  sku: text("sku"),
  productId: text("product_id"),
  name: text("name"),
  condition: text("condition").notNull(),
  firstScanAt: text("first_scan_at").notNull(),
  firstScanBy: text("first_scan_by").notNull(),
  decisionAt: text("decision_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  decisionBy: text("decision_by").notNull(),
});

// Бракованные товары
export const faultyStock = sqliteTable("faulty_stock", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  barcode: text("barcode").notNull(),
  sku: text("sku"),
  productId: text("product_id"),
  name: text("name"),
  condition: text("condition").notNull(),
  firstScanAt: text("first_scan_at").notNull(),
  firstScanBy: text("first_scan_by").notNull(),
  decisionAt: text("decision_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  decisionBy: text("decision_by").notNull(),
  workingHours: integer("working_hours").notNull(),
});

// Товары ожидающие размещения
export const pendingPlacements = sqliteTable("pending_placements", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  barcode: text("barcode").notNull(),
  sku: text("sku").notNull(),
  location: text("location").notNull(),
  productId: text("product_id"),
  name: text("name"),
  condition: text("condition").notNull(),
  quantity: integer("quantity").notNull().default(1),
  price: integer("price"),
  length: integer("length"),
  width: integer("width"),
  height: integer("height"),
  volume: integer("volume"),
  weight: integer("weight"),
  stockInAt: text("stock_in_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  stockInBy: text("stock_in_by").notNull(),
});

// Сессии импорта CSV
export const csvImportSessions = sqliteTable("csv_import_sessions", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  sourceType: text("source_type").notNull(),
  sourceUrl: text("source_url"),
  fileName: text("file_name"),
  status: text("status").notNull().default("PARSING"),
  error: text("error"),
  parsedData: text("parsed_data"),
  conflicts: text("conflicts"),
  resolutions: text("resolutions"),
  totalRows: integer("total_rows").notNull().default(0),
  matchedRows: integer("matched_rows").notNull().default(0),
  conflictRows: integer("conflict_rows").notNull().default(0),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  committedAt: text("committed_at"),
});

// Заказы
export const orders = sqliteTable("orders", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  orderNumber: text("order_number").notNull().unique(),
  buyerUsername: text("buyer_username"),
  buyerName: text("buyer_name"),
  addressPostalCode: text("address_postal_code"),
  sellerEbayId: text("seller_ebay_id"),
  customerName: text("customer_name"),
  shippingAddress: text("shipping_address"),
  orderDate: text("order_date"),
  status: text("status").notNull().default("PENDING"),
  shippingLabel: text("shipping_label"),
  items: text("items"),
  dispatchedBy: text("dispatched_by"),
  dispatchedAt: text("dispatched_at"),
  dispatchedBarcodes: text("dispatched_barcodes"),
  packedBy: text("packed_by"),
  packedAt: text("packed_at"),
  createdBy: text("created_by"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Архивные товары
export const archivedInventoryItems = sqliteTable("archived_inventory_items", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  originalId: text("original_id"),
  productId: text("product_id"),
  name: text("name"),
  sku: text("sku").notNull(),
  location: text("location").notNull(),
  quantity: integer("quantity").notNull(),
  barcode: text("barcode"),
  barcodeMappings: text("barcode_mappings"),
  condition: text("condition"),
  length: integer("length"),
  width: integer("width"),
  height: integer("height"),
  volume: integer("volume"),
  weight: integer("weight"),
  price: integer("price"),
  itemId: text("item_id"),
  ebayUrl: text("ebay_url"),
  imageUrls: text("image_urls"),
  ebaySellerName: text("ebay_seller_name"),
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
  archivedBy: text("archived_by"),
  archivedAt: text("archived_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  originalCreatedAt: text("original_created_at"),
  originalUpdatedAt: text("original_updated_at"),
});

// Настройки планировщика
export const schedulerSettings = sqliteTable("scheduler_settings", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  cronExpression: text("cron_expression").notNull().default("0 6 * * *"),
  lastRunAt: text("last_run_at"),
  lastRunStatus: text("last_run_status"),
  lastRunError: text("last_run_error"),
  lastRunId: text("last_run_id"),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// История импорта
export const importRuns = sqliteTable("import_runs", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  sourceType: text("source_type").notNull(),
  sourceRef: text("source_ref"),
  triggeredBy: text("triggered_by"),
  rowsTotal: integer("rows_total").notNull().default(0),
  rowsWithId: integer("rows_with_id").notNull().default(0),
  rowsWithoutId: integer("rows_without_id").notNull().default(0),
  created: integer("created").notNull().default(0),
  updatedAllFields: integer("updated_all_fields").notNull().default(0),
  updatedQuantityOnly: integer("updated_quantity_only").notNull().default(0),
  updatedPartial: integer("updated_partial").notNull().default(0),
  skippedNoId: integer("skipped_no_id").notNull().default(0),
  errors: integer("errors").notNull().default(0),
  totalQuantityChange: integer("total_quantity_change").notNull().default(0),
  errorDetails: text("error_details"),
  status: text("status").notNull().default("SUCCESS"),
  duration: integer("duration"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Резервы по SKU (для расчёта ATP и защиты от overstock)
export const reservations = sqliteTable("reservations", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  orderId: text("order_id"),
  sku: text("sku").notNull(),
  quantity: integer("quantity").notNull().default(1),
  status: text("status").notNull().default("ACTIVE"), // ACTIVE | CLEARED
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  clearedAt: text("cleared_at"),
});

export const insertReservationSchema = createInsertSchema(reservations).omit({
  id: true,
  createdAt: true,
  clearedAt: true,
});

// eBay Accounts (multiple stores support)
export const ebayAccounts = sqliteTable("ebay_accounts", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  label: text("label").notNull(),
  siteId: text("site_id"),
  clientId: text("client_id").notNull(),
  clientSecret: text("client_secret").notNull(),
  refreshToken: text("refresh_token").notNull(),
  accessToken: text("access_token"),
  accessTokenExpiresAt: text("access_token_expires_at"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastOrdersSince: text("last_orders_since"),
  lastInventorySince: text("last_inventory_since"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  // Новые флаги использования
  useOrders: integer("use_orders", { mode: "boolean" }).notNull().default(false),
  useInventory: integer("use_inventory", { mode: "boolean" }).notNull().default(false),
});

// External order idempotency index (avoid duplicates)
export const externalOrdersIndex = sqliteTable("external_orders_index", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  accountId: text("account_id").notNull(),
  externalOrderId: text("external_order_id").notNull(),
  orderId: text("order_id").notNull(),
  importedAt: text("imported_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// External inventory index (map eBay item to local inventory)
export const externalInventoryIndex = sqliteTable("external_inventory_index", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  accountId: text("account_id").notNull(),
  externalItemId: text("external_item_id").notNull(),
  sku: text("sku"),
  inventoryItemId: text("inventory_item_id"),
  importedAt: text("imported_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Insert schemas (new)
export const insertEbayAccountSchema = createInsertSchema(ebayAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  accessToken: true,
  accessTokenExpiresAt: true,
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

export const insertBulkUploadSourceSchema = createInsertSchema(bulkUploadSources).omit({
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

export const insertArchivedInventoryItemSchema = createInsertSchema(archivedInventoryItems).omit({
  id: true,
  archivedAt: true,
});

export const insertSchedulerSettingSchema = createInsertSchema(schedulerSettings).omit({
  id: true,
  updatedAt: true,
});

export const insertImportRunSchema = createInsertSchema(importRuns).omit({
  id: true,
  createdAt: true,
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

export type InsertBulkUploadSource = z.infer<typeof insertBulkUploadSourceSchema>;
export type BulkUploadSource = typeof bulkUploadSources.$inferSelect;

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

export type InsertArchivedInventoryItem = z.infer<typeof insertArchivedInventoryItemSchema>;
export type ArchivedInventoryItem = typeof archivedInventoryItems.$inferSelect;

export type InsertSchedulerSetting = z.infer<typeof insertSchedulerSettingSchema>;
export type SchedulerSetting = typeof schedulerSettings.$inferSelect;

export type InsertImportRun = z.infer<typeof insertImportRunSchema>;
export type ImportRun = typeof importRuns.$inferSelect;
