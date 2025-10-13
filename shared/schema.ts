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
  productId: text("product_id"), // ID товара (опционально, может синхронизироваться через CSV)
  name: text("name"), // Название (опционально, может добавиться через CSV)
  sku: text("sku").notNull(), // SKU = Локация (обязательно)
  location: text("location").notNull(), // То же что SKU (автоматически)
  quantity: integer("quantity").notNull().default(1),
  barcode: text("barcode"), // Опционально
  length: integer("length"), // Длина в см (до 3 знаков, макс 999)
  width: integer("width"), // Ширина в см (до 3 знаков, макс 999)
  height: integer("height"), // Высота в см (до 3 знаков, макс 999)
  volume: integer("volume"), // Объем (перемножение length * width * height)
  weight: integer("weight"), // Вес в кг (до 3 знаков, макс 999)
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Логи событий
export const eventLogs = pgTable("event_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  action: text("action").notNull(), // STOCK_IN, STOCK_OUT, CSV_UPLOAD, etc
  details: text("details").notNull(),
  // Дополнительная информация о товаре для отслеживания истории
  productId: text("product_id"), // ID товара (для отслеживания одного товара с разными SKU)
  itemName: text("item_name"), // Название товара
  sku: text("sku"), // SKU/Локация на момент действия
  location: text("location"), // Локация на момент действия
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Аналитика работников
export const workerAnalytics = pgTable("worker_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  date: text("date").notNull(), // YYYY-MM-DD
  itemsReceived: integer("items_received").notNull().default(0),
  itemsPicked: integer("items_picked").notNull().default(0),
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
  isActive: boolean("is_active").notNull().default(true),
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
