import { db } from "./db";
import { 
  users, 
  inventoryItems, 
  eventLogs,
  pickingLists,
  pickingTasks,
  type User, 
  type InsertUser,
  type InventoryItem,
  type InsertInventoryItem,
  type InsertEventLog,
  type EventLog,
  type PickingList,
  type InsertPickingList,
  type PickingTask,
  type InsertPickingTask
} from "@shared/schema";
import { eq, and, or, sql, inArray, ilike } from "drizzle-orm";

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
  getEventLogs(filters?: {
    limit?: number;
    userId?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<EventLog[]>;
  
  // Warehouse loading analysis
  getWarehouseLoadingByLocation(): Promise<{
    location: string;
    skuCount: number;
    items: { sku: string; name: string; quantity: number }[];
  }[]>;
  
  // Worker analytics
  getWorkerAnalytics(period: 'day' | 'week' | 'month' | 'all'): Promise<{
    userId: string;
    userName: string;
    login: number;
    stockIn: number;
    stockOut: number;
    csvUpload: number;
    pickingListCreated: number;
    itemPicked: number;
    locationDeleted: number;
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

  async getEventLogs(filters?: {
    limit?: number;
    userId?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<EventLog[]> {
    const limit = filters?.limit || 100;
    const conditions = [];
    
    // Build filter conditions
    if (filters?.userId) {
      conditions.push(eq(eventLogs.userId, filters.userId));
    }
    
    if (filters?.search) {
      conditions.push(
        or(
          ilike(eventLogs.details, `%${filters.search}%`),
          ilike(eventLogs.action, `%${filters.search}%`)
        )!
      );
    }
    
    if (filters?.startDate) {
      conditions.push(sql`${eventLogs.createdAt} >= ${filters.startDate}`);
    }
    
    if (filters?.endDate) {
      // Add 1 day to endDate to include the entire day using SQL interval
      conditions.push(sql`${eventLogs.createdAt} < (${filters.endDate}::date + INTERVAL '1 day')`);
    }
    
    // Apply filters using AND
    let query = db.select().from(eventLogs);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return await query
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

  // Daily Picking methods
  async createPickingList(data: { name: string; userId: string; tasks: { sku: string; requiredQuantity: number }[] }): Promise<{ list: PickingList; tasks: PickingTask[] }> {
    // Create the picking list
    const [list] = await db.insert(pickingLists).values({
      name: data.name,
      createdBy: data.userId,
      status: "PENDING",
    }).returning();

    // Create tasks for the picking list
    const tasks = await db.insert(pickingTasks).values(
      data.tasks.map(task => ({
        listId: list.id,
        sku: task.sku,
        requiredQuantity: task.requiredQuantity,
        pickedQuantity: 0,
        status: "PENDING",
      }))
    ).returning();

    // Log the event
    await this.createEventLog({
      userId: data.userId,
      action: "CREATE_PICKING_LIST",
      details: `Created picking list "${data.name}" with ${data.tasks.length} tasks`,
    });

    return { list, tasks };
  }

  async getAllPickingLists(): Promise<PickingList[]> {
    return await db.select().from(pickingLists).orderBy(sql`${pickingLists.createdAt} DESC`);
  }

  async getPickingListWithTasks(listId: string): Promise<{ list: PickingList; tasks: PickingTask[] } | null> {
    const [list] = await db.select().from(pickingLists).where(eq(pickingLists.id, listId));
    if (!list) return null;

    const tasks = await db.select().from(pickingTasks)
      .where(eq(pickingTasks.listId, listId))
      .orderBy(pickingTasks.sku);

    return { list, tasks };
  }

  async scanBarcodeForPickingTask(barcode: string, taskId: string, userId: string): Promise<{
    success: boolean;
    message: string;
    item?: InventoryItem;
    task?: PickingTask;
  }> {
    // Get the task
    const [task] = await db.select().from(pickingTasks).where(eq(pickingTasks.id, taskId));
    if (!task) {
      return { success: false, message: "Task not found" };
    }

    // Find item with matching barcode (IN_STOCK only)
    const [item] = await db.select().from(inventoryItems)
      .where(and(
        eq(inventoryItems.barcode, barcode),
        eq(inventoryItems.status, "IN_STOCK")
      ));

    if (!item) {
      return { success: false, message: "Item not found or already picked" };
    }

    // Check if SKU matches
    if (item.sku !== task.sku) {
      return { 
        success: false, 
        message: `Wrong item! Expected SKU: ${task.sku}, but scanned: ${item.sku}` 
      };
    }

    // Check if task is already complete
    if (task.pickedQuantity >= task.requiredQuantity) {
      return { success: false, message: "Task already completed" };
    }

    // Mark item as PICKED
    await db.update(inventoryItems)
      .set({ status: "PICKED", updatedAt: new Date() })
      .where(eq(inventoryItems.id, item.id));

    // Update task progress
    const pickedIds = task.pickedItemIds || [];
    pickedIds.push(item.id);
    const newPickedQuantity = task.pickedQuantity + 1;
    const isCompleted = newPickedQuantity >= task.requiredQuantity;

    const [updatedTask] = await db.update(pickingTasks)
      .set({
        pickedQuantity: newPickedQuantity,
        pickedItemIds: pickedIds,
        status: isCompleted ? "COMPLETED" : "PENDING",
        completedAt: isCompleted ? new Date() : null,
      })
      .where(eq(pickingTasks.id, taskId))
      .returning();

    // Log the event
    await this.createEventLog({
      userId,
      action: "PICK_ITEM",
      details: `Picked ${item.name} (${item.sku}) for picking list task`,
    });

    return { 
      success: true, 
      message: `Item picked successfully! Progress: ${newPickedQuantity}/${task.requiredQuantity}`,
      item,
      task: updatedTask
    };
  }

  async deletePickingList(listId: string, userId: string): Promise<boolean> {
    const [list] = await db.select().from(pickingLists).where(eq(pickingLists.id, listId));
    if (!list) return false;

    // Delete tasks first
    await db.delete(pickingTasks).where(eq(pickingTasks.listId, listId));
    
    // Delete list
    await db.delete(pickingLists).where(eq(pickingLists.id, listId));

    // Log the event
    await this.createEventLog({
      userId,
      action: "DELETE_PICKING_LIST",
      details: `Deleted picking list "${list.name}"`,
    });

    return true;
  }

  async getWorkerAnalytics(period: 'day' | 'week' | 'month' | 'all'): Promise<{
    userId: string;
    userName: string;
    login: number;
    stockIn: number;
    stockOut: number;
    csvUpload: number;
    pickingListCreated: number;
    itemPicked: number;
    locationDeleted: number;
  }[]> {
    // Calculate date filter based on period
    let dateFilter = sql`true`;
    if (period === 'day') {
      dateFilter = sql`${eventLogs.createdAt} >= CURRENT_DATE`;
    } else if (period === 'week') {
      dateFilter = sql`${eventLogs.createdAt} >= CURRENT_DATE - INTERVAL '7 days'`;
    } else if (period === 'month') {
      dateFilter = sql`${eventLogs.createdAt} >= CURRENT_DATE - INTERVAL '30 days'`;
    }

    // Get all users
    const allUsers = await db.select().from(users).where(eq(users.role, 'worker'));
    
    // Get event logs for the period
    const logs = await db.select().from(eventLogs).where(dateFilter);

    // Group by user and count actions
    const analytics = allUsers.map(user => {
      const userLogs = logs.filter(log => log.userId === user.id);
      
      return {
        userId: user.id,
        userName: user.name,
        login: userLogs.filter(log => log.action === 'LOGIN').length,
        stockIn: userLogs.filter(log => log.action === 'STOCK_IN').length,
        stockOut: userLogs.filter(log => log.action === 'STOCK_OUT').length,
        csvUpload: userLogs.filter(log => log.action === 'CSV_UPLOAD').length,
        pickingListCreated: userLogs.filter(log => log.action === 'PICKING_LIST_CREATED').length,
        itemPicked: userLogs.filter(log => log.action === 'PICK_ITEM' || log.action === 'ITEM_PICKED').length,
        locationDeleted: userLogs.filter(log => log.action === 'LOCATION_DELETED').length,
      };
    });

    return analytics;
  }
}

export const storage = new DbStorage();
