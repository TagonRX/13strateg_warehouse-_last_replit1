import { db } from "./db";
import { 
  users, 
  inventoryItems, 
  eventLogs,
  type User, 
  type InsertUser,
  type InventoryItem,
  type InsertInventoryItem,
  type InsertEventLog,
  type EventLog
} from "@shared/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByLogin(login: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<void>;
  updateUserPassword(id: string, hashedPassword: string): Promise<void>;

  // Inventory methods
  getAllInventoryItems(): Promise<InventoryItem[]>;
  getInventoryItemByProductId(productId: string): Promise<InventoryItem | undefined>;
  createInventoryItem(item: InsertInventoryItem): Promise<InventoryItem>;
  updateInventoryItem(productId: string, updates: Partial<InsertInventoryItem>): Promise<InventoryItem>;
  bulkUpsertInventoryItems(items: InsertInventoryItem[]): Promise<{ success: number; updated: number; errors: number }>;
  
  // Event log methods
  createEventLog(log: InsertEventLog): Promise<EventLog>;
  getEventLogs(limit?: number): Promise<EventLog[]>;
  
  // Warehouse loading analysis
  getWarehouseLoadingByLocation(): Promise<{
    location: string;
    skuCount: number;
    items: { sku: string; name: string; quantity: number }[];
  }[]>;
}

export class DbStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByLogin(login: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.login, login)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async updateUserPassword(id: string, hashedPassword: string): Promise<void> {
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, id));
  }

  // Inventory methods
  async getAllInventoryItems(): Promise<InventoryItem[]> {
    return await db.select().from(inventoryItems).orderBy(inventoryItems.createdAt);
  }

  async getInventoryItemByProductId(productId: string): Promise<InventoryItem | undefined> {
    const result = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.productId, productId))
      .limit(1);
    return result[0];
  }

  async createInventoryItem(item: InsertInventoryItem): Promise<InventoryItem> {
    const result = await db.insert(inventoryItems).values(item).returning();
    return result[0];
  }

  async updateInventoryItem(productId: string, updates: Partial<InsertInventoryItem>): Promise<InventoryItem> {
    const result = await db
      .update(inventoryItems)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(inventoryItems.productId, productId))
      .returning();
    return result[0];
  }

  async bulkUpsertInventoryItems(items: InsertInventoryItem[]): Promise<{ success: number; updated: number; errors: number }> {
    let success = 0;
    let updated = 0;
    let errors = 0;

    for (const item of items) {
      try {
        const existing = await this.getInventoryItemByProductId(item.productId);
        
        if (existing) {
          // Update existing item - update quantity and location from CSV
          await this.updateInventoryItem(item.productId, {
            quantity: item.quantity,
            location: item.location,
            sku: item.sku,
            barcode: item.barcode,
          });
          updated++;
        } else {
          // Create new item
          await this.createInventoryItem(item);
          success++;
        }
      } catch (error) {
        console.error(`Error upserting item ${item.productId}:`, error);
        errors++;
      }
    }

    return { success, updated, errors };
  }

  // Event log methods
  async createEventLog(log: InsertEventLog): Promise<EventLog> {
    const result = await db.insert(eventLogs).values(log).returning();
    return result[0];
  }

  async getEventLogs(limit: number = 100): Promise<EventLog[]> {
    return await db
      .select()
      .from(eventLogs)
      .orderBy(sql`${eventLogs.createdAt} DESC`)
      .limit(limit);
  }

  // Helper function to extract location from SKU
  // SKU format examples:
  // - A101-F → Location: A101 (remove single letter after dash)
  // - E501-N → Location: E501 (remove single letter after dash)
  // - ZW-F232 → Location: ZW-F232 (no change, multi-char after dash)
  // - ABC123 → Location: ABC123 (no change, no dash)
  private extractLocation(sku: string): string {
    const parts = sku.split('-');
    // Only process if there's a dash AND last segment is exactly 1 letter
    if (parts.length > 1) {
      const lastPart = parts[parts.length - 1];
      if (lastPart.length === 1 && /[A-Z]/i.test(lastPart)) {
        // Remove the dash and single letter suffix
        return parts.slice(0, -1).join('-');
      }
    }
    // For all other cases (no dash, or multi-char suffix), return as-is
    return sku;
  }

  // Warehouse loading analysis
  async getWarehouseLoadingByLocation(): Promise<{
    location: string;
    skuCount: number;
    totalQuantity: number;
    items: { sku: string; name: string; quantity: number; barcode?: string }[];
  }[]> {
    const items = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.status, "IN_STOCK"));

    // Group by extracted location
    const locationMap = new Map<string, InventoryItem[]>();
    
    for (const item of items) {
      const location = this.extractLocation(item.sku);
      if (!locationMap.has(location)) {
        locationMap.set(location, []);
      }
      locationMap.get(location)!.push(item);
    }

    // Convert to required format
    return Array.from(locationMap.entries()).map(([location, locationItems]) => {
      const totalQuantity = locationItems.reduce((sum, item) => sum + item.quantity, 0);
      return {
        location,
        skuCount: locationItems.length,
        totalQuantity,
        items: locationItems.map(item => ({
          id: item.id,
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          barcode: item.barcode || undefined,
        })),
      };
    }).sort((a, b) => a.location.localeCompare(b.location)); // Sort by location alphabetically
  }

  // Stock-Out (Picking) operations
  async pickItemByBarcode(barcode: string, userId: string): Promise<InventoryItem | null> {
    const items = await db
      .select()
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.barcode, barcode),
        eq(inventoryItems.status, "IN_STOCK")
      ));

    if (items.length === 0) {
      return null;
    }

    const item = items[0];
    
    // Update status to PICKED
    await db
      .update(inventoryItems)
      .set({ 
        status: "PICKED",
        updatedAt: new Date()
      })
      .where(eq(inventoryItems.id, item.id));

    // Log the pick event
    await this.createEventLog({
      userId,
      action: "STOCK_OUT",
      details: `Picked item: ${item.name} (${item.sku}) - Barcode: ${barcode}`,
    });

    return item;
  }

  async deleteInventoryItem(id: string, userId: string): Promise<boolean> {
    const items = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id));

    if (items.length === 0) {
      return false;
    }

    const item = items[0];

    await db
      .delete(inventoryItems)
      .where(eq(inventoryItems.id, id));

    // Log the deletion
    await this.createEventLog({
      userId,
      action: "DELETE_ITEM",
      details: `Deleted item: ${item.name} (${item.sku})`,
    });

    return true;
  }

  async deleteItemsByLocation(location: string, userId: string): Promise<number> {
    // Get all items in this location
    const items = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.status, "IN_STOCK"));

    const itemsToDelete = items.filter(item => 
      this.extractLocation(item.sku) === location
    );

    if (itemsToDelete.length === 0) {
      return 0;
    }

    // Delete all items
    const ids = itemsToDelete.map(item => item.id);
    await db
      .delete(inventoryItems)
      .where(inArray(inventoryItems.id, ids));

    // Log the deletion
    await this.createEventLog({
      userId,
      action: "DELETE_LOCATION",
      details: `Deleted location ${location} with ${itemsToDelete.length} items`,
    });

    return itemsToDelete.length;
  }
}

export const storage = new DbStorage();
