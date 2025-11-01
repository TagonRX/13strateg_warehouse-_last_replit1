import { db } from "./db";
import { 
  users, 
  inventoryItems, 
  eventLogs,
  workerAnalytics,
  pickingLists,
  pickingTasks,
  skuErrors,
  warehouseSettings,
  activeLocations,
  csvSources,
  globalSettings,
  pendingTests,
  testedItems,
  faultyStock,
  pendingPlacements,
  csvImportSessions,
  orders,
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
  type InsertActiveLocation,
  type CsvSource,
  type InsertCsvSource,
  type GlobalSetting,
  type InsertGlobalSetting,
  type PendingTest,
  type InsertPendingTest,
  type TestedItem,
  type InsertTestedItem,
  type FaultyStock,
  type InsertFaultyStock,
  type PendingPlacement,
  type InsertPendingPlacement,
  type CsvImportSession,
  type InsertCsvImportSession,
  type Order,
  type InsertOrder
} from "@shared/schema";
import { eq, and, or, sql, inArray, ilike, getTableColumns } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByLogin(login: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<void>;
  updateUserPassword(id: string, hashedPassword: string): Promise<void>;
  updateUserName(id: string, name: string): Promise<User>;
  updateUserLogin(id: string, login: string): Promise<User>;

  // Inventory methods
  getAllInventoryItems(): Promise<(InventoryItem & { condition?: string | null })[]>;
  getInventoryItemById(id: string): Promise<InventoryItem | undefined>;
  getInventoryItemByProductId(productId: string): Promise<InventoryItem | undefined>;
  createInventoryItem(item: InsertInventoryItem): Promise<InventoryItem>;
  updateInventoryItem(productId: string, updates: Partial<InsertInventoryItem>): Promise<InventoryItem>;
  updateInventoryItemById(id: string, updates: Partial<InsertInventoryItem>): Promise<InventoryItem>;
  deleteInventoryItem(id: string, userId: string): Promise<boolean>;
  bulkUpsertInventoryItems(items: InsertInventoryItem[]): Promise<{ success: number; updated: number; errors: number }>;
  updateItemCondition(itemId: string, condition: string, userId: string): Promise<void>;
  getConditionByBarcode(barcode: string): Promise<string | null>;
  
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
    stockInCost: number;
    stockOut: number;
    stockOutCost: number;
    csvUpload: number;
    pickingListCreated: number;
    itemPicked: number;
    itemsPacked: number;
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
  setActiveLocations(locations: { location: string; barcode?: string }[]): Promise<void>;
  updateLocationBarcode(location: string, barcode: string | null): Promise<ActiveLocation>;
  clearActiveLocations(): Promise<void>;

  // Picking List methods
  createPickingList(data: { name: string; userId: string; tasks: { sku: string; itemName?: string; requiredQuantity: number }[] }): Promise<{ list: PickingList; tasks: PickingTask[] }>;
  getAllPickingLists(): Promise<PickingList[]>;
  getPickingListWithTasks(listId: string): Promise<{ list: PickingList; tasks: PickingTask[] } | null>;
  scanBarcodeForPickingTask(barcode: string, taskId: string, userId: string): Promise<{
    success: boolean;
    message: string;
    item?: InventoryItem;
    task?: PickingTask;
  }>;
  manualCollectForPickingTask(taskId: string, userId: string): Promise<{
    success: boolean;
    message: string;
    task?: PickingTask;
  }>;
  deletePickingList(listId: string, userId: string): Promise<boolean>;

  // CSV Sources methods
  getAllCsvSources(): Promise<CsvSource[]>;
  createCsvSource(source: InsertCsvSource): Promise<CsvSource>;
  updateCsvSource(id: string, updates: Partial<InsertCsvSource>): Promise<CsvSource>;
  deleteCsvSource(id: string): Promise<void>;

  // Global Settings methods
  getGlobalSetting(key: string): Promise<GlobalSetting | undefined>;
  upsertGlobalSetting(key: string, value: string): Promise<GlobalSetting>;

  // Product Testing methods
  startProductTest(test: InsertPendingTest): Promise<PendingTest>;
  getPendingTestByBarcode(barcode: string): Promise<PendingTest | undefined>;
  getAllPendingTests(): Promise<PendingTest[]>;
  completePendingTest(barcode: string, condition: string, decisionBy: string, workingMinutes: number): Promise<TestedItem | FaultyStock>;
  removePendingTestByBarcode(barcode: string): Promise<void>;
  deletePendingTest(id: string): Promise<void>;
  
  // Tested Items methods
  getAllTestedItems(): Promise<TestedItem[]>;
  deleteTestedItem(id: string): Promise<void>;
  
  // Faulty Stock methods
  getAllFaultyStock(): Promise<FaultyStock[]>;
  getFaultyStockByBarcode(barcode: string): Promise<FaultyStock | undefined>;
  deleteFaultyStockItem(id: string): Promise<void>;
  deleteAllFaultyStock(condition: string): Promise<number>;
  
  // Pending Placements methods
  createPendingPlacement(placement: InsertPendingPlacement): Promise<PendingPlacement>;
  getAllPendingPlacements(): Promise<PendingPlacement[]>;
  deletePendingPlacement(id: string): Promise<void>;
  getPendingPlacementByBarcode(barcode: string): Promise<PendingPlacement | undefined>;
  confirmPlacement(placementId: string, location: string, userId: string): Promise<InventoryItem>;

  // CSV Import methods
  createCsvImportSession(session: InsertCsvImportSession): Promise<CsvImportSession>;
  getCsvImportSession(id: string): Promise<CsvImportSession | undefined>;
  updateCsvImportSession(id: string, updates: Partial<InsertCsvImportSession>): Promise<CsvImportSession>;
  getAllCsvImportSessions(userId?: string): Promise<CsvImportSession[]>;
  bulkUpdateInventoryFromCsv(items: InsertInventoryItem[], userId: string): Promise<{ success: number; updated: number }>;

  // Order methods
  createOrder(order: InsertOrder): Promise<Order>;
  getOrders(filters?: { status?: string }): Promise<Order[]>;
  getOrderById(id: string): Promise<Order | null>;
  updateOrderStatus(id: string, status: string, userId: string): Promise<Order>;
  updateShippingLabel(id: string, label: string): Promise<Order>;
  updateDispatchData(id: string, barcodes: string[], userId: string): Promise<Order>;
  updatePackingData(id: string, userId: string): Promise<Order>;
  findOrdersBySku(sku: string, status?: string): Promise<Order[]>;
  findOrderByBarcode(barcode: string, status?: string): Promise<Order | null>;
}

