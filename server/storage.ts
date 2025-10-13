import { db } from "./db";
import { 
  users, 
  inventoryItems, 
  eventLogs,
  pickingLists,
  pickingTasks,
  skuErrors,
  warehouseSettings,
  activeLocations,
  type User, 
  type InsertUser,
  type InventoryItem,
  type InsertInventoryItem,
  type InsertEventLog,
  type EventLog,
  type PickingList,
  type InsertPickingList,
  type PickingTask,
  type InsertPickingTask,
  type SkuError,
  type InsertSkuError,
  type WarehouseSetting,
  type InsertWarehouseSetting,
  type ActiveLocation,
  type InsertActiveLocation
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
  updateUserName(id: string, name: string): Promise<User>;

  // Inventory methods
  getAllInventoryItems(): Promise<InventoryItem[]>;
  getInventoryItemById(id: string): Promise<InventoryItem | undefined>;
  getInventoryItemByProductId(productId: string): Promise<InventoryItem | undefined>;
  createInventoryItem(item: InsertInventoryItem): Promise<InventoryItem>;
  updateInventoryItem(productId: string, updates: Partial<InsertInventoryItem>): Promise<InventoryItem>;
  updateInventoryItemById(id: string, updates: Partial<InsertInventoryItem>): Promise<InventoryItem>;
  deleteInventoryItem(id: string, userId: string): Promise<boolean>;
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

  // SKU Errors
  createSkuError(error: InsertSkuError): Promise<SkuError>;
  getAllSkuErrors(): Promise<SkuError[]>;
  getSkuError(id: string): Promise<SkuError | undefined>;
  resolveSkuError(id: string, correctedSku: string, userId: string): Promise<void>;
  deleteSkuError(id: string): Promise<void>;

  // Warehouse Settings
  getAllWarehouseSettings(): Promise<WarehouseSetting[]>;
  getWarehouseSetting(locationPattern: string): Promise<WarehouseSetting | undefined>;
  upsertWarehouseSetting(setting: InsertWarehouseSetting): Promise<WarehouseSetting>;
  deleteWarehouseSetting(locationPattern: string): Promise<void>;

  // Active Locations
  getAllActiveLocations(): Promise<ActiveLocation[]>;
  setActiveLocations(locations: string[]): Promise<void>;
  clearActiveLocations(): Promise<void>;
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

  async updateUserName(id: string, name: string): Promise<User> {
    const result = await db.update(users).set({ name }).where(eq(users.id, id)).returning();
    return result[0];
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

  async getInventoryItemById(id: string): Promise<InventoryItem | undefined> {
    const result = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
      .limit(1);
    return result[0];
  }

  async updateInventoryItemById(id: string, updates: Partial<InsertInventoryItem>): Promise<InventoryItem> {
    const result = await db
      .update(inventoryItems)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(inventoryItems.id, id))
      .returning();
    return result[0];
  }

  async bulkUpsertInventoryItems(items: InsertInventoryItem[]): Promise<{ success: number; updated: number; errors: number }> {
    let success = 0;
    let updated = 0;
    let errors = 0;

    // Load all existing items ONCE at the start (optimized)
    const allExistingItems = await this.getAllInventoryItems();
    const existingByProductId = new Map(
      allExistingItems
        .filter(i => i.productId)
        .map(i => [i.productId!, i])
    );

    const itemsToCreate: InsertInventoryItem[] = [];
    const itemsToUpdate: { id: string; updates: Partial<InsertInventoryItem> }[] = [];
    const skuErrorsToCreate: InsertSkuError[] = [];
    
    // Track items being created to avoid duplicates within same upload
    const createdProductIds = new Set<string>();

    // Process all items in memory first
    for (const item of items) {
      try {
        // Extract location from SKU if not provided
        const location = item.location || this.extractLocation(item.sku);
        
        // If productId provided, check by productId
        if (item.productId && existingByProductId.has(item.productId)) {
          const existing = existingByProductId.get(item.productId)!;
          
          // Check if SKU matches
          if (existing.sku === item.sku) {
            // SKU matches - prepare update
            itemsToUpdate.push({
              id: existing.id,
              updates: {
                quantity: item.quantity,
                barcode: item.barcode,
                name: item.name,
                location: location,
              }
            });
          } else {
            // SKU mismatch - prepare SKU error record
            skuErrorsToCreate.push({
              productId: item.productId,
              name: item.name || "",
              csvSku: item.sku,
              existingSku: existing.sku,
              quantity: item.quantity,
              barcode: item.barcode,
              status: "PENDING",
            });
          }
        } else if (item.productId) {
          // ProductId provided but not found
          // Check for duplicates within this upload
          if (!createdProductIds.has(item.productId)) {
            itemsToCreate.push({ ...item, location });
            createdProductIds.add(item.productId);
          } else {
            // Duplicate productId in same upload - skip with error
            errors++;
            console.warn(`Duplicate productId in CSV: ${item.productId}`);
          }
        } else {
          // No productId - try to find by SKU and name
          const matchBySku = allExistingItems.find(i => i.sku === item.sku && i.name === item.name);
          const matchBySkuOnly = allExistingItems.find(i => i.sku === item.sku && !i.productId);

          if (matchBySku && !matchBySku.productId) {
            itemsToUpdate.push({
              id: matchBySku.id,
              updates: {
                quantity: matchBySku.quantity + (item.quantity || 1),
                name: item.name || matchBySku.name,
                barcode: item.barcode || matchBySku.barcode,
                location: location,
              }
            });
          } else if (matchBySkuOnly) {
            itemsToUpdate.push({
              id: matchBySkuOnly.id,
              updates: {
                quantity: matchBySkuOnly.quantity + (item.quantity || 1),
                name: item.name || matchBySkuOnly.name,
                barcode: item.barcode || matchBySkuOnly.barcode,
                location: location,
              }
            });
          } else {
            // Create new item
            itemsToCreate.push({ ...item, location });
          }
        }
      } catch (error) {
        console.error(`Error processing item:`, error);
        errors++;
      }
    }

    // Batch insert new items (chunks of 100) with fallback to individual inserts on error
    if (itemsToCreate.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < itemsToCreate.length; i += chunkSize) {
        const chunk = itemsToCreate.slice(i, i + chunkSize);
        try {
          await db.insert(inventoryItems).values(chunk);
          success += chunk.length; // Count success AFTER successful insert
        } catch (error) {
          console.error(`Batch insert error, retrying item-by-item:`, error);
          // Fallback: insert one by one to avoid losing entire chunk
          for (const item of chunk) {
            try {
              await db.insert(inventoryItems).values(item);
              success++;
            } catch (itemError) {
              console.error(`Individual insert error for ${item.productId}:`, itemError);
              errors++;
            }
          }
        }
      }
    }

    // Batch update items
    for (const { id, updates } of itemsToUpdate) {
      try {
        await db
          .update(inventoryItems)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(inventoryItems.id, id));
        updated++; // Count AFTER successful update
      } catch (error) {
        console.error(`Update error:`, error);
        errors++;
      }
    }

    // Batch insert SKU errors (chunks of 100)
    if (skuErrorsToCreate.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < skuErrorsToCreate.length; i += chunkSize) {
        const chunk = skuErrorsToCreate.slice(i, i + chunkSize);
        try {
          await db.insert(skuErrors).values(chunk);
        } catch (error) {
          console.error(`SKU errors batch insert error:`, error);
        }
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
      // Search across all relevant fields including new product fields
      conditions.push(
        or(
          ilike(eventLogs.details, `%${filters.search}%`),
          ilike(eventLogs.action, `%${filters.search}%`),
          ilike(eventLogs.productId, `%${filters.search}%`),
          ilike(eventLogs.itemName, `%${filters.search}%`),
          ilike(eventLogs.sku, `%${filters.search}%`),
          ilike(eventLogs.location, `%${filters.search}%`)
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
  // - A101-F → Location: A101 (letter + 1-3 digits)
  // - A107Y-E → Location: A107 (letter + 1-3 digits, ignore rest)
  // - E501-N → Location: E501 (letter + 1-3 digits)
  // - kjkhk → Location: kjkhk (no pattern match, use full SKU)
  private extractLocation(sku: string): string {
    // Match: single letter followed by 1-3 digits at the start
    const match = sku.match(/^([A-Z]\d{1,3})/i);
    if (match) {
      return match[1].toUpperCase();
    }
    // If no pattern match, return the full SKU as location
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
      .from(inventoryItems);

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
          name: item.name || "Без названия",
          quantity: item.quantity,
          barcode: item.barcode || undefined,
        })),
      };
    }).sort((a, b) => a.location.localeCompare(b.location)); // Sort by location alphabetically
  }

  // Stock-Out (Picking) operations
  async pickItemByBarcode(barcode: string, userId: string): Promise<InventoryItem | null> {
    // Try to find by barcode first
    let items = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.barcode, barcode));

    // If not found by barcode, try by SKU
    if (items.length === 0) {
      items = await db
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.sku, barcode));
    }

    if (items.length === 0) {
      return null;
    }

    // If multiple items found, pick the first one with quantity > 0
    const item = items.find(i => i.quantity > 0) || items[0];
    console.log(`[PICK] Found ${items.length} items with barcode/SKU ${barcode}, picking item with ID ${item.id}, productId ${item.productId}, quantity ${item.quantity}`);
    
    // Decrease quantity by 1
    const newQuantity = item.quantity - 1;
    
    if (newQuantity <= 0) {
      // Delete item if quantity reaches 0
      await db
        .delete(inventoryItems)
        .where(eq(inventoryItems.id, item.id));
    } else {
      // Update quantity
      await db
        .update(inventoryItems)
        .set({ 
          quantity: newQuantity,
          updatedAt: new Date()
        })
        .where(eq(inventoryItems.id, item.id));
    }

    // Log the pick event
    await this.createEventLog({
      userId,
      action: "STOCK_OUT",
      details: `Picked item: ${item.name} (${item.sku}) - Barcode: ${barcode}`,
      productId: item.productId || null,
      itemName: item.name || null,
      sku: item.sku,
      location: item.location,
    });

    // Return item with updated quantity
    return { ...item, quantity: newQuantity };
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
      productId: item.productId || null,
      itemName: item.name || null,
      sku: item.sku,
      location: item.location,
    });

    return true;
  }

  async deleteItemsByLocation(location: string, userId: string): Promise<number> {
    // Get all items in this location
    const items = await db
      .select()
      .from(inventoryItems);

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

    // Find item with matching barcode
    const [item] = await db.select().from(inventoryItems)
      .where(eq(inventoryItems.barcode, barcode));

    if (!item) {
      return { success: false, message: "Item not found" };
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

    // Decrease item quantity by 1 or delete if quantity reaches 0
    const newQuantity = item.quantity - 1;
    if (newQuantity <= 0) {
      await db.delete(inventoryItems)
        .where(eq(inventoryItems.id, item.id));
    } else {
      await db.update(inventoryItems)
        .set({ quantity: newQuantity, updatedAt: new Date() })
        .where(eq(inventoryItems.id, item.id));
    }

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
      productId: item.productId || null,
      itemName: item.name || null,
      sku: item.sku,
      location: item.location,
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

  // SKU Errors methods
  async createSkuError(error: InsertSkuError): Promise<SkuError> {
    const result = await db.insert(skuErrors).values(error).returning();
    return result[0];
  }

  async getAllSkuErrors(): Promise<SkuError[]> {
    return await db.select().from(skuErrors).where(eq(skuErrors.status, 'PENDING')).orderBy(skuErrors.createdAt);
  }

  async getSkuError(id: string): Promise<SkuError | undefined> {
    const result = await db.select().from(skuErrors).where(eq(skuErrors.id, id)).limit(1);
    return result[0];
  }

  async resolveSkuError(id: string, correctedSku: string, userId: string): Promise<void> {
    const error = await this.getSkuError(id);
    if (!error) throw new Error("SKU error not found");

    // Find existing inventory item by productId
    const existing = await this.getInventoryItemByProductId(error.productId);
    
    if (existing) {
      // Update existing item: correct SKU/location and add quantity
      await this.updateInventoryItem(error.productId, {
        sku: correctedSku,
        location: correctedSku,
        quantity: existing.quantity + error.quantity,
        barcode: error.barcode || existing.barcode,
      });
    } else {
      // If somehow doesn't exist, create new (shouldn't happen in normal flow)
      await this.createInventoryItem({
        productId: error.productId,
        name: error.name,
        sku: correctedSku,
        location: correctedSku,
        quantity: error.quantity,
        barcode: error.barcode,
        createdBy: userId,
      });
    }

    // Mark error as resolved
    await db.update(skuErrors)
      .set({ status: "RESOLVED", resolvedAt: new Date() })
      .where(eq(skuErrors.id, id));

    // Log the event
    await this.createEventLog({
      userId,
      action: "SKU_ERROR_RESOLVED",
      details: `Resolved SKU error for ${error.name} (${error.productId}): ${error.csvSku} → ${correctedSku}, quantity added: ${error.quantity}`,
      productId: error.productId,
      itemName: error.name,
      sku: correctedSku,
      location: correctedSku,
    });
  }

  async deleteSkuError(id: string): Promise<void> {
    await db.delete(skuErrors).where(eq(skuErrors.id, id));
  }

  // Warehouse Settings methods
  async getAllWarehouseSettings(): Promise<WarehouseSetting[]> {
    return await db.select().from(warehouseSettings).orderBy(warehouseSettings.locationPattern);
  }

  async getWarehouseSetting(locationPattern: string): Promise<WarehouseSetting | undefined> {
    const result = await db
      .select()
      .from(warehouseSettings)
      .where(eq(warehouseSettings.locationPattern, locationPattern))
      .limit(1);
    return result[0];
  }

  async upsertWarehouseSetting(setting: InsertWarehouseSetting): Promise<WarehouseSetting> {
    const existing = await this.getWarehouseSetting(setting.locationPattern);
    
    if (existing) {
      // Update existing
      const result = await db
        .update(warehouseSettings)
        .set({ tsku: setting.tsku, maxq: setting.maxq, updatedAt: new Date() })
        .where(eq(warehouseSettings.locationPattern, setting.locationPattern))
        .returning();
      return result[0];
    } else {
      // Insert new
      const result = await db.insert(warehouseSettings).values(setting).returning();
      return result[0];
    }
  }

  async deleteWarehouseSetting(locationPattern: string): Promise<void> {
    await db.delete(warehouseSettings).where(eq(warehouseSettings.locationPattern, locationPattern));
  }

  // Active Locations methods
  async getAllActiveLocations(): Promise<ActiveLocation[]> {
    return await db
      .select()
      .from(activeLocations)
      .where(eq(activeLocations.isActive, true))
      .orderBy(activeLocations.location);
  }

  async setActiveLocations(locations: string[]): Promise<void> {
    // Clear all existing active locations
    await db.delete(activeLocations);

    // Insert new active locations
    if (locations.length > 0) {
      const values = locations.map(loc => ({
        location: loc.toUpperCase(),
        isActive: true,
      }));
      await db.insert(activeLocations).values(values);
    }
  }

  async clearActiveLocations(): Promise<void> {
    await db.delete(activeLocations);
  }
}

export const storage = new DbStorage();
