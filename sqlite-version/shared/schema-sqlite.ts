// ═══════════════════════════════════════════════════════════════════
// WAREHOUSE MANAGEMENT SYSTEM - SQLite Schema
// Схема базы данных для SQLite версии
// ═══════════════════════════════════════════════════════════════════

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════
// USERS - Пользователи системы
// ═══════════════════════════════════════════════════════════════════

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role", { enum: ["admin", "worker"] }).notNull().default("worker"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ═══════════════════════════════════════════════════════════════════
// INVENTORY ITEMS - Товары на складе
// ═══════════════════════════════════════════════════════════════════

export const inventoryItems = sqliteTable("inventory_items", {
  id: text("id").primaryKey(),
  sku: text("sku").notNull(),
  title: text("title"),
  barcode: text("barcode"),
  location: text("location"),
  quantity: integer("quantity").notNull().default(0),
  price: real("price"),
  cost: real("cost"),
  condition: text("condition"),
  notes: text("notes"),
  images: text("images"), // JSON string array
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryItem = typeof inventoryItems.$inferSelect;

// ═══════════════════════════════════════════════════════════════════
// ACTIVE LOCATIONS - Активные локации склада
// ═══════════════════════════════════════════════════════════════════

export const activeLocations = sqliteTable("active_locations", {
  id: text("id").primaryKey(),
  location: text("location").notNull().unique(),
  barcode: text("barcode"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const insertActiveLocationSchema = createInsertSchema(activeLocations).omit({ id: true, createdAt: true });
export type InsertActiveLocation = z.infer<typeof insertActiveLocationSchema>;
export type ActiveLocation = typeof activeLocations.$inferSelect;

// ═══════════════════════════════════════════════════════════════════
// ORDERS - Заказы
// ═══════════════════════════════════════════════════════════════════

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  orderNumber: text("order_number").notNull(),
  shippingLabel: text("shipping_label"),
  status: text("status", { enum: ["PENDING", "DISPATCHED", "PACKED"] }).notNull().default("PENDING"),
  items: text("items"), // JSON string array
  packedBy: text("packed_by"),
  packedAt: text("packed_at"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// ═══════════════════════════════════════════════════════════════════
// PICKING LISTS - Списки комплектации
// ═══════════════════════════════════════════════════════════════════

export const pickingLists = sqliteTable("picking_lists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  date: text("date").notNull(),
  items: text("items"), // JSON string array
  status: text("status", { enum: ["active", "completed", "cancelled"] }).notNull().default("active"),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const insertPickingListSchema = createInsertSchema(pickingLists).omit({ id: true, createdAt: true });
export type InsertPickingList = z.infer<typeof insertPickingListSchema>;
export type PickingList = typeof pickingLists.$inferSelect;

// ═══════════════════════════════════════════════════════════════════
// EVENT LOGS - Журнал событий
// ═══════════════════════════════════════════════════════════════════

export const eventLogs = sqliteTable("event_logs", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  description: text("description"),
  userId: text("user_id"),
  itemId: text("item_id"),
  orderId: text("order_id"),
  quantity: integer("quantity"),
  cost: real("cost"),
  metadata: text("metadata"), // JSON string
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const insertEventLogSchema = createInsertSchema(eventLogs).omit({ id: true, createdAt: true });
export type InsertEventLog = z.infer<typeof insertEventLogSchema>;
export type EventLog = typeof eventLogs.$inferSelect;

// ═══════════════════════════════════════════════════════════════════
// PENDING PLACEMENTS - Ожидающие размещения
// ═══════════════════════════════════════════════════════════════════

export const pendingPlacements = sqliteTable("pending_placements", {
  id: text("id").primaryKey(),
  sku: text("sku").notNull(),
  barcode: text("barcode"),
  quantity: integer("quantity").notNull().default(1),
  condition: text("condition"),
  testedBy: text("tested_by"),
  testedAt: text("tested_at"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const insertPendingPlacementSchema = createInsertSchema(pendingPlacements).omit({ id: true, createdAt: true });
export type InsertPendingPlacement = z.infer<typeof insertPendingPlacementSchema>;
export type PendingPlacement = typeof pendingPlacements.$inferSelect;

// ═══════════════════════════════════════════════════════════════════
// WAREHOUSE SETTINGS - Настройки склада
// ═══════════════════════════════════════════════════════════════════

export const warehouseSettings = sqliteTable("warehouse_settings", {
  id: text("id").primaryKey(),
  locationPattern: text("location_pattern").notNull(),
  maxTsku: integer("max_tsku"),
  maxQuantity: integer("max_quantity"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const insertWarehouseSettingSchema = createInsertSchema(warehouseSettings).omit({ id: true, createdAt: true });
export type InsertWarehouseSetting = z.infer<typeof insertWarehouseSettingSchema>;
export type WarehouseSetting = typeof warehouseSettings.$inferSelect;

// ═══════════════════════════════════════════════════════════════════
// WORKER ANALYTICS - Аналитика работников
// ═══════════════════════════════════════════════════════════════════

export const workerAnalytics = sqliteTable("worker_analytics", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  date: text("date").notNull(),
  itemsProcessed: integer("items_processed").notNull().default(0),
  ordersCompleted: integer("orders_completed").notNull().default(0),
  totalCost: real("total_cost").notNull().default(0),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const insertWorkerAnalyticSchema = createInsertSchema(workerAnalytics).omit({ id: true, createdAt: true });
export type InsertWorkerAnalytic = z.infer<typeof insertWorkerAnalyticSchema>;
export type WorkerAnalytic = typeof workerAnalytics.$inferSelect;