export class DbStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByLogin(login: string): Promise<User | undefined> {
    // Case-insensitive login search (LOWER for PostgreSQL)
    const result = await db.select().from(users).where(sql`LOWER(${users.login}) = LOWER(${login})`).limit(1);
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
    // Delete all related records first to avoid foreign key constraint violations
    // 1. Delete event logs
    await db.delete(eventLogs).where(eq(eventLogs.userId, id));
    
    // 2. Delete worker analytics
    await db.delete(workerAnalytics).where(eq(workerAnalytics.userId, id));
    
    // 3. Set createdBy to null in inventory items
    await db.update(inventoryItems).set({ createdBy: null }).where(eq(inventoryItems.createdBy, id));
    
    // 4. Set createdBy to null in picking lists
    await db.update(pickingLists).set({ createdBy: null }).where(eq(pickingLists.createdBy, id));
    
    // 5. Delete pending tests where user is firstScanBy
    await db.delete(pendingTests).where(eq(pendingTests.firstScanBy, id));
    
    // 6. Delete tested items where user is firstScanBy or decisionBy
    await db.delete(testedItems).where(
      or(
        eq(testedItems.firstScanBy, id),
        eq(testedItems.decisionBy, id)
      )
    );
    
    // 7. Delete faulty stock where user is firstScanBy or decisionBy
    await db.delete(faultyStock).where(
      or(
        eq(faultyStock.firstScanBy, id),
        eq(faultyStock.decisionBy, id)
      )
    );
    
    // 8. Delete pending placements where user is stockInBy
    await db.delete(pendingPlacements).where(eq(pendingPlacements.stockInBy, id));
    
