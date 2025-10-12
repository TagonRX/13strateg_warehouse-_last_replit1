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
  productId: text("product_id").notNull(), // ID товара для проверки дублей
  name: text("name").notNull(),
  sku: text("sku").notNull(), // SKU = Локация
  location: text("location").notNull(), // То же что SKU
  quantity: integer("quantity").notNull().default(1),
  barcode: text("barcode"), // Опционально
  status: text("status").notNull().default("IN_STOCK"), // IN_STOCK, PICKED
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