    // 9. Finally, delete the user
    await db.delete(users).where(eq(users.id, id));
  }

  async updateUserPassword(id: string, hashedPassword: string): Promise<void> {
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, id));
  }

  async updateUserName(id: string, name: string): Promise<User> {
    const result = await db.update(users).set({ name }).where(eq(users.id, id)).returning();
    return result[0];
  }

  async updateUserLogin(id: string, login: string): Promise<User> {
    const result = await db.update(users).set({ login }).where(eq(users.id, id)).returning();
    return result[0];
  }

  // Inventory methods
  async getAllInventoryItems(): Promise<(InventoryItem & { condition?: string | null })[]> {
    const items = await db
      .select({
        ...getTableColumns(inventoryItems),
        condition: sql<string | null>`COALESCE(${inventoryItems.condition}, ${testedItems.condition}, ${faultyStock.condition})`.as('condition'),
      })
      .from(inventoryItems)
      .leftJoin(testedItems, eq(inventoryItems.barcode, testedItems.barcode))
      .leftJoin(faultyStock, eq(inventoryItems.barcode, faultyStock.barcode))
      .orderBy(inventoryItems.createdAt);
    
    return items as (InventoryItem & { condition?: string | null })[];
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

  // Natural sort for locations (e.g., X1, X2...X10, X11...X100, X101...)
  private naturalSortLocations(a: string, b: string): number {
    // Extract letter prefix and numeric part
    const matchA = a.match(/^([A-Z]+)(\d+)$/i);
    const matchB = b.match(/^([A-Z]+)(\d+)$/i);

    // If both match the pattern (letter + number)
    if (matchA && matchB) {
      const letterA = matchA[1].toUpperCase();
      const letterB = matchB[1].toUpperCase();
      const numA = parseInt(matchA[2], 10);
      const numB = parseInt(matchB[2], 10);

      // First compare letters
      if (letterA !== letterB) {
        return letterA.localeCompare(letterB);
      }
      // Then compare numbers numerically
      return numA - numB;
    }

    // Fallback to alphabetical sort for non-standard formats
    return a.localeCompare(b);
  }

  // Warehouse loading analysis
  async getWarehouseLoadingByLocation(): Promise<{
    location: string;
    skuCount: number;
    totalQuantity: number;
    items: { sku: string; name: string; quantity: number; barcode?: string }[];
  }[]> {
    // Get all active locations
    const activeLocationsList = await this.getAllActiveLocations();
    
    // Get all inventory items
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

    // Build result array including all active locations
    const result: {
      location: string;
      skuCount: number;
      totalQuantity: number;
      items: { sku: string; name: string; quantity: number; barcode?: string }[];
    }[] = [];

    // Add all active locations (even if empty)
    for (const activeLoc of activeLocationsList) {
      const locationItems = locationMap.get(activeLoc.location) || [];
      const totalQuantity = locationItems.reduce((sum, item) => sum + item.quantity, 0);
      
      result.push({
        location: activeLoc.location,
        skuCount: locationItems.length,
        totalQuantity,
        items: locationItems.map(item => ({
          id: item.id,
          sku: item.sku,
          name: item.name || "Без названия",
          quantity: item.quantity,
          barcode: item.barcode || undefined,
        })),
      });
    }

    // Add any locations that have items but are not in active locations list
    for (const [location, locationItems] of Array.from(locationMap.entries())) {
      if (!activeLocationsList.some(loc => loc.location === location)) {
        const totalQuantity = locationItems.reduce((sum: number, item: InventoryItem) => sum + item.quantity, 0);
        result.push({
          location,
          skuCount: locationItems.length,
          totalQuantity,
          items: locationItems.map((item: InventoryItem) => ({
            id: item.id,
            sku: item.sku,
            name: item.name || "Без названия",
            quantity: item.quantity,
            barcode: item.barcode || undefined,
          })),
        });
      }
    }

    return result.sort((a, b) => this.naturalSortLocations(a.location, b.location)); // Natural sort by location (X1, X2...X10, X11...)
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
      quantity: 1,
      price: item.price || null,
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

  async updateItemCondition(itemId: string, condition: string, userId: string): Promise<void> {
    // Get the inventory item
    const item = await this.getInventoryItemById(itemId);
    if (!item) {
      throw new Error("Inventory item not found");
    }

    // Get the primary barcode
    let primaryBarcode: string | null = null;
    if (item.barcodeMappings) {
      try {
        const mappings = JSON.parse(item.barcodeMappings);
        if (mappings.length > 0) {
          primaryBarcode = mappings[0].code;
        }
      } catch (e) {
        // If parsing fails, fall back to simple barcode
      }
    }
    
    // Use simple barcode if no mappings
    if (!primaryBarcode && item.barcode) {
      primaryBarcode = item.barcode;
    }

    // If no barcode, store condition directly in inventory_items table
    if (!primaryBarcode) {
      await db
        .update(inventoryItems)
        .set({
          condition: condition || null,
          updatedAt: new Date(),
        })
        .where(eq(inventoryItems.id, itemId));
      return;
    }

    // If condition is empty or "-", remove from both tables
    if (!condition || condition === "" || condition === "-") {
      // Delete from testedItems
      await db.delete(testedItems).where(eq(testedItems.barcode, primaryBarcode));
      
      // Delete from faultyStock
      await db.delete(faultyStock).where(eq(faultyStock.barcode, primaryBarcode));
      
      return;
    }

    // Get existing tested item, pending test, or faulty stock to use timestamps if they exist
    const existingTested = await db
      .select()
      .from(testedItems)
      .where(eq(testedItems.barcode, primaryBarcode))
      .limit(1);
    
    const existingPending = await db
      .select()
      .from(pendingTests)
      .where(eq(pendingTests.barcode, primaryBarcode))
      .limit(1);
    
    const existingFaultyRecord = await db
      .select()
      .from(faultyStock)
      .where(eq(faultyStock.barcode, primaryBarcode))
      .limit(1);
    
    // Calculate working minutes for faulty items (stored as integer minutes in DB)
    // Priority: pendingTests > testedItems > existingFaulty > now
    const firstScanTime = existingPending.length > 0 
      ? existingPending[0].firstScanAt 
      : existingTested.length > 0 
        ? existingTested[0].firstScanAt 
        : existingFaultyRecord.length > 0
          ? existingFaultyRecord[0].firstScanAt
          : new Date();
    
    const workingMillis = new Date().getTime() - firstScanTime.getTime();
    const workingMinutes = Math.round(workingMillis / (1000 * 60)); // Convert to integer minutes

    // Handle different conditions
    if (condition === "New" || condition === "Used" || condition === "Exdisplay") {
      // Insert/update in testedItems only
      const existingTestedItem = await db
        .select()
        .from(testedItems)
        .where(eq(testedItems.barcode, primaryBarcode))
        .limit(1);

      if (existingTestedItem.length > 0) {
        // Update existing
        await db
          .update(testedItems)
          .set({
            condition,
            decisionBy: userId,
            decisionAt: new Date(),
          })
          .where(eq(testedItems.barcode, primaryBarcode));
      } else {
        // Insert new - use first scan data with priority chain
        const firstScanAt = existingPending.length > 0 
          ? existingPending[0].firstScanAt 
          : existingFaultyRecord.length > 0
            ? existingFaultyRecord[0].firstScanAt
            : new Date();
        const firstScanBy = existingPending.length > 0 
          ? existingPending[0].firstScanBy 
          : existingFaultyRecord.length > 0
            ? existingFaultyRecord[0].firstScanBy
            : userId;
        
        await db.insert(testedItems).values({
          barcode: primaryBarcode,
          productId: item.productId || null,
          name: item.name || null,
          sku: item.sku,
          condition,
          firstScanAt,
          firstScanBy,
          decisionBy: userId,
          decisionAt: new Date(),
        });
      }

      // Remove from faultyStock and pendingTests if exists
      await db.delete(faultyStock).where(eq(faultyStock.barcode, primaryBarcode));
      await db.delete(pendingTests).where(eq(pendingTests.barcode, primaryBarcode));
      
    } else if (condition === "Faulty") {
      // Insert/update in faultyStock only
      const existingFaulty = await db
        .select()
        .from(faultyStock)
        .where(eq(faultyStock.barcode, primaryBarcode))
        .limit(1);

      if (existingFaulty.length > 0) {
        // Update existing
        await db
          .update(faultyStock)
          .set({
            condition,
            workingHours: workingMinutes,
            decisionBy: userId,
            decisionAt: new Date(),
          })
          .where(eq(faultyStock.barcode, primaryBarcode));
      } else {
        // Insert new - use first scan data with priority chain
        const firstScanAt = existingPending.length > 0 
          ? existingPending[0].firstScanAt 
          : existingTested.length > 0
            ? existingTested[0].firstScanAt
            : new Date();
        const firstScanBy = existingPending.length > 0 
          ? existingPending[0].firstScanBy 
          : existingTested.length > 0
            ? existingTested[0].firstScanBy
            : userId;
        
        await db.insert(faultyStock).values({
          barcode: primaryBarcode,
          productId: item.productId || null,
          name: item.name || null,
          sku: item.sku,
          condition,
          workingHours: workingMinutes,
          firstScanAt,
          firstScanBy,
          decisionBy: userId,
          decisionAt: new Date(),
        });
      }

      // Remove from testedItems and pendingTests if exists
      await db.delete(testedItems).where(eq(testedItems.barcode, primaryBarcode));
      await db.delete(pendingTests).where(eq(pendingTests.barcode, primaryBarcode));
      
    } else if (condition === "Parts") {
      // Insert/update in BOTH testedItems AND faultyStock
      
      // Get first scan data with priority chain
      const firstScanAt = existingPending.length > 0 
        ? existingPending[0].firstScanAt 
        : existingTested.length > 0
          ? existingTested[0].firstScanAt
          : existingFaultyRecord.length > 0
            ? existingFaultyRecord[0].firstScanAt
            : new Date();
      const firstScanBy = existingPending.length > 0 
        ? existingPending[0].firstScanBy 
        : existingTested.length > 0
          ? existingTested[0].firstScanBy
          : existingFaultyRecord.length > 0
            ? existingFaultyRecord[0].firstScanBy
            : userId;
      
      // Update/insert testedItems
      const existingTestedItem = await db
        .select()
        .from(testedItems)
        .where(eq(testedItems.barcode, primaryBarcode))
        .limit(1);

      if (existingTestedItem.length > 0) {
        await db
          .update(testedItems)
          .set({
            condition,
            decisionBy: userId,
            decisionAt: new Date(),
          })
          .where(eq(testedItems.barcode, primaryBarcode));
      } else {
        await db.insert(testedItems).values({
          barcode: primaryBarcode,
          productId: item.productId || null,
          name: item.name || null,
          sku: item.sku,
          condition,
          firstScanAt,
          firstScanBy,
          decisionBy: userId,
          decisionAt: new Date(),
        });
      }

      // Update/insert faultyStock
      const existingFaulty = await db
        .select()
        .from(faultyStock)
        .where(eq(faultyStock.barcode, primaryBarcode))
        .limit(1);

      if (existingFaulty.length > 0) {
        await db
          .update(faultyStock)
          .set({
            condition,
            workingHours: workingMinutes,
            decisionBy: userId,
            decisionAt: new Date(),
          })
          .where(eq(faultyStock.barcode, primaryBarcode));
      } else {
        await db.insert(faultyStock).values({
          barcode: primaryBarcode,
          productId: item.productId || null,
          name: item.name || null,
          sku: item.sku,
          condition,
          workingHours: workingMinutes,
          firstScanAt,
          firstScanBy,
          decisionBy: userId,
          decisionAt: new Date(),
        });
      }
      
      // Remove from pendingTests if exists
      await db.delete(pendingTests).where(eq(pendingTests.barcode, primaryBarcode));
    }
  }

  async getConditionByBarcode(barcode: string): Promise<string | null> {
    // Check tested_items first
    const testedResult = await db
      .select({ condition: testedItems.condition })
      .from(testedItems)
      .where(eq(testedItems.barcode, barcode))
      .limit(1);
    
    if (testedResult.length > 0 && testedResult[0].condition) {
      return testedResult[0].condition;
    }

    // Check faulty_stock
    const faultyResult = await db
      .select({ condition: faultyStock.condition })
      .from(faultyStock)
      .where(eq(faultyStock.barcode, barcode))
      .limit(1);
    
    if (faultyResult.length > 0 && faultyResult[0].condition) {
      return faultyResult[0].condition;
    }

    return null;
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
  async createPickingList(data: { name: string; userId: string; tasks: { sku: string; itemName?: string; requiredQuantity: number }[] }): Promise<{ list: PickingList; tasks: PickingTask[] }> {
    // Create the picking list
    const [list] = await db.insert(pickingLists).values({
      name: data.name,
      createdBy: data.userId,
      status: "PENDING",
    }).returning();

    // Get all inventory items to lookup names if needed
    const allInventoryItems = await db.select().from(inventoryItems);
    const skuToNameMap = new Map<string, string>();
    
    for (const item of allInventoryItems) {
      if (!skuToNameMap.has(item.sku) && item.name) {
        skuToNameMap.set(item.sku, item.name);
      }
    }

    // Create tasks for the picking list with item names
    const tasks = await db.insert(pickingTasks).values(
      data.tasks.map(task => {
        let itemName: string | null;
        let itemNameSource: string | null;

        if (task.itemName) {
          // Name provided from CSV file
          itemName = task.itemName;
          itemNameSource = 'file';
        } else if (skuToNameMap.has(task.sku)) {
          // Name found in inventory
          itemName = skuToNameMap.get(task.sku) || null;
          itemNameSource = 'inventory';
        } else {
          // No name available
          itemName = null;
          itemNameSource = null;
        }

        return {
          listId: list.id,
          sku: task.sku,
          itemName,
          itemNameSource,
          requiredQuantity: task.requiredQuantity,
          pickedQuantity: 0,
          status: "PENDING",
        };
      })
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
      quantity: 1,
      price: item.price || null,
    });

    return { 
      success: true, 
      message: `Item picked successfully! Progress: ${newPickedQuantity}/${task.requiredQuantity}`,
      item,
      task: updatedTask
    };
  }

  async manualCollectForPickingTask(taskId: string, userId: string): Promise<{
    success: boolean;
    message: string;
    task?: PickingTask;
  }> {
    // Get the task
    const [task] = await db.select().from(pickingTasks).where(eq(pickingTasks.id, taskId));
    if (!task) {
      return { success: false, message: "Task not found" };
    }

    // Check if task is already complete
    if (task.pickedQuantity >= task.requiredQuantity) {
      return { success: false, message: "Task already completed" };
    }

    // Find an item with matching SKU to decrease quantity
    const [item] = await db.select().from(inventoryItems)
      .where(eq(inventoryItems.sku, task.sku))
      .limit(1);

    if (item) {
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

      // Update task progress with item ID
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

      // Log the event with MANUAL action type
      await this.createEventLog({
        userId,
        action: "PICK_ITEM_MANUAL",
        details: `Manually collected ${item.name || task.itemName} (${item.sku}) for picking list task`,
        productId: item.productId || null,
        itemName: item.name || task.itemName || null,
        sku: item.sku,
        location: item.location,
        quantity: 1,
        price: item.price || null,
      });

      return { 
        success: true, 
        message: `Товар собран вручную! Прогресс: ${newPickedQuantity}/${task.requiredQuantity}`,
        task: updatedTask
      };
    } else {
      // No item found in inventory with matching SKU
      // Still increment the task progress (manual collection without inventory tracking)
      const newPickedQuantity = task.pickedQuantity + 1;
      const isCompleted = newPickedQuantity >= task.requiredQuantity;

      const [updatedTask] = await db.update(pickingTasks)
        .set({
          pickedQuantity: newPickedQuantity,
          status: isCompleted ? "COMPLETED" : "PENDING",
          completedAt: isCompleted ? new Date() : null,
        })
        .where(eq(pickingTasks.id, taskId))
        .returning();

      // Log the event with MANUAL action type (no item in inventory)
      await this.createEventLog({
        userId,
        action: "PICK_ITEM_MANUAL_NO_INVENTORY",
        details: `Manually collected ${task.itemName || task.sku} (not in inventory) for picking list task`,
        sku: task.sku,
        itemName: task.itemName || null,
        location: null,
        quantity: 1,
        price: null,
      });

      return { 
        success: true, 
        message: `Товар собран вручную (нет в инвентаре)! Прогресс: ${newPickedQuantity}/${task.requiredQuantity}`,
        task: updatedTask
      };
    }
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
    stockInCost: number;
    stockOut: number;
    stockOutCost: number;
    csvUpload: number;
    pickingListCreated: number;
    itemPicked: number;
    itemsPacked: number;
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

    // Get all users (both workers and admins)
    const allUsers = await db.select().from(users);
    
    // Get event logs for the period
    const logs = await db.select().from(eventLogs).where(dateFilter);

    // Group by user and count actions
    const analytics = allUsers.map(user => {
      const userLogs = logs.filter(log => log.userId === user.id);
      
      // Calculate total cost for STOCK_IN and STOCK_OUT
      const stockInLogs = userLogs.filter(log => log.action === 'STOCK_IN' || log.action === 'STOCK_IN_UPDATE');
      const stockOutLogs = userLogs.filter(log => log.action === 'STOCK_OUT');
      
      const stockInCost = stockInLogs.reduce((sum, log) => {
        const quantity = log.quantity || 0;
        const price = log.price || 0;
        return sum + (quantity * price);
      }, 0);
      
      const stockOutCost = stockOutLogs.reduce((sum, log) => {
        const quantity = log.quantity || 0;
        const price = log.price || 0;
        return sum + (quantity * price);
      }, 0);
      
      return {
        userId: user.id,
        userName: user.name,
        login: userLogs.filter(log => log.action === 'LOGIN').length,
        stockIn: userLogs.filter(log => log.action === 'STOCK_IN' || log.action === 'STOCK_IN_UPDATE').length,
        stockInCost,
        stockOut: userLogs.filter(log => log.action === 'STOCK_OUT').length,
        stockOutCost,
        csvUpload: userLogs.filter(log => log.action === 'CSV_UPLOAD').length,
        pickingListCreated: userLogs.filter(log => log.action === 'PICKING_LIST_CREATED').length,
        itemPicked: userLogs.filter(log => log.action === 'PICK_ITEM' || log.action === 'ITEM_PICKED' || log.action === 'PICK_ITEM_MANUAL' || log.action === 'PICK_ITEM_MANUAL_NO_INVENTORY').length,
        itemsPacked: userLogs.filter(log => log.action === 'ORDER_PACKED').length,
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

  async setActiveLocations(locations: { location: string; barcode?: string }[]): Promise<void> {
    // Clear all existing active locations
    await db.delete(activeLocations);

    // Insert new active locations
    if (locations.length > 0) {
      const values = locations.map(loc => ({
        location: loc.location.toUpperCase(),
        barcode: loc.barcode || null,
        isActive: true,
      }));
      await db.insert(activeLocations).values(values);
    }
  }

  async updateLocationBarcode(location: string, barcode: string | null): Promise<ActiveLocation> {
    const result = await db
      .update(activeLocations)
      .set({ barcode, updatedAt: new Date() })
      .where(eq(activeLocations.location, location.toUpperCase()))
      .returning();
    return result[0];
  }

  async clearActiveLocations(): Promise<void> {
    await db.delete(activeLocations);
  }

  // CSV Sources methods
  async getAllCsvSources(): Promise<CsvSource[]> {
    return await db.select().from(csvSources).orderBy(csvSources.sortOrder, csvSources.createdAt);
  }

  async createCsvSource(source: InsertCsvSource): Promise<CsvSource> {
    const result = await db.insert(csvSources).values(source).returning();
    return result[0];
  }

  async updateCsvSource(id: string, updates: Partial<InsertCsvSource>): Promise<CsvSource> {
    const result = await db
      .update(csvSources)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(csvSources.id, id))
      .returning();
    return result[0];
  }

  async deleteCsvSource(id: string): Promise<void> {
    await db.delete(csvSources).where(eq(csvSources.id, id));
  }

  // Global Settings methods
  async getGlobalSetting(key: string): Promise<GlobalSetting | undefined> {
    const result = await db.select().from(globalSettings).where(eq(globalSettings.key, key)).limit(1);
    return result[0];
  }

  async upsertGlobalSetting(key: string, value: string): Promise<GlobalSetting> {
    const existing = await this.getGlobalSetting(key);
    if (existing) {
      const result = await db
        .update(globalSettings)
        .set({ value, updatedAt: new Date() })
        .where(eq(globalSettings.key, key))
        .returning();
      return result[0];
    } else {
      const result = await db.insert(globalSettings).values({ key, value }).returning();
      return result[0];
    }
  }

  // Product Testing methods
  async startProductTest(test: InsertPendingTest): Promise<PendingTest> {
    const result = await db.insert(pendingTests).values(test).returning();
    return result[0];
  }

  async getPendingTestByBarcode(barcode: string): Promise<PendingTest | undefined> {
    const result = await db
      .select()
      .from(pendingTests)
      .where(eq(pendingTests.barcode, barcode))
      .limit(1);
    return result[0];
  }

  async getAllPendingTests(): Promise<PendingTest[]> {
    return await db.select().from(pendingTests).orderBy(pendingTests.firstScanAt);
  }

  async completePendingTest(
    barcode: string, 
    condition: string, 
    decisionBy: string, 
    workingMinutes: number
  ): Promise<TestedItem | FaultyStock> {
    // Get pending test
    const pending = await this.getPendingTestByBarcode(barcode);
    if (!pending) {
      throw new Error("Pending test not found");
    }

    if (condition === "Faulty" || condition === "Parts") {
      // Add to faulty stock (both Faulty and Parts)
      const result = await db.insert(faultyStock).values({
        barcode: pending.barcode,
        sku: pending.sku,
        productId: pending.productId,
        name: pending.name,
        condition,
        firstScanAt: pending.firstScanAt,
        firstScanBy: pending.firstScanBy,
        decisionBy,
        workingHours: workingMinutes,
      }).returning();

      // Remove from pending tests
      await db.delete(pendingTests).where(eq(pendingTests.barcode, barcode));

      return result[0];
    } else {
      // Add to tested items (Used, Exdisplay, New)
      const result = await db.insert(testedItems).values({
        barcode: pending.barcode,
        sku: pending.sku,
        productId: pending.productId,
        name: pending.name,
        condition,
        firstScanAt: pending.firstScanAt,
        firstScanBy: pending.firstScanBy,
        decisionBy,
      }).returning();

      // Remove from pending tests
      await db.delete(pendingTests).where(eq(pendingTests.barcode, barcode));

      return result[0];
    }
  }

  async removePendingTestByBarcode(barcode: string): Promise<void> {
    // This is called when item is stocked in or verified
    // Should remove from tested_items (completed tests) but NOT from pending_tests
    // If item is still in pending_tests, it shouldn't be placed - caller should check first
    await db.delete(testedItems).where(eq(testedItems.barcode, barcode));
  }

  async deletePendingTest(id: string): Promise<void> {
    // Admin-only delete: removes pending test by ID
    await db.delete(pendingTests).where(eq(pendingTests.id, id));
  }

  // Tested Items methods
  async getAllTestedItems(): Promise<TestedItem[]> {
    return await db.select().from(testedItems).orderBy(testedItems.decisionAt);
  }

  async deleteTestedItem(id: string): Promise<void> {
    // Admin-only delete: removes tested item by ID
    await db.delete(testedItems).where(eq(testedItems.id, id));
  }

  // Faulty Stock methods
  async getAllFaultyStock(): Promise<FaultyStock[]> {
    return await db.select().from(faultyStock).orderBy(faultyStock.decisionAt);
  }

  async getFaultyStockByBarcode(barcode: string): Promise<FaultyStock | undefined> {
    const result = await db.select().from(faultyStock).where(eq(faultyStock.barcode, barcode)).limit(1);
    return result[0];
  }

  async deleteFaultyStockItem(id: string): Promise<void> {
    await db.delete(faultyStock).where(eq(faultyStock.id, id));
  }

  async deleteAllFaultyStock(condition: string): Promise<number> {
    const items = await db.select().from(faultyStock).where(eq(faultyStock.condition, condition));
    const count = items.length;
    
    if (count > 0) {
      await db.delete(faultyStock).where(eq(faultyStock.condition, condition));
    }
    
    return count;
  }

  // Pending Placements methods
  async createPendingPlacement(placement: InsertPendingPlacement): Promise<PendingPlacement> {
    const result = await db.insert(pendingPlacements).values(placement).returning();
    return result[0];
  }

  async getAllPendingPlacements(): Promise<PendingPlacement[]> {
    return await db.select().from(pendingPlacements).orderBy(pendingPlacements.stockInAt);
  }

  async deletePendingPlacement(id: string): Promise<void> {
    await db.delete(pendingPlacements).where(eq(pendingPlacements.id, id));
  }

  async getPendingPlacementByBarcode(barcode: string): Promise<PendingPlacement | undefined> {
    const result = await db.select().from(pendingPlacements).where(eq(pendingPlacements.barcode, barcode)).limit(1);
    return result[0];
  }

  async confirmPlacement(placementId: string, location: string, userId: string): Promise<InventoryItem> {
    // Get the pending placement
    const placement = await db.select().from(pendingPlacements).where(eq(pendingPlacements.id, placementId)).limit(1);
    if (!placement || placement.length === 0) {
      throw new Error("Placement not found");
    }

    const p = placement[0];

    // Check if item with same productId already exists in inventory
    let inventoryItem: InventoryItem;
    
    if (p.productId) {
      const existing = await db.select().from(inventoryItems).where(eq(inventoryItems.productId, p.productId)).limit(1);
      
      if (existing && existing.length > 0) {
        // Update existing item - add quantity
        const updated = await db.update(inventoryItems)
          .set({
            quantity: existing[0].quantity + (p.quantity || 1),
            location,
            sku: p.sku,
            barcode: p.barcode,
            condition: p.condition,
          })
          .where(eq(inventoryItems.productId, p.productId))
          .returning();
        
        inventoryItem = updated[0];

        // Log stock-in update event
        await db.insert(eventLogs).values({
          userId,
          action: "STOCK_IN_UPDATE",
          details: `Updated ${p.name || p.productId} (${p.productId}): +${p.quantity || 1}`,
          productId: p.productId,
          itemName: p.name,
          sku: p.sku,
          location,
          quantity: p.quantity || 1,
          price: p.price,
        });
      } else {
        // Create new inventory item
        const created = await db.insert(inventoryItems).values({
          productId: p.productId,
          name: p.name,
          sku: p.sku,
          location,
          quantity: p.quantity || 1,
          barcode: p.barcode,
          condition: p.condition,
          price: p.price,
          length: p.length,
          width: p.width,
          height: p.height,
          volume: p.volume,
          weight: p.weight,
          createdBy: p.stockInBy,
        }).returning();

        inventoryItem = created[0];

        // Log stock-in event
        await db.insert(eventLogs).values({
          userId,
          action: "PLACEMENT",
          details: `Размещено: ${p.name || p.productId} → ${location}`,
          productId: p.productId,
          itemName: p.name,
          sku: p.sku,
          location,
          quantity: p.quantity || 1,
          price: p.price,
        });
      }
    } else {
      // No productId - create new inventory item
      const created = await db.insert(inventoryItems).values({
        productId: p.barcode, // Use barcode as productId if no productId
        name: p.name,
        sku: p.sku,
        location,
        quantity: p.quantity || 1,
        barcode: p.barcode,
        condition: p.condition,
        price: p.price,
        length: p.length,
        width: p.width,
        height: p.height,
        volume: p.volume,
        weight: p.weight,
        createdBy: p.stockInBy,
      }).returning();

      inventoryItem = created[0];

      // Log stock-in event
      await db.insert(eventLogs).values({
        userId,
        action: "PLACEMENT",
        details: `Размещено: ${p.name || p.barcode} → ${location}`,
        productId: p.barcode,
        itemName: p.name,
        sku: p.sku,
        location,
        quantity: p.quantity || 1,
        price: p.price,
      });
    }

    // Delete the pending placement
    await db.delete(pendingPlacements).where(eq(pendingPlacements.id, placementId));

    // Remove from tested items if exists
    try {
      await db.delete(testedItems).where(eq(testedItems.barcode, p.barcode));
    } catch (error) {
      // Silently ignore if not found
    }

    return inventoryItem;
  }

  // CSV Import methods
  async createCsvImportSession(session: InsertCsvImportSession): Promise<CsvImportSession> {
    const result = await db.insert(csvImportSessions).values(session).returning();
    return result[0];
  }

  async getCsvImportSession(id: string): Promise<CsvImportSession | undefined> {
    const result = await db.select().from(csvImportSessions).where(eq(csvImportSessions.id, id)).limit(1);
    return result[0];
  }

  async updateCsvImportSession(id: string, updates: Partial<InsertCsvImportSession>): Promise<CsvImportSession> {
    const result = await db.update(csvImportSessions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(csvImportSessions.id, id))
      .returning();
    return result[0];
  }

  async getAllCsvImportSessions(userId?: string): Promise<CsvImportSession[]> {
    if (userId) {
      return await db.select().from(csvImportSessions)
        .where(eq(csvImportSessions.createdBy, userId))
        .orderBy(csvImportSessions.createdAt);
    }
    return await db.select().from(csvImportSessions).orderBy(csvImportSessions.createdAt);
  }

  async bulkUpdateInventoryFromCsv(items: InsertInventoryItem[], userId: string): Promise<{ success: number; updated: number }> {
    let success = 0;
    let updated = 0;

    for (const item of items) {
      try {
        const existing = await this.getInventoryItemByProductId(item.productId!);
        
        if (existing) {
          // Update existing item with CSV data
          // imageUrls is expected to be an array, stringify it for storage
          const imageUrlsJson = item.imageUrls 
            ? (Array.isArray(item.imageUrls) ? JSON.stringify(item.imageUrls) : item.imageUrls)
            : null;
          
          // Build updates object - only include fields that are present
          const updates: any = {};
          if (item.name !== undefined) updates.name = item.name;
          if (item.itemId !== undefined) updates.itemId = item.itemId;
          if (item.ebayUrl !== undefined) updates.ebayUrl = item.ebayUrl;
          if (imageUrlsJson !== null) updates.imageUrls = imageUrlsJson;
          if (item.quantity !== undefined) updates.quantity = item.quantity;
          
          // Include dimension fields only if they are present in the item
          if (item.weight !== undefined) updates.weight = item.weight;
          if (item.width !== undefined) updates.width = item.width;
          if (item.height !== undefined) updates.height = item.height;
          if (item.length !== undefined) updates.length = item.length;
          
          await this.updateInventoryItem(item.productId!, updates);
          updated++;
        } else {
          // This would be unusual - CSV import should only update existing inventory
          // But we can handle it if needed
          const imageUrlsJson = item.imageUrls 
            ? (Array.isArray(item.imageUrls) ? JSON.stringify(item.imageUrls) : item.imageUrls)
            : null;
          
          await this.createInventoryItem({ 
            ...item, 
            imageUrls: imageUrlsJson,
            createdBy: userId 
          });
          success++;
        }
      } catch (error) {
        console.error(`Failed to update item ${item.productId}:`, error);
      }
    }

    return { success, updated };
  }

  // Order methods
  async createOrder(order: InsertOrder): Promise<Order> {
    const result = await db.insert(orders).values(order).returning();
    return result[0];
  }

  async getOrders(filters?: { status?: string }): Promise<Order[]> {
    if (filters?.status) {
      return await db.select().from(orders)
        .where(eq(orders.status, filters.status))
        .orderBy(orders.createdAt);
    }
    return await db.select().from(orders).orderBy(orders.createdAt);
  }

  async getOrderById(id: string): Promise<Order | null> {
    const result = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    return result[0] || null;
  }

  async updateOrderStatus(id: string, status: string, userId: string): Promise<Order> {
    const updates: any = { 
      status, 
      updatedAt: new Date() 
    };

    if (status === "DISPATCHED") {
      updates.dispatchedBy = userId;
      updates.dispatchedAt = new Date();
    } else if (status === "PACKED") {
      updates.packedBy = userId;
      updates.packedAt = new Date();
    }

    const result = await db.update(orders)
      .set(updates)
      .where(eq(orders.id, id))
      .returning();
    return result[0];
  }

  async updateShippingLabel(id: string, label: string): Promise<Order> {
    const result = await db.update(orders)
      .set({ 
        shippingLabel: label,
        updatedAt: new Date() 
      })
      .where(eq(orders.id, id))
      .returning();
    return result[0];
  }

  async updateDispatchData(id: string, barcodes: string[], userId: string): Promise<Order> {
    const result = await db.update(orders)
      .set({
        dispatchedBarcodes: JSON.stringify(barcodes),
        dispatchedBy: userId,
        dispatchedAt: new Date(),
        status: "DISPATCHED",
        updatedAt: new Date()
      })
      .where(eq(orders.id, id))
      .returning();
    return result[0];
  }

  async updatePackingData(id: string, userId: string): Promise<Order> {
    // Update order status first
    const result = await db.update(orders)
      .set({
        packedBy: userId,
        packedAt: new Date(),
        status: "PACKED",
        updatedAt: new Date()
      })
      .where(eq(orders.id, id))
      .returning();

    const updatedOrder = result[0];
    if (!updatedOrder) {
      throw new Error("Order not found or update failed");
    }

    // Get user info for event log
    const user = await this.getUser(userId);
    const userName = user?.name || 'Unknown';

    // Parse items and barcodes for details - handle both JSON strings and arrays
    let itemsInfo = '';
    let barcodesInfo = '';
    let itemCount = 0;
    
    try {
      // Handle both JSON string and already-parsed array
      const items = updatedOrder.items 
        ? (typeof updatedOrder.items === 'string' ? JSON.parse(updatedOrder.items) : updatedOrder.items)
        : [];
      itemCount = items.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0);
      itemsInfo = items.map((item: any) => 
        `${item.itemName || item.sku} (${item.quantity || 1}шт)`
      ).join(', ');
    } catch (e) {
      console.error('Failed to parse order items:', e);
      itemsInfo = 'Не удалось распарсить товары';
      itemCount = 1; // Default to 1 if we can't count
    }

    try {
      // Handle both JSON string and already-parsed array
      const barcodes = updatedOrder.dispatchedBarcodes
        ? (typeof updatedOrder.dispatchedBarcodes === 'string' ? JSON.parse(updatedOrder.dispatchedBarcodes) : updatedOrder.dispatchedBarcodes)
        : [];
      
      if (Array.isArray(barcodes) && barcodes.length > 0) {
        barcodesInfo = barcodes.slice(0, 5).join(', ');
        if (barcodes.length > 5) {
          barcodesInfo += ` (+${barcodes.length - 5} ещё)`;
        }
      } else {
        barcodesInfo = itemsInfo; // Fallback to items info if no barcodes
      }
    } catch (e) {
      console.error('Failed to parse barcodes:', e);
      barcodesInfo = itemsInfo; // Fallback to items info on error
    }

    // Create event log for packing completion
    await db.insert(eventLogs).values({
      userId,
      action: "ORDER_PACKED",
      details: `Упакован заказ №${updatedOrder.orderNumber} | ${userName} | Товаров: ${itemCount} | Баркоды: ${barcodesInfo}`,
      productId: updatedOrder.orderNumber,
      itemName: updatedOrder.customerName || null,
      sku: updatedOrder.shippingLabel || null,
      quantity: itemCount,
    });

    return updatedOrder;
  }

  async findOrdersBySku(sku: string, status?: string): Promise<Order[]> {
    let query = db.select().from(orders);
    
    if (status) {
      query = query.where(eq(orders.status, status)) as any;
    }
    
    const allOrders = await query;
    
    // Filter orders that have this SKU in their items JSON array
    return allOrders.filter(order => {
      if (!order.items) return false;
      try {
        const items = JSON.parse(order.items);
        return Array.isArray(items) && items.some((item: any) => item.sku === sku);
      } catch {
        return false;
      }
    });
  }

  async findOrderByBarcode(barcode: string, status?: string): Promise<Order | null> {
    let query = db.select().from(orders);
    
    if (status) {
      query = query.where(eq(orders.status, status)) as any;
    }
    
    const allOrders = await query;
    
    // Find first order that has this barcode in their items JSON array
    const found = allOrders.find(order => {
      if (!order.items) return false;
      try {
        const items = JSON.parse(order.items);
        return Array.isArray(items) && items.some((item: any) => item.barcode === barcode);
      } catch {
        return false;
      }
    });
    
    return found || null;
  }
}

export const storage = new DbStorage();
