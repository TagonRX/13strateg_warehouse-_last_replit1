import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertInventoryItemSchema, insertEventLogSchema, insertOrderSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { verifyPassword, hashPassword, createSession, requireAuth, requireAdmin } from "./auth";
import { setupWebSocket } from "./websocket";
import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { promises as dns } from "dns";
import { compareTwoStrings } from 'string-similarity';
import { parse } from 'fast-csv';
import { Readable } from 'stream';

// Helper function to extract location from SKU
// SKU format examples:
// - A101-F → Location: A101 (letter + 1-3 digits)
// - A107Y-E → Location: A107 (letter + 1-3 digits, ignore rest)
// - E501-N → Location: E501 (letter + 1-3 digits)
// - kjkhk → Location: kjkhk (no pattern match, use full SKU)
function extractLocationFromSKU(sku: string): string {
  // Match: single letter followed by 1-3 digits at the start
  const match = sku.match(/^([A-Z]\d{1,3})/i);
  if (match) {
    return match[1].toUpperCase();
  }
  // If no pattern match, return the full SKU as location
  return sku;
}

// Helper: Parse CSV from file buffer
async function parseCsvFile(buffer: Buffer): Promise<any[]> {
  const rows: any[] = [];
  return new Promise((resolve, reject) => {
    Readable.from(buffer)
      .pipe(parse({ headers: true, trim: true }))
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', (error) => reject(error));
  });
}

// Helper: Parse CSV from URL
async function parseCsvFromUrl(url: string): Promise<any[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch CSV: ${response.statusText}`);
  const text = await response.text();
  const rows: any[] = [];
  return new Promise((resolve, reject) => {
    Readable.from(text)
      .pipe(parse({ headers: true, trim: true }))
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', (error) => reject(error));
  });
}

// Helper: Match products by name using similarity
function matchProductsByName(csvName: string, inventoryItems: any[]): { match: any | null; score: number; conflicts: any[] } {
  // Skip if csvName is empty or null
  if (!csvName || csvName.trim() === '') {
    return { match: null, score: 0, conflicts: [] };
  }
  
  let bestMatch = null;
  let bestScore = 0;
  const conflicts: any[] = [];
  
  for (const item of inventoryItems) {
    // Skip items without names
    if (!item.name) {
      continue;
    }
    
    const score = compareTwoStrings(csvName.toLowerCase(), item.name.toLowerCase());
    if (score >= 0.9) {
      if (score > bestScore) {
        if (bestMatch && bestScore >= 0.9) {
          conflicts.push(bestMatch);
        }
        bestMatch = item;
        bestScore = score;
      } else {
        conflicts.push(item);
      }
    }
  }
  
  return { match: bestMatch, score: bestScore, conflicts };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Get current user (check token validity)
  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "Пользователь не найден" });
      }

      return res.json({
        id: user.id,
        name: user.name,
        login: user.login,
        role: user.role,
      });
    } catch (error: any) {
      console.error("Get current user error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Authentication routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { login, password } = req.body;
      
      if (!login || !password) {
        return res.status(400).json({ error: "Требуется логин и пароль" });
      }

      const user = await storage.getUserByLogin(login);
      
      if (!user) {
        return res.status(401).json({ error: "Неверный логин или пароль" });
      }

      // Verify password using bcrypt
      const isValid = await verifyPassword(password, user.password);
      
      if (!isValid) {
        return res.status(401).json({ error: "Неверный логин или пароль" });
      }

      // Create session and return token
      const token = createSession(user.id, user.role);

      // Log the login event
      await storage.createEventLog({
        userId: user.id,
        action: "LOGIN",
        details: `User ${user.name} logged in`,
      });

      return res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          login: user.login,
          role: user.role,
        },
      });
    } catch (error: any) {
      console.error("Login error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Inventory routes (require authentication)
  app.get("/api/inventory", requireAuth, async (req, res) => {
    try {
      const items = await storage.getAllInventoryItems();
      return res.json(items);
    } catch (error: any) {
      console.error("Get inventory error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Find duplicates in inventory
  app.get("/api/inventory/duplicates", requireAuth, requireAdmin, async (req, res) => {
    try {
      const allItems = await storage.getAllInventoryItems();
      
      // Group by itemId (exclude nulls/empty)
      const itemIdGroups = new Map<string, typeof allItems>();
      // Group by SKU
      const skuGroups = new Map<string, typeof allItems>();
      
      allItems.forEach(item => {
        // Group by itemId if it exists
        if (item.itemId && item.itemId.trim()) {
          const existing = itemIdGroups.get(item.itemId) || [];
          existing.push(item);
          itemIdGroups.set(item.itemId, existing);
        }
        
        // Group by SKU
        if (item.sku && item.sku.trim()) {
          const existing = skuGroups.get(item.sku) || [];
          existing.push(item);
          skuGroups.set(item.sku, existing);
        }
      });
      
      // Find duplicates (groups with more than 1 item)
      const duplicates: {
        type: 'itemId' | 'sku';
        key: string;
        items: typeof allItems;
      }[] = [];
      
      itemIdGroups.forEach((items, itemId) => {
        if (items.length > 1) {
          duplicates.push({
            type: 'itemId',
            key: itemId,
            items,
          });
        }
      });
      
      skuGroups.forEach((items, sku) => {
        if (items.length > 1) {
          // Always add SKU duplicates - admin needs to see all items with same SKU
          // even if some are already shown in itemId duplicate groups
          duplicates.push({
            type: 'sku',
            key: sku,
            items,
          });
        }
      });
      
      console.log(`[DUPLICATES] Found ${duplicates.length} duplicate groups`);
      return res.json({ duplicates });
    } catch (error: any) {
      console.error("Get duplicates error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.post("/api/inventory", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      
      const { barcode, sku, productId, name, quantity, price, length, width, height, weight } = req.body;

      if (!barcode) {
        return res.status(400).json({ error: "Требуется штрихкод" });
      }

      if (!sku) {
        return res.status(400).json({ error: "Требуется SKU" });
      }

      // Check if item is still in pending tests
      const pendingTest = await storage.getPendingTestByBarcode(barcode);
      if (pendingTest) {
        return res.status(400).json({ 
          error: "Товар находится на тестировании. Завершите тестирование перед размещением." 
        });
      }

      // Check if item is in faulty stock (CRITICAL: Faulty items cannot be added to inventory)
      const faultyItem = await storage.getFaultyStockByBarcode(barcode);
      if (faultyItem) {
        return res.status(400).json({ 
          error: "ЗАПРЕЩЕНО! Товар отмечен как неисправный (Faulty/Parts) и НЕ МОЖЕТ быть добавлен на склад. Проверьте баркод или состояние товара.",
          isFaulty: true
        });
      }

      // Get condition from tested items (optional now - товары можно добавлять без тестирования)
      const condition = await storage.getConditionByBarcode(barcode);
      const withoutTest = !condition; // Отметка, если товар не проходил тестирование

      // Extract location from SKU
      const location = extractLocationFromSKU(sku);

      // Calculate volume
      const volume = (length && width && height) ? length * width * height : null;

      // Create pending placement
      const placement = await storage.createPendingPlacement({
        barcode,
        sku,
        location,
        productId: productId || null,
        name: name || null,
        condition: condition || "Не указано", // Если тестирования не было, указываем "Не указано"
        quantity: quantity || 1,
        price: price || null,
        length: length || null,
        width: width || null,
        height: height || null,
        volume,
        weight: weight || null,
        stockInBy: userId,
      });

      // Log the event с пометкой если товар добавлен без теста
      await storage.createEventLog({
        userId,
        action: "STOCK_IN",
        details: withoutTest 
          ? `Принято на склад БЕЗ ТЕСТИРОВАНИЯ: ${name || productId || barcode} (ожидает размещения)`
          : `Принято на склад: ${name || productId || barcode} (ожидает размещения)`,
        productId: productId || null,
        itemName: name || null,
        sku,
        location,
        quantity: quantity || 1,
        price: price || null,
        withoutTest,
      });

      return res.status(201).json(placement);
    } catch (error: any) {
      console.error("Create pending placement error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Get pending placements
  app.get("/api/pending-placements", requireAuth, async (req, res) => {
    try {
      const placements = await storage.getAllPendingPlacements();
      return res.json(placements);
    } catch (error: any) {
      console.error("Get pending placements error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Delete pending placement (admin only)
  app.delete("/api/pending-placements/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { id } = req.params;

      const deleted = await storage.deletePendingPlacement(id, userId);
      
      if (!deleted) {
        return res.status(404).json({ error: "Pending placement не найден" });
      }

      return res.json({ success: true, deleted });
    } catch (error: any) {
      console.error("Delete pending placement error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Confirm placement (move from pending to inventory)
  app.post("/api/placements/confirm", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { placementId, location } = req.body;

      if (!placementId) {
        return res.status(400).json({ error: "Требуется ID размещения" });
      }

      if (!location) {
        return res.status(400).json({ error: "Требуется локация" });
      }

      const inventoryItem = await storage.confirmPlacement(placementId, location, userId);
      return res.json(inventoryItem);
    } catch (error: any) {
      console.error("Confirm placement error:", error);
      return res.status(500).json({ error: error.message || "Внутренняя ошибка сервера" });
    }
  });

  // Update inventory item (PATCH)
  app.patch("/api/inventory/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { id } = req.params;
      const updates = req.body;

      // Get existing item
      const existing = await storage.getInventoryItemById(id);
      if (!existing) {
        return res.status(404).json({ error: "Товар не найден" });
      }

      // Update item
      const updated = await storage.updateInventoryItemById(id, updates);

      // Check if quantity decreased (STOCK_OUT)
      if (updates.quantity !== undefined && updates.quantity < existing.quantity) {
        const quantityReduced = existing.quantity - updates.quantity;
        await storage.createEventLog({
          userId,
          action: "STOCK_OUT",
          details: `Reduced ${existing.name || existing.sku} (${id}): -${quantityReduced}`,
          productId: existing.productId || null,
          itemName: existing.name || null,
          sku: existing.sku,
          location: existing.location,
          quantity: quantityReduced,
          price: existing.price || null,
        });
      } else if (updates.quantity !== undefined && updates.quantity > existing.quantity) {
        // Check if quantity increased (STOCK_IN_UPDATE)
        const quantityAdded = updates.quantity - existing.quantity;
        await storage.createEventLog({
          userId,
          action: "STOCK_IN_UPDATE",
          details: `Increased ${existing.name || existing.sku} (${id}): +${quantityAdded}`,
          productId: existing.productId || null,
          itemName: existing.name || null,
          sku: existing.sku,
          location: existing.location,
          quantity: quantityAdded,
          price: existing.price || null,
        });
      } else {
        // Regular update (not quantity change)
        await storage.createEventLog({
          userId,
          action: "INVENTORY_UPDATE",
          details: `Updated item ${existing.sku} (${id})`,
          productId: existing.productId || null,
          itemName: existing.name || null,
          sku: existing.sku,
          location: existing.location,
        });
      }

      // Check if quantity is 0 and delete if so
      if (updated.quantity === 0) {
        await storage.deleteInventoryItem(id, userId);
        await storage.createEventLog({
          userId,
          action: "AUTO_DELETE",
          details: `Auto-deleted item ${existing.sku} (${id}) - quantity reached 0`,
          productId: existing.productId || null,
          itemName: existing.name || null,
          sku: existing.sku,
          location: existing.location,
        });
        return res.json({ deleted: true, item: updated });
      }

      // Check if item is still in pending tests
      const barcodeToCheck = updates.barcode || existing.barcode;
      if (barcodeToCheck) {
        const pendingTest = await storage.getPendingTestByBarcode(barcodeToCheck);
        if (pendingTest) {
          return res.status(400).json({ 
            error: "Товар находится на тестировании. Завершите тестирование перед размещением." 
          });
        }

        // Remove from tested items list after placement
        try {
          await storage.removePendingTestByBarcode(barcodeToCheck);
        } catch (error) {
          // Silently ignore if not in tested items
        }
      }

      return res.json(updated);
    } catch (error: any) {
      console.error("Update inventory item error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Delete inventory item (DELETE)
  app.delete("/api/inventory/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { id } = req.params;

      // Get existing item for logging
      const existing = await storage.getInventoryItemById(id);
      if (!existing) {
        return res.status(404).json({ error: "Товар не найден" });
      }

      // Delete item
      await storage.deleteInventoryItem(id, userId);

      // Log the event
      await storage.createEventLog({
        userId,
        action: "INVENTORY_DELETE",
        details: `Deleted item ${existing.sku} (${id})`,
        productId: existing.productId || null,
        itemName: existing.name || null,
        sku: existing.sku,
        location: existing.location,
      });

      return res.json({ success: true });
    } catch (error: any) {
      console.error("Delete inventory item error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Batch delete inventory items (POST)
  app.post("/api/inventory/batch-delete", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "Массив ID обязателен" });
      }

      const result = await storage.batchDeleteInventoryItems(ids, userId);

      return res.json(result);
    } catch (error: any) {
      console.error("Batch delete inventory error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Delete all inventory items
  app.delete("/api/inventory/all/items", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const count = await storage.deleteAllInventoryItems(userId);

      return res.json({ message: `Удалено товаров: ${count}`, count });
    } catch (error: any) {
      console.error("Delete all inventory error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Get condition by barcode (GET /api/inventory/barcode/:barcode/condition)
  app.get("/api/inventory/barcode/:barcode/condition", requireAuth, async (req, res) => {
    try {
      const { barcode } = req.params;
      
      const condition = await storage.getConditionByBarcode(barcode);
      
      return res.json({ condition });
    } catch (error: any) {
      console.error("Get condition by barcode error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Update item condition (PATCH /api/inventory/:id/condition)
  app.patch("/api/inventory/:id/condition", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { id } = req.params;
      const { condition } = req.body;

      // Get existing item
      const existing = await storage.getInventoryItemById(id);
      if (!existing) {
        return res.status(404).json({ error: "Товар не найден" });
      }

      // Update condition in database
      await storage.updateItemCondition(id, condition, userId);

      // Log the event
      await storage.createEventLog({
        userId,
        action: "CONDITION_UPDATE",
        details: `Updated condition for ${existing.name || existing.sku} to ${condition || "none"}`,
        productId: existing.productId || null,
        itemName: existing.name || null,
        sku: existing.sku,
        location: existing.location,
      });

      return res.json({ success: true, condition });
    } catch (error: any) {
      console.error("Update condition error:", error);
      return res.status(500).json({ error: error.message || "Внутренняя ошибка сервера" });
    }
  });

  app.post("/api/inventory/bulk-upload", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId; // From requireAuth middleware
      const { items } = req.body;
      
      console.log("[BULK UPLOAD] Received items count:", items?.length || 0);
      if (items && items.length > 0) {
        console.log("[BULK UPLOAD] First 3 items:", JSON.stringify(items.slice(0, 3), null, 2));
      }
      
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: "Товары должны быть массивом" });
      }

      if (items.length === 0) {
        return res.status(400).json({ error: "Нет товаров для загрузки" });
      }

      // Force createdBy to authenticated user ID for all items
      const sanitizedItems = items.map(item => ({
        ...item,
        createdBy: userId,
      }));

      const result = await storage.bulkUpsertInventoryItems(sanitizedItems, {
        sourceType: 'manual',
        sourceRef: 'CSV Upload',
        userId: userId,
      });

      const totalUpdated = result.updatedQuantityOnly + result.updatedPartial + result.updatedAllFields;

      // Log the event using authenticated user ID
      await storage.createEventLog({
        userId,
        action: "CSV_UPLOAD",
        details: `Bulk upload: ${result.created} new, ${totalUpdated} updated, ${result.errors} errors`,
      });

      return res.json({
        created: result.created,
        updated: totalUpdated,
        errors: result.errors,
        stats: result, // Full detailed stats
      });
    } catch (error: any) {
      console.error("Bulk upload error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Sync inventory from CSV file
  app.post("/api/inventory/sync-from-file", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const filePath = path.join(process.cwd(), "data", "inventory.csv");

      console.log("[FILE SYNC] Reading file:", filePath);

      // Read CSV file
      let fileContent: string;
      try {
        fileContent = await fs.readFile(filePath, "utf-8");
      } catch (error) {
        return res.status(404).json({ error: "CSV файл не найден. Создайте data/inventory.csv" });
      }

      const lines = fileContent.trim().split("\n");
      if (lines.length < 2) {
        return res.status(400).json({ error: "CSV файл пуст или не содержит данных" });
      }

      // Parse CSV with auto-detection of delimiter
      const detectDelimiter = (line: string): string => {
        const delimiters = [";", ",", "\t", " "];
        for (const delimiter of delimiters) {
          if (line.includes(delimiter)) {
            return delimiter;
          }
        }
        return ";";
      };

      const delimiter = detectDelimiter(lines[0]);
      const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase());
      
      console.log("[FILE SYNC] Detected delimiter:", delimiter === "\t" ? "TAB" : delimiter);
      console.log("[FILE SYNC] Headers:", headers);

      // Parse data rows
      const csvItems = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(delimiter).map(v => v.trim());
        if (values.length === headers.length && values.some(v => v)) {
          const item: any = {};
          headers.forEach((header, index) => {
            item[header] = values[index];
          });
          csvItems.push(item);
        }
      }

      console.log("[FILE SYNC] Parsed items:", csvItems.length);

      // Get all current inventory items
      const allItems = await storage.getAllInventoryItems();
      
      // Create maps for matching: by itemId and by SKU
      const itemIdMap = new Map(allItems.filter(item => item.itemId).map(item => [item.itemId, item]));
      const skuMap = new Map(allItems.map(item => [item.sku, item]));

      console.log("[FILE SYNC] Current inventory items:", allItems.length);
      console.log("[FILE SYNC] Items with itemId:", itemIdMap.size);

      // Track changes for archive
      const archiveChanges: string[] = [];
      archiveChanges.push("identifier;itemName;action;field;oldValue;newValue;oldSku;oldLocation;oldQuantity;oldPrice;oldLength;oldWidth;oldHeight;oldVolume;oldWeight");

      // Track changes and conflicts
      let updated = 0;
      let created = 0;
      let deleted = 0;
      const deletedItems: string[] = [];
      const processedItems = new Set<string>(); // Track processed database items
      const conflicts: any[] = []; // Track conflicts for user resolution

      // Create/update items from CSV
      for (const csvItem of csvItems) {
        // Extract identifiers from CSV
        const itemId = csvItem.itemid || csvItem.item_id || csvItem['item id'] || undefined;
        const sku = csvItem.sku || undefined;
        const quantity = parseInt(csvItem.quantity) || 0;
        
        // Require either itemId or real SKU (not location)
        if ((!itemId && !sku) || quantity <= 0) {
          console.log("[FILE SYNC] Skipping item without itemId/SKU or zero quantity:", { 
            name: csvItem.name, 
            itemId, 
            sku, 
            quantity 
          });
          continue;
        }

        const length = csvItem.length ? parseFloat(csvItem.length) : undefined;
        const width = csvItem.width ? parseFloat(csvItem.width) : undefined;
        const height = csvItem.height ? parseFloat(csvItem.height) : undefined;
        const volume = length && width && height ? length * width * height : undefined;

        // Use itemId as productId if available, otherwise use sku
        const identifier = itemId || sku!;

        const itemData: any = {
          productId: identifier,
          name: csvItem.name || "",
          sku: sku || itemId || "",
          location: csvItem.location || sku || "",
          quantity,
          barcode: csvItem.barcode || "",
          price: csvItem.price ? parseInt(csvItem.price) : undefined,
          length,
          width,
          height,
          volume,
          weight: csvItem.weight ? parseFloat(csvItem.weight) : undefined,
          condition: csvItem.condition || undefined,
          itemId: itemId,
          ebayUrl: csvItem.ebayurl || csvItem.ebay_url || csvItem.url || csvItem['ebay url'] || undefined,
          ebaySellerName: csvItem.ebaysellername || csvItem.ebay_seller_name || csvItem['ebay seller'] || csvItem.seller || undefined,
          createdBy: userId,
        };

        // Add imageUrl1-24 fields
        for (let i = 1; i <= 24; i++) {
          const key = `imageurl${i}`;
          const altKey = `imageurl_${i}`;
          const altKey2 = `image_url_${i}`;
          const altKey3 = `image url ${i}`;
          const altKey4 = `image urls ${i}`;
          
          const imageUrl = csvItem[key] || csvItem[altKey] || csvItem[altKey2] || csvItem[altKey3] || csvItem[altKey4];
          if (imageUrl) {
            itemData[`imageUrl${i}`] = imageUrl;
          }
        }

        // Find existing item: first try by itemId, then by SKU
        let existingItem = itemId ? itemIdMap.get(itemId) : undefined;
        let existingBySku = sku ? skuMap.get(sku) : undefined;

        // Check for duplicate itemId with different SKU
        if (existingItem && sku && existingItem.sku !== sku) {
          // Дубликат: itemId существует, но SKU разные
          // Это требует решения администратора
          console.log(`[FILE SYNC] Duplicate itemId detected: ${itemId} exists with SKU ${existingItem.sku}, but CSV has SKU ${sku}`);
          
          conflicts.push({
            itemId: itemId!,
            sku: sku,
            name: itemData.name,
            conflictType: 'duplicate_item_id',
            existingData: {
              id: existingItem.id,
              name: existingItem.name,
              sku: existingItem.sku,
              location: existingItem.location,
              quantity: existingItem.quantity,
              price: existingItem.price,
              length: existingItem.length,
              width: existingItem.width,
              height: existingItem.height,
              weight: existingItem.weight,
              condition: existingItem.condition,
              barcode: existingItem.barcode,
              itemId: existingItem.itemId,
            },
            csvData: {
              name: itemData.name,
              sku: itemData.sku,
              location: itemData.location,
              quantity: itemData.quantity,
              price: itemData.price,
              length: itemData.length,
              width: itemData.width,
              height: itemData.height,
              weight: itemData.weight,
              condition: itemData.condition,
              itemId: itemData.itemId,
            },
            conflicts: [
              {
                field: 'sku',
                existingValue: existingItem.sku,
                csvValue: sku,
              }
            ],
          });
          continue; // Пропускаем дальнейшую обработку, ждем решения администратора
        }

        // Используем найденную запись (по itemId или SKU)
        if (!existingItem && existingBySku) {
          existingItem = existingBySku;
        }

        if (existingItem) {
          // Check for conflicts (excluding barcode which is always preserved)
          processedItems.add(existingItem.id);
          
          const fieldsToCheck = [
            { name: 'name', old: existingItem.name, new: itemData.name },
            { name: 'quantity', old: existingItem.quantity, new: itemData.quantity },
            { name: 'price', old: existingItem.price, new: itemData.price },
            { name: 'location', old: existingItem.location, new: itemData.location },
            { name: 'sku', old: existingItem.sku, new: itemData.sku },
            { name: 'length', old: existingItem.length, new: itemData.length },
            { name: 'width', old: existingItem.width, new: itemData.width },
            { name: 'height', old: existingItem.height, new: itemData.height },
            { name: 'weight', old: existingItem.weight, new: itemData.weight },
            { name: 'condition', old: existingItem.condition, new: itemData.condition },
          ];

          const itemConflicts = fieldsToCheck.filter(field => field.old !== field.new);

          if (itemConflicts.length > 0) {
            // We have conflicts - add to conflicts list for user resolution
            conflicts.push({
              itemId: identifier,
              sku: existingItem.sku,
              name: existingItem.name,
              conflictType: 'data_mismatch',
              existingData: {
                id: existingItem.id,
                name: existingItem.name,
                sku: existingItem.sku,
                location: existingItem.location,
                quantity: existingItem.quantity,
                price: existingItem.price,
                length: existingItem.length,
                width: existingItem.width,
                height: existingItem.height,
                weight: existingItem.weight,
                condition: existingItem.condition,
                barcode: existingItem.barcode, // Important: preserve existing barcode
                itemId: existingItem.itemId,
              },
              csvData: {
                name: itemData.name,
                sku: itemData.sku,
                location: itemData.location,
                quantity: itemData.quantity,
                price: itemData.price,
                length: itemData.length,
                width: itemData.width,
                height: itemData.height,
                weight: itemData.weight,
                condition: itemData.condition,
                itemId: itemData.itemId,
              },
              conflicts: itemConflicts.map(c => ({
                field: c.name,
                existingValue: c.old,
                csvValue: c.new,
              })),
            });

            console.log(`[FILE SYNC] Data conflict detected for ${identifier}:`, itemConflicts.length, 'fields differ');
          } else {
            // No conflicts - update as normal (but preserve barcode)
            itemData.barcode = existingItem.barcode || itemData.barcode;
            
            console.log(`[FILE SYNC] Updating ${identifier}:`, {
              id: existingItem.id,
              itemId: existingItem.itemId,
              sku: existingItem.sku,
            });
            await storage.updateInventoryItemById(existingItem.id, itemData);
            updated++;
          }
        } else {
          // Create new item
          console.log(`[FILE SYNC] Creating ${identifier}:`, itemData);
          
          // Record creation for archive
          const archiveLine = [
            identifier,
            itemData.name,
            'CREATE',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            ''
          ].join(';');
          archiveChanges.push(archiveLine);

          await storage.createInventoryItem(itemData);
          created++;
        }
      }

      // If there are conflicts, return them for user resolution
      if (conflicts.length > 0) {
        console.log("[FILE SYNC] Found", conflicts.length, "conflicts - returning for resolution");
        return res.json({
          hasConflicts: true,
          conflicts,
          csvData: csvItems, // Include CSV data for conflict resolution
          created,
          updated,
        });
      }

      // Track items that would be deleted (not in CSV but in DB)
      // Deletion is DISABLED for safety, but we still record them in archive
      for (const item of allItems) {
        if (!processedItems.has(item.id)) {
          // Record deletion for archive (even though we don't actually delete)
          const itemIdentifier = item.itemId || item.sku;
          const archiveLine = [
            itemIdentifier,
            item.name,
            'DELETED',
            '',
            '',
            '',
            item.sku,
            item.location,
            item.quantity,
            item.price ?? '',
            item.length ?? '',
            item.width ?? '',
            item.height ?? '',
            item.volume ?? '',
            item.weight ?? ''
          ].join(';');
          archiveChanges.push(archiveLine);
          deletedItems.push(`${item.name} (${itemIdentifier})`);
        }
      }

      // Create archive file if there are changes
      if (archiveChanges.length > 1) { // More than just header
        try {
          const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0].replace('T', '_');
          const archivePath = path.join(process.cwd(), "data", "arhiv");
          const archiveFile = path.join(archivePath, `${timestamp}.csv`);

          // Create archive directory if it doesn't exist
          await fs.mkdir(archivePath, { recursive: true });

          // Write archive file
          await fs.writeFile(archiveFile, archiveChanges.join('\n'), 'utf-8');
          console.log(`[FILE SYNC] Archive saved: ${archiveFile}`);
        } catch (error) {
          console.error("[FILE SYNC] Failed to create archive:", error);
        }
      }

      // Log the sync event
      await storage.createEventLog({
        userId,
        action: "FILE_SYNC",
        details: `File sync: ${created} created, ${updated} updated, ${deletedItems.length} would be deleted (archived)`,
      });

      console.log("[FILE SYNC] Results:", { created, updated, deleted: deletedItems.length });

      return res.json({ 
        success: true, 
        created, 
        updated, 
        deleted: 0, // Deletion disabled
        wouldBeDeleted: deletedItems.length,
        deletedItems 
      });
    } catch (error: any) {
      console.error("File sync error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Resolve CSV conflicts
  app.post("/api/inventory/resolve-conflicts", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { resolutions, csvData } = req.body;

      if (!resolutions || !Array.isArray(resolutions)) {
        return res.status(400).json({ error: "Требуется массив resolutions" });
      }

      console.log("[RESOLVE CONFLICTS] Processing", resolutions.length, "conflict resolutions");

      let updated = 0;
      let skipped = 0;

      // Process each resolution
      for (const resolution of resolutions) {
        const { itemId, sku, action } = resolution;

        if (action === 'keep_existing' || action === 'skip') {
          // Skip - keep existing data
          skipped++;
          console.log(`[RESOLVE CONFLICTS] Skipping ${itemId} (${sku})`);
          continue;
        }

        // Find the CSV data for this item
        const csvItem = csvData.find((item: any) => {
          const csvItemId = item.itemid || item.item_id || item['item id'];
          const csvSku = item.sku;
          return (csvItemId === itemId && csvSku === sku) || 
                 (csvItemId === itemId && !sku) ||
                 (csvSku === itemId);
        });

        if (!csvItem) {
          console.log(`[RESOLVE CONFLICTS] CSV data not found for ${itemId} (${sku})`);
          skipped++;
          continue;
        }

        // Get existing item from database
        const allItems = await storage.getAllInventoryItems();
        const existingItem = allItems.find(item => 
          (item.itemId === itemId && item.sku === sku) ||
          (item.itemId === itemId && !sku) ||
          item.sku === itemId
        );

        if (action === 'replace_existing') {
          // Delete existing item and create new one
          if (existingItem) {
            console.log(`[RESOLVE CONFLICTS] Deleting existing item ${existingItem.id} (${existingItem.itemId}/${existingItem.sku})`);
            await storage.deleteInventoryItem(existingItem.id, userId);
          }
          // Fall through to create new item
        }

        if (action === 'accept_csv' || action === 'create_duplicate' || action === 'replace_existing') {
          // Parse CSV data
          const length = csvItem.length ? parseFloat(csvItem.length) : undefined;
          const width = csvItem.width ? parseFloat(csvItem.width) : undefined;
          const height = csvItem.height ? parseFloat(csvItem.height) : undefined;
          const volume = length && width && height ? length * width * height : undefined;
          const csvSku = csvItem.sku || undefined;
          const csvItemId = csvItem.itemid || csvItem.item_id || csvItem['item id'];

          const itemData: any = {
            productId: csvItemId || csvSku!,
            name: csvItem.name || (existingItem?.name ?? ""),
            sku: csvSku || csvItemId || (existingItem?.sku ?? ""),
            location: csvItem.location || csvSku || (existingItem?.location ?? ""),
            quantity: parseInt(csvItem.quantity) || (existingItem?.quantity ?? 0),
            barcode: existingItem?.barcode || csvItem.barcode || "", // Preserve existing barcode if exists
            price: csvItem.price ? parseInt(csvItem.price) : (existingItem?.price ?? undefined),
            length,
            width,
            height,
            volume,
            weight: csvItem.weight ? parseFloat(csvItem.weight) : (existingItem?.weight ?? undefined),
            condition: csvItem.condition || (existingItem?.condition ?? undefined),
            itemId: csvItemId,
            ebayUrl: csvItem.ebayurl || csvItem.ebay_url || csvItem.url || csvItem['ebay url'] || (existingItem?.ebayUrl ?? undefined),
            ebaySellerName: csvItem.ebaysellername || csvItem.ebay_seller_name || csvItem['ebay seller'] || csvItem.seller || (existingItem?.ebaySellerName ?? undefined),
            createdBy: userId,
          };

          // Add imageUrl1-24 fields
          for (let i = 1; i <= 24; i++) {
            const key = `imageurl${i}`;
            const altKey = `imageurl_${i}`;
            const altKey2 = `image_url_${i}`;
            const altKey3 = `image url ${i}`;
            const altKey4 = `image urls ${i}`;
            
            const imageUrl = csvItem[key] || csvItem[altKey] || csvItem[altKey2] || csvItem[altKey3] || csvItem[altKey4];
            if (imageUrl) {
              itemData[`imageUrl${i}`] = imageUrl;
            }
          }

          if (action === 'accept_csv') {
            // Update existing item
            if (!existingItem) {
              console.log(`[RESOLVE CONFLICTS] Cannot update - existing item not found for ${itemId}`);
              skipped++;
              continue;
            }
            await storage.updateInventoryItemById(existingItem.id, itemData);
            console.log(`[RESOLVE CONFLICTS] Updated ${itemId} (${sku}) with CSV data (barcode preserved)`);
          } else if (action === 'create_duplicate' || action === 'replace_existing') {
            // Create new item
            await storage.createInventoryItem(itemData);
            console.log(`[RESOLVE CONFLICTS] Created new item ${csvItemId} (${csvSku}) - duplicate of ${itemId}`);
          }
          
          updated++;
        }
      }

      // Log the event
      await storage.createEventLog({
        userId,
        action: "CONFLICT_RESOLUTION",
        details: `Resolved conflicts: ${updated} updated, ${skipped} kept existing`,
      });

      console.log("[RESOLVE CONFLICTS] Results:", { updated, skipped });

      return res.json({
        success: true,
        updated,
        skipped,
      });
    } catch (error: any) {
      console.error("Resolve conflicts error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Warehouse loading analysis (require authentication)
  app.get("/api/warehouse/loading", requireAuth, async (req, res) => {
    try {
      const loading = await storage.getWarehouseLoadingByLocation();
      return res.json(loading);
    } catch (error: any) {
      console.error("Get warehouse loading error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Warehouse Settings (Read: all users, Write: admin only)
  app.get("/api/warehouse/settings", requireAuth, async (req, res) => {
    try {
      const settings = await storage.getAllWarehouseSettings();
      return res.json(settings);
    } catch (error: any) {
      console.error("Get warehouse settings error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.post("/api/warehouse/settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { locationPattern, tsku, maxq } = req.body;

      if (!locationPattern || !tsku || !maxq) {
        return res.status(400).json({ error: "Требуются locationPattern, tsku и maxq" });
      }

      const setting = await storage.upsertWarehouseSetting({ locationPattern, tsku, maxq });
      return res.json(setting);
    } catch (error: any) {
      console.error("Upsert warehouse setting error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.delete("/api/warehouse/settings/:locationPattern", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { locationPattern } = req.params;
      await storage.deleteWarehouseSetting(locationPattern);
      return res.status(204).send();
    } catch (error: any) {
      console.error("Delete warehouse setting error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Active Locations (Admin only)
  app.get("/api/warehouse/active-locations", requireAuth, async (req, res) => {
    try {
      const locations = await storage.getAllActiveLocations();
      return res.json(locations);
    } catch (error: any) {
      console.error("Get active locations error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.post("/api/warehouse/active-locations", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { locations } = req.body;

      if (!Array.isArray(locations)) {
        return res.status(400).json({ error: "locations должен быть массивом" });
      }

      await storage.setActiveLocations(locations);
      const saved = await storage.getAllActiveLocations();
      return res.json(saved);
    } catch (error: any) {
      console.error("Set active locations error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.patch("/api/warehouse/active-locations/:location/barcode", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { location } = req.params;
      const { barcode } = req.body;

      const updated = await storage.updateLocationBarcode(location, barcode || null);
      return res.json(updated);
    } catch (error: any) {
      console.error("Update location barcode error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.delete("/api/warehouse/active-locations", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.clearActiveLocations();
      return res.status(204).send();
    } catch (error: any) {
      console.error("Clear active locations error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Stock-Out (Picking) routes
  app.post("/api/inventory/pick", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { barcode } = req.body;

      if (!barcode) {
        return res.status(400).json({ error: "Требуется штрихкод" });
      }

      const item = await storage.pickItemByBarcode(barcode, userId);

      if (!item) {
        return res.status(404).json({ error: "Товар не найден или уже собран" });
      }

      return res.json(item);
    } catch (error: any) {
      console.error("Pick item error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.delete("/api/inventory/item/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { id } = req.params;

      const deleted = await storage.deleteInventoryItem(id, userId);

      if (!deleted) {
        return res.status(404).json({ error: "Товар не найден" });
      }

      return res.status(204).send();
    } catch (error: any) {
      console.error("Delete item error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.delete("/api/inventory/location/:location", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { location } = req.params;

      const count = await storage.deleteItemsByLocation(location, userId);

      if (count === 0) {
        return res.status(404).json({ error: "Местоположение не найдено" });
      }

      return res.json({ deleted: count });
    } catch (error: any) {
      console.error("Delete location error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Daily Picking routes
  app.post("/api/picking/lists", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { name, tasks } = req.body;

      if (!name || !tasks || !Array.isArray(tasks)) {
        return res.status(400).json({ error: "Требуются название и задачи" });
      }

      const result = await storage.createPickingList({
        name,
        userId,
        tasks,
      });

      return res.json(result);
    } catch (error: any) {
      console.error("Create picking list error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.get("/api/picking/lists", requireAuth, async (req, res) => {
    try {
      const lists = await storage.getAllPickingLists();
      return res.json(lists);
    } catch (error: any) {
      console.error("Get picking lists error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.get("/api/picking/lists/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await storage.getPickingListWithTasks(id);

      if (!result) {
        return res.status(404).json({ error: "Список сборки не найден" });
      }

      return res.json(result);
    } catch (error: any) {
      console.error("Get picking list error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.post("/api/picking/scan", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { barcode, taskId } = req.body;

      if (!barcode || !taskId) {
        return res.status(400).json({ error: "Требуются штрихкод и taskId" });
      }

      const result = await storage.scanBarcodeForPickingTask(barcode, taskId, userId);

      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }

      return res.json(result);
    } catch (error: any) {
      console.error("Scan barcode error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.post("/api/picking/manual-collect", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { taskId } = req.body;

      if (!taskId) {
        return res.status(400).json({ error: "Требуется taskId" });
      }

      const result = await storage.manualCollectForPickingTask(taskId, userId);

      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }

      return res.json(result);
    } catch (error: any) {
      console.error("Manual collect error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.delete("/api/picking/lists/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { id } = req.params;

      const deleted = await storage.deletePickingList(id, userId);

      if (!deleted) {
        return res.status(404).json({ error: "Список сборки не найден" });
      }

      return res.status(204).send();
    } catch (error: any) {
      console.error("Delete picking list error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // CSV Sources routes
  app.get("/api/csv-sources", requireAuth, async (req, res) => {
    try {
      const sources = await storage.getAllCsvSources();
      return res.json(sources);
    } catch (error: any) {
      console.error("Get CSV sources error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.post("/api/csv-sources", requireAuth, async (req, res) => {
    try {
      const { url, name, enabled, sortOrder } = req.body;

      if (!url || !name) {
        return res.status(400).json({ error: "URL и название обязательны" });
      }

      const source = await storage.createCsvSource({
        url,
        name,
        enabled: enabled ?? true,
        sortOrder: sortOrder ?? 0
      });

      return res.json(source);
    } catch (error: any) {
      console.error("Create CSV source error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.patch("/api/csv-sources/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const source = await storage.updateCsvSource(id, updates);
      return res.json(source);
    } catch (error: any) {
      console.error("Update CSV source error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.delete("/api/csv-sources/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteCsvSource(id);
      return res.status(204).send();
    } catch (error: any) {
      console.error("Delete CSV source error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Bulk Upload Sources routes (for mass inventory upload & scheduler)
  app.get("/api/bulk-upload-sources", requireAuth, async (req, res) => {
    try {
      const sources = await storage.getAllBulkUploadSources();
      return res.json(sources);
    } catch (error: any) {
      console.error("Get bulk upload sources error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.post("/api/bulk-upload-sources", requireAuth, async (req, res) => {
    try {
      const { url, label, enabled, sortOrder } = req.body;

      // Allow empty url and label for draft sources (user will fill them in later)
      // Default to disabled to prevent scheduler from trying to fetch empty URLs
      const source = await storage.createBulkUploadSource({
        url: url || '',
        label: label || '',
        enabled: enabled ?? false,
        sortOrder: sortOrder ?? 0
      });

      return res.json(source);
    } catch (error: any) {
      console.error("Create bulk upload source error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.patch("/api/bulk-upload-sources/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const source = await storage.updateBulkUploadSource(id, updates);
      return res.json(source);
    } catch (error: any) {
      console.error("Update bulk upload source error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.delete("/api/bulk-upload-sources/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteBulkUploadSource(id);
      return res.status(204).send();
    } catch (error: any) {
      console.error("Delete bulk upload source error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Global Settings routes
  app.get("/api/settings/:key", requireAuth, async (req, res) => {
    try {
      const { key } = req.params;
      const setting = await storage.getGlobalSetting(key);
      
      if (!setting) {
        return res.status(404).json({ error: "Настройка не найдена" });
      }

      return res.json(setting);
    } catch (error: any) {
      console.error("Get global setting error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.put("/api/settings/:key", requireAuth, async (req, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;

      if (value === undefined) {
        return res.status(400).json({ error: "Значение обязательно" });
      }

      const setting = await storage.upsertGlobalSetting(key, value);
      return res.json(setting);
    } catch (error: any) {
      console.error("Upsert global setting error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Serve test CSV file
  app.get("/api/test-csv", async (req, res) => {
    try {
      const csvPath = path.join(process.cwd(), "data", "test-picking-list.csv");
      const csvContent = await fs.readFile(csvPath, "utf-8");
      
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=test-picking-list.csv");
      return res.send(csvContent);
    } catch (error: any) {
      console.error("Serve test CSV error:", error);
      return res.status(500).json({ error: "Ошибка при загрузке тестового файла" });
    }
  });

  app.post("/api/picking/parse-csv-url", requireAuth, async (req, res) => {
    try {
      const { url, full, username, password } = req.body;

      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "URL обязателен" });
      }

      // Security: Validate URL to prevent SSRF attacks
      const parsedUrl = new URL(url);
      
      // Allow only HTTP/HTTPS protocols
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return res.status(400).json({ error: "Разрешены только HTTP/HTTPS протоколы" });
      }

      const hostname = parsedUrl.hostname.toLowerCase();

      // Helper function to check if IP is private/internal
      const isPrivateIP = (ip: string): boolean => {
        // Check IPv4
        const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
        const ipv4Match = ip.match(ipv4Pattern);
        if (ipv4Match) {
          const [, a, b] = ipv4Match.map(Number);
          return (
            a === 10 || // 10.0.0.0/8
            (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
            (a === 192 && b === 168) || // 192.168.0.0/16
            a === 127 || // 127.0.0.0/8 (loopback)
            a === 0 || // 0.0.0.0/8
            (a === 169 && b === 254) // 169.254.0.0/16 (link-local)
          );
        }
        
        // Check IPv6
        const lowerIP = ip.toLowerCase();
        return (
          lowerIP === '::1' || // loopback
          lowerIP.startsWith('fe80:') || // link-local
          lowerIP.startsWith('fc') || // unique local
          lowerIP.startsWith('fd') // unique local
        );
      };

      // Block localhost variants
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
        return res.status(400).json({ error: "Внутренние адреса запрещены" });
      }

      // Check if hostname is a direct IP and validate it
      if (isPrivateIP(hostname)) {
        return res.status(400).json({ error: "Внутренние адреса запрещены" });
      }

      // Resolve hostname to IPs and check each one
      try {
        const addresses = await dns.resolve(hostname);
        for (const address of addresses) {
          if (isPrivateIP(address)) {
            return res.status(400).json({ error: "Внутренние адреса запрещены" });
          }
        }
      } catch (dnsError) {
        // If DNS resolution fails, allow the request to proceed
        // (fetch will fail anyway if hostname doesn't resolve)
      }

      // Fetch CSV from URL with redirect protection and optional Basic Auth
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
      
      const fetchOptions: RequestInit = {
        redirect: 'error', // Prevent redirects to bypass SSRF protection
        signal: controller.signal
      };

      // Add Basic Auth header if username and password provided
      if (username && password && typeof username === 'string' && typeof password === 'string') {
        const authString = Buffer.from(`${username}:${password}`).toString('base64');
        fetchOptions.headers = {
          'Authorization': `Basic ${authString}`
        };
      }

      // Mask sensitive URL components for logging (query params, userinfo)
      const maskedUrl = (() => {
        try {
          const urlObj = new URL(url);
          // Remove query parameters (may contain tokens)
          urlObj.search = urlObj.search ? '?***' : '';
          // Remove userinfo (username:password@)
          urlObj.username = '';
          urlObj.password = '';
          return urlObj.toString().substring(0, 100);
        } catch {
          return url.substring(0, 100);
        }
      })();
      
      console.log(`[CSV URL Import] Fetching from URL: ${maskedUrl}...`);
      const fetchStartTime = Date.now();
      
      let response;
      try {
        response = await fetch(url, fetchOptions);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.error(`[CSV URL Import] Timeout after 60s for URL: ${maskedUrl}`);
          return res.status(408).json({ error: "Превышено время ожидания загрузки файла (60 сек)" });
        }
        throw fetchError;
      } finally {
        clearTimeout(timeoutId);
      }
      
      const fetchDuration = Date.now() - fetchStartTime;
      console.log(`[CSV URL Import] Fetch completed in ${fetchDuration}ms`);
      
      if (!response.ok) {
        return res.status(400).json({ error: `Не удалось загрузить файл: ${response.statusText}` });
      }

      console.log(`[CSV URL Import] Reading response text...`);
      const csvText = await response.text();
      console.log(`[CSV URL Import] Response size: ${csvText.length} bytes`);

      // Clean up CSV text: remove \r characters
      const cleanedCsvText = csvText.replace(/\r/g, '');
      const lines = cleanedCsvText.trim().split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        return res.status(400).json({ error: "CSV файл пустой или содержит только заголовок" });
      }

      // Auto-detect delimiter (comma, semicolon, or tab)
      const detectDelimiter = (line: string): string => {
        const delimiters = [',', ';', '\t'];
        let maxCount = 0;
        let bestDelimiter = ',';
        
        for (const delimiter of delimiters) {
          let count = 0;
          let inQuotes = false;
          
          for (let i = 0; i < line.length; i++) {
            if (line[i] === '"') {
              if (inQuotes && line[i + 1] === '"') {
                i++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (line[i] === delimiter && !inQuotes) {
              count++;
            }
          }
          
          if (count > maxCount) {
            maxCount = count;
            bestDelimiter = delimiter;
          }
        }
        
        return bestDelimiter;
      };

      const delimiter = detectDelimiter(lines[0]);

      // Parse CSV with text qualifier support and detected delimiter
      const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          const nextChar = line[i + 1];
          
          if (char === '"') {
            if (inQuotes && nextChar === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === delimiter && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        
        result.push(current.trim());
        return result;
      };

      const headers = parseCSVLine(lines[0]);
      console.log(`[CSV URL Import] Detected ${headers.length} columns, ${lines.length - 1} data rows`);
      console.log(`[CSV URL Import] Headers: ${headers.join(', ')}`);
      
      // If full=true, return all data; otherwise return preview only
      const shouldReturnFull = full === true || full === 'true';
      const dataRows: Record<string, string>[] = [];
      const previewRows: Record<string, string>[] = [];

      const rowLimit = shouldReturnFull ? lines.length : Math.min(6, lines.length);
      console.log(`[CSV URL Import] Parsing mode: ${shouldReturnFull ? 'FULL' : 'PREVIEW'}, processing ${rowLimit - 1} rows`);
      
      const parseStartTime = Date.now();
      for (let i = 1; i < rowLimit; i++) {
        const values = parseCSVLine(lines[i]);
        const row: Record<string, string> = {};
        
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        
        if (shouldReturnFull) {
          dataRows.push(row);
        } else {
          previewRows.push(row);
        }
      }
      const parseDuration = Date.now() - parseStartTime;
      console.log(`[CSV URL Import] Parsing completed in ${parseDuration}ms`);

      const result = {
        success: true,
        headers,
        preview: shouldReturnFull ? dataRows.slice(0, 5) : previewRows,
        data: shouldReturnFull ? dataRows : undefined,
        totalRows: lines.length - 1 // excluding header
      };
      
      console.log(`[CSV URL Import] Success! Returning ${shouldReturnFull ? dataRows.length : previewRows.length} rows to client`);
      return res.json(result);
    } catch (error: any) {
      console.error("Parse CSV URL error:", error);
      return res.status(500).json({ error: "Ошибка при обработке CSV файла" });
    }
  });

  // User management routes (admin only)
  app.get("/api/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      // Don't send passwords to frontend
      const safeUsers = users.map(({ password, ...user }) => user);
      return res.json(safeUsers);
    } catch (error: any) {
      console.error("Get users error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.post("/api/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const validation = insertUserSchema.safeParse(req.body);
      
      if (!validation.success) {
        const error = fromZodError(validation.error);
        return res.status(400).json({ error: error.message });
      }

      // Check if user with same login already exists
      const existing = await storage.getUserByLogin(validation.data.login);
      
      if (existing) {
        return res.status(400).json({ error: "Пользователь с таким логином уже существует" });
      }

      // Hash the password before storing
      const hashedPassword = await hashPassword(validation.data.password);
      const user = await storage.createUser({
        ...validation.data,
        password: hashedPassword,
      });
      
      // Don't send password to frontend
      const { password, ...safeUser } = user;
      
      return res.status(201).json(safeUser);
    } catch (error: any) {
      console.error("Create user error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.delete("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const currentUserId = (req as any).userId;

      // Don't allow deleting yourself
      if (id === currentUserId) {
        return res.status(400).json({ error: "Нельзя удалить самого себя" });
      }

      // Check if this is the last admin
      const allUsers = await storage.getAllUsers();
      const admins = allUsers.filter(u => u.role === 'admin');
      const userToDelete = allUsers.find(u => u.id === id);

      if (userToDelete?.role === 'admin' && admins.length === 1) {
        return res.status(400).json({ error: "Нельзя удалить последнего администратора" });
      }

      await storage.deleteUser(id);
      return res.status(204).send();
    } catch (error: any) {
      console.error("Delete user error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.patch("/api/users/:id/password", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { password } = req.body;

      if (!password || password.length < 6) {
        return res.status(400).json({ error: "Пароль должен быть не менее 6 символов" });
      }

      const hashedPassword = await hashPassword(password);
      await storage.updateUserPassword(id, hashedPassword);
      
      return res.json({ message: "Password updated successfully" });
    } catch (error: any) {
      console.error("Update password error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.patch("/api/users/:id/name", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const currentUserId = (req as any).userId;
      
      // Validate request body with Zod
      const updateNameSchema = z.object({
        name: z.string().min(1, "Имя не может быть пустым").trim()
      });

      const validation = updateNameSchema.safeParse(req.body);
      if (!validation.success) {
        const error = fromZodError(validation.error);
        return res.status(400).json({ error: error.message });
      }

      // Validate UUID format
      const uuidSchema = z.string().uuid("Неверный формат ID пользователя");
      const idValidation = uuidSchema.safeParse(id);
      if (!idValidation.success) {
        return res.status(400).json({ error: "Неверный формат ID пользователя" });
      }

      // Get user before update for logging
      const userBefore = await storage.getUser(id);
      if (!userBefore) {
        return res.status(404).json({ error: "Пользователь не найден" });
      }

      const updatedUser = await storage.updateUserName(id, validation.data.name);
      if (!updatedUser) {
        return res.status(404).json({ error: "Пользователь не найден" });
      }

      // Log the name change
      await storage.createEventLog({
        userId: currentUserId,
        action: "USER_NAME_UPDATED",
        details: `Изменено имя пользователя ${userBefore.login}: "${userBefore.name}" → "${validation.data.name}"`,
      });

      const { password, ...safeUser } = updatedUser;
      
      return res.json(safeUser);
    } catch (error: any) {
      console.error("Update user name error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.patch("/api/users/:id/login", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const currentUserId = (req as any).userId;
      
      // Validate request body with Zod
      const updateLoginSchema = z.object({
        login: z.string().min(1, "Логин не может быть пустым").trim()
      });

      const validation = updateLoginSchema.safeParse(req.body);
      if (!validation.success) {
        const error = fromZodError(validation.error);
        return res.status(400).json({ error: error.message });
      }

      // Validate UUID format
      const uuidSchema = z.string().uuid("Неверный формат ID пользователя");
      const idValidation = uuidSchema.safeParse(id);
      if (!idValidation.success) {
        return res.status(400).json({ error: "Неверный формат ID пользователя" });
      }

      // Get user before update for logging
      const userBefore = await storage.getUser(id);
      if (!userBefore) {
        return res.status(404).json({ error: "Пользователь не найден" });
      }

      // Check if new login already exists
      const existingUser = await storage.getUserByLogin(validation.data.login);
      if (existingUser && existingUser.id !== id) {
        return res.status(400).json({ error: "Этот логин уже используется" });
      }

      const updatedUser = await storage.updateUserLogin(id, validation.data.login);
      if (!updatedUser) {
        return res.status(404).json({ error: "Пользователь не найден" });
      }

      // Log the login change
      await storage.createEventLog({
        userId: currentUserId,
        action: "USER_LOGIN_UPDATED",
        details: `Изменён логин пользователя: "${userBefore.login}" → "${validation.data.login}" (${userBefore.name})`,
      });

      const { password, ...safeUser } = updatedUser;
      
      return res.json(safeUser);
    } catch (error: any) {
      console.error("Update user login error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // SKU Errors (admin only)
  app.get("/api/sku-errors", requireAuth, requireAdmin, async (req, res) => {
    try {
      const errors = await storage.getAllSkuErrors();
      return res.json(errors);
    } catch (error: any) {
      console.error("Get SKU errors error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  app.post("/api/sku-errors/:id/resolve", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { correctedSku } = req.body;
      const userId = (req as any).userId;

      if (!correctedSku) {
        return res.status(400).json({ error: "Требуется исправленный SKU" });
      }

      await storage.resolveSkuError(id, correctedSku, userId);
      return res.json({ message: "SKU error resolved successfully" });
    } catch (error: any) {
      console.error("Resolve SKU error:", error);
      return res.status(500).json({ error: error.message || "Внутренняя ошибка сервера" });
    }
  });

  app.delete("/api/sku-errors/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteSkuError(id);
      return res.json({ message: "SKU error deleted successfully" });
    } catch (error: any) {
      console.error("Delete SKU error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Event logs (admin only)
  app.get("/api/logs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const filters = {
        limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
        userId: req.query.userId as string | undefined,
        search: req.query.search as string | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
      };
      
      const logs = await storage.getEventLogs(filters);
      return res.json(logs);
    } catch (error: any) {
      console.error("Get logs error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Create event log
  app.post("/api/event-logs", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      
      const validation = insertEventLogSchema.safeParse({
        userId,
        ...req.body,
      });

      if (!validation.success) {
        return res.status(400).json({ 
          error: "Неверные данные", 
          details: fromZodError(validation.error).toString() 
        });
      }

      const log = await storage.createEventLog(validation.data);
      return res.status(201).json(log);
    } catch (error: any) {
      console.error("Create event log error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Worker analytics (admin only)
  app.get("/api/analytics", requireAuth, requireAdmin, async (req, res) => {
    try {
      const period = (req.query.period as 'day' | 'week' | 'month' | 'all') || 'day';
      const analytics = await storage.getWorkerAnalytics(period);
      return res.json(analytics);
    } catch (error: any) {
      console.error("Get analytics error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", requireAuth, async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      
      if (token) {
        const { destroySession } = await import("./auth");
        destroySession(token);
      }

      return res.json({ message: "Logged out successfully" });
    } catch (error: any) {
      console.error("Logout error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Product Testing - Start test (first scan)
  app.post("/api/product-testing/start", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { barcode, sku, productId, name } = req.body;

      if (!barcode) {
        return res.status(400).json({ error: "Штрихкод обязателен" });
      }

      // Check if already in pending tests
      const existing = await storage.getPendingTestByBarcode(barcode);
      if (existing) {
        return res.status(400).json({ error: "Товар уже находится на тестировании" });
      }

      const test = await storage.startProductTest({
        barcode,
        sku: sku || null,
        productId: productId || null,
        name: name || null,
        firstScanBy: userId,
      });

      // Log test start
      await storage.createEventLog({
        userId,
        action: "TEST_START",
        details: `Начато тестирование товара (штрихкод: ${barcode})`,
        productId: productId || null,
        itemName: name || null,
        sku: sku || null,
      });

      return res.json(test);
    } catch (error: any) {
      console.error("Start product test error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Product Testing - Complete test (second scan with condition selection)
  app.post("/api/product-testing/complete", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { barcode, condition } = req.body;

      if (!barcode || !condition) {
        return res.status(400).json({ error: "Штрихкод и кондиция обязательны" });
      }

      const validConditions = ["Used", "Exdisplay", "New", "Parts", "Faulty"];
      if (!validConditions.includes(condition)) {
        return res.status(400).json({ error: "Неверная кондиция" });
      }

      // Get pending test
      const pending = await storage.getPendingTestByBarcode(barcode);
      if (!pending) {
        return res.status(404).json({ error: "Товар не найден в списке тестирования" });
      }

      // Calculate working hours
      const { calculateWorkingMinutes } = await import("./utils/workingHours");
      const workingMinutes = calculateWorkingMinutes(
        new Date(pending.firstScanAt),
        new Date()
      );

      // Complete test
      const result = await storage.completePendingTest(barcode, condition, userId, workingMinutes);

      // Log test completion
      await storage.createEventLog({
        userId,
        action: "TEST_COMPLETE",
        details: `Завершено тестирование товара. Результат: ${condition}`,
        productId: pending.productId || null,
        itemName: pending.name || null,
        sku: pending.sku || null,
      });

      return res.json(result);
    } catch (error: any) {
      console.error("Complete product test error:", error);
      return res.status(500).json({ error: error.message || "Внутренняя ошибка сервера" });
    }
  });

  // Get all pending tests
  app.get("/api/product-testing/pending", requireAuth, async (req, res) => {
    try {
      const tests = await storage.getAllPendingTests();
      return res.json(tests);
    } catch (error: any) {
      console.error("Get pending tests error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Get all tested items
  app.get("/api/product-testing/tested", requireAuth, async (req, res) => {
    try {
      const items = await storage.getAllTestedItems();
      return res.json(items);
    } catch (error: any) {
      console.error("Get tested items error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Delete pending test (admin only)
  app.delete("/api/product-testing/pending/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ error: "ID обязателен" });
      }

      await storage.deletePendingTest(id);
      return res.json({ message: "Тестируемый товар удален" });
    } catch (error: any) {
      console.error("Delete pending test error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Delete tested item (admin only)
  app.delete("/api/product-testing/tested/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ error: "ID обязателен" });
      }

      // Delete the tested item
      await storage.deleteTestedItem(id);

      return res.json({ message: "Протестированный товар удален" });
    } catch (error: any) {
      console.error("Delete tested item error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Get all faulty stock (admin only)
  app.get("/api/faulty-stock", requireAuth, requireAdmin, async (req, res) => {
    try {
      const items = await storage.getAllFaultyStock();
      return res.json(items);
    } catch (error: any) {
      console.error("Get faulty stock error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Delete single faulty stock item (admin only)
  app.delete("/api/faulty-stock/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req as any).userId;

      if (!id) {
        return res.status(400).json({ error: "ID обязателен" });
      }

      await storage.deleteFaultyStockItem(id);

      // Log the event
      await storage.createEventLog({
        userId,
        action: "FAULTY_STOCK_DELETED",
        details: `Deleted faulty/parts item: ${id}`,
      });

      return res.json({ message: "Бракованный товар удален" });
    } catch (error: any) {
      console.error("Delete faulty stock item error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Delete all faulty stock items by condition (admin only)
  app.delete("/api/faulty-stock/all/:condition", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { condition } = req.params;
      const userId = (req as any).userId;

      if (condition !== "Faulty" && condition !== "Parts") {
        return res.status(400).json({ error: "Неверная кондиция. Допустимые значения: Faulty, Parts" });
      }

      const count = await storage.deleteAllFaultyStock(condition);

      // Log the event
      await storage.createEventLog({
        userId,
        action: "FAULTY_STOCK_BULK_DELETED",
        details: `Deleted all ${condition} items (${count} items)`,
      });

      return res.json({ message: `Удалено товаров: ${count}`, count });
    } catch (error: any) {
      console.error("Delete all faulty stock error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // CSV Import endpoints (admin only)
  
  // POST /api/inventory/import-csv - Start CSV import process
  app.post("/api/inventory/import-csv", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { sourceType, sourceUrl, csvText, columnMapping } = req.body;
      const userId = (req as any).userId;
      
      let csvRows: any[];
      
      // Parse CSV based on source type
      if (sourceType === 'text') {
        // New: Parse from CSV text with column mapping
        if (!csvText) {
          return res.status(400).json({ error: "CSV text is required for text source type" });
        }
        
        const lines = csvText.trim().split('\n');
        if (lines.length === 0) {
          return res.status(400).json({ error: "CSV file is empty" });
        }
        
        // Parse headers
        const originalHeaders = lines[0].split(',').map((h: string) => h.trim().replace(/^"|"$/g, ''));
        
        // Parse rows
        const rawRows = lines.slice(1).map((line: string) => {
          const values = line.split(',').map((v: string) => v.trim().replace(/^"|"$/g, ''));
          const row: any = {};
          originalHeaders.forEach((header: string, idx: number) => {
            row[header] = values[idx] || '';
          });
          return row;
        });
        
        // Apply column mapping if provided
        if (columnMapping && Array.isArray(columnMapping) && columnMapping.length > 0) {
          // Whitelist of allowed target fields for security
          const allowedTargetFields = [
            'productName', 'sku', 'location', 'barcode', 'quantity', 'price', 
            'itemId', 'ebayUrl', 'ebaySellerName', 'condition',
            'weight', 'width', 'height', 'length', // Размеры и вес
            // Image URL fields (imageUrl1 through imageUrl24)
            'imageUrl1', 'imageUrl2', 'imageUrl3', 'imageUrl4', 'imageUrl5', 'imageUrl6',
            'imageUrl7', 'imageUrl8', 'imageUrl9', 'imageUrl10', 'imageUrl11', 'imageUrl12',
            'imageUrl13', 'imageUrl14', 'imageUrl15', 'imageUrl16', 'imageUrl17', 'imageUrl18',
            'imageUrl19', 'imageUrl20', 'imageUrl21', 'imageUrl22', 'imageUrl23', 'imageUrl24'
          ];
          
          csvRows = rawRows.map((rawRow: any) => {
            const mappedRow: any = {};
            
            columnMapping.forEach((mapping: any) => {
              // Filter out skip and validate against whitelist
              if (mapping.enabled && 
                  mapping.targetField !== '(skip)' && 
                  allowedTargetFields.includes(mapping.targetField)) {
                const csvValue = rawRow[mapping.csvColumn];
                mappedRow[mapping.targetField] = csvValue;
              }
            });
            
            return mappedRow;
          });
        } else {
          csvRows = rawRows;
        }
      } else if (sourceType === 'url') {
        if (!sourceUrl) {
          return res.status(400).json({ error: "URL is required for URL source type" });
        }
        csvRows = await parseCsvFromUrl(sourceUrl);
      } else if (sourceType === 'file') {
        // Handle file upload (req.file from multer or similar)
        const file = (req as any).file;
        if (!file) {
          return res.status(400).json({ error: "File is required for file source type" });
        }
        csvRows = await parseCsvFile(file.buffer);
      } else {
        return res.status(400).json({ error: "Invalid source type" });
      }
      
      // Get all inventory items for matching
      const inventoryItems = await storage.getAllInventoryItems();
      
      const matched: any[] = [];
      const conflicts: any[] = [];
      const unmatched: any[] = [];
      const dimensionConflicts: any[] = [];
      
      // Process each CSV row
      for (let csvRowIndex = 0; csvRowIndex < csvRows.length; csvRowIndex++) {
        const row = csvRows[csvRowIndex];
        
        // Support both original column names and mapped field names
        const csvName = row.productName || row['Product Name'] || row['Title'] || row['title'] || '';
        const itemId = row.itemId || row['Item ID'] || row['ItemID'] || row['item_id'] || '';
        const ebayUrl = row.ebayUrl || row['eBay URL'] || row['URL'] || row['url'] || '';
        const ebaySellerName = row.ebaySellerName || row['eBay Seller'] || row['seller_ebay_seller_id'] || row['Seller'] || '';
        
        // Parse individual image URL fields (imageUrl1 through imageUrl24)
        const imageUrl1 = row.imageUrl1 || undefined;
        const imageUrl2 = row.imageUrl2 || undefined;
        const imageUrl3 = row.imageUrl3 || undefined;
        const imageUrl4 = row.imageUrl4 || undefined;
        const imageUrl5 = row.imageUrl5 || undefined;
        const imageUrl6 = row.imageUrl6 || undefined;
        const imageUrl7 = row.imageUrl7 || undefined;
        const imageUrl8 = row.imageUrl8 || undefined;
        const imageUrl9 = row.imageUrl9 || undefined;
        const imageUrl10 = row.imageUrl10 || undefined;
        const imageUrl11 = row.imageUrl11 || undefined;
        const imageUrl12 = row.imageUrl12 || undefined;
        const imageUrl13 = row.imageUrl13 || undefined;
        const imageUrl14 = row.imageUrl14 || undefined;
        const imageUrl15 = row.imageUrl15 || undefined;
        const imageUrl16 = row.imageUrl16 || undefined;
        const imageUrl17 = row.imageUrl17 || undefined;
        const imageUrl18 = row.imageUrl18 || undefined;
        const imageUrl19 = row.imageUrl19 || undefined;
        const imageUrl20 = row.imageUrl20 || undefined;
        const imageUrl21 = row.imageUrl21 || undefined;
        const imageUrl22 = row.imageUrl22 || undefined;
        const imageUrl23 = row.imageUrl23 || undefined;
        const imageUrl24 = row.imageUrl24 || undefined;
        
        const quantity = parseInt(row.quantity || row['Quantity'] || row['warehouse_inventory'] || '1');
        const price = parseFloat(row.price || row['Price'] || '0');
        
        // Parse dimension fields from CSV
        const csvWeight = row.weight || row['Weight'] || row['weight'] || row['WEIGHT'];
        const csvWidth = row.width || row['Width'] || row['width'] || row['WIDTH'];
        const csvHeight = row.height || row['Height'] || row['height'] || row['HEIGHT'];
        const csvLength = row.length || row['Length'] || row['length'] || row['LENGTH'];
        
        const parsedWeight = csvWeight ? parseFloat(csvWeight) : undefined;
        const parsedWidth = csvWidth ? parseFloat(csvWidth) : undefined;
        const parsedHeight = csvHeight ? parseFloat(csvHeight) : undefined;
        const parsedLength = csvLength ? parseFloat(csvLength) : undefined;
        
        if (!csvName) {
          unmatched.push({ csvRow: row, reason: 'No product name' });
          continue;
        }
        
        const { match, score, conflicts: itemConflicts } = matchProductsByName(csvName, inventoryItems);
        
        if (match && itemConflicts.length === 0) {
          // Check for dimension conflicts
          const dimConflict: any = {
            csvRowIndex,
            productId: match.productId,
            productName: match.name,
            conflicts: {}
          };
          
          let hasDimensionConflict = false;
          
          // Check weight conflict
          if (parsedWeight !== undefined && match.weight !== null && match.weight !== undefined && parsedWeight !== match.weight) {
            dimConflict.conflicts.weight = { csv: parsedWeight, current: match.weight };
            hasDimensionConflict = true;
          }
          
          // Check width conflict
          if (parsedWidth !== undefined && match.width !== null && match.width !== undefined && parsedWidth !== match.width) {
            dimConflict.conflicts.width = { csv: parsedWidth, current: match.width };
            hasDimensionConflict = true;
          }
          
          // Check height conflict
          if (parsedHeight !== undefined && match.height !== null && match.height !== undefined && parsedHeight !== match.height) {
            dimConflict.conflicts.height = { csv: parsedHeight, current: match.height };
            hasDimensionConflict = true;
          }
          
          // Check length conflict
          if (parsedLength !== undefined && match.length !== null && match.length !== undefined && parsedLength !== match.length) {
            dimConflict.conflicts.length = { csv: parsedLength, current: match.length };
            hasDimensionConflict = true;
          }
          
          if (hasDimensionConflict) {
            dimensionConflicts.push(dimConflict);
          }
          
          matched.push({
            csvRow: row,
            csvRowIndex,
            inventoryItem: match,
            score,
            updates: {
              itemId,
              ebayUrl,
              ebaySellerName,
              imageUrl1,
              imageUrl2,
              imageUrl3,
              imageUrl4,
              imageUrl5,
              imageUrl6,
              imageUrl7,
              imageUrl8,
              imageUrl9,
              imageUrl10,
              imageUrl11,
              imageUrl12,
              imageUrl13,
              imageUrl14,
              imageUrl15,
              imageUrl16,
              imageUrl17,
              imageUrl18,
              imageUrl19,
              imageUrl20,
              imageUrl21,
              imageUrl22,
              imageUrl23,
              imageUrl24,
              quantity,
              price,
              weight: parsedWeight,
              width: parsedWidth,
              height: parsedHeight,
              length: parsedLength,
            }
          });
        } else if (match && itemConflicts.length > 0) {
          conflicts.push({
            csvRow: row,
            csvRowIndex,
            candidates: [match, ...itemConflicts].map(c => ({ ...c, score: compareTwoStrings(csvName.toLowerCase(), c.name.toLowerCase()) })),
            updates: {
              itemId,
              ebayUrl,
              ebaySellerName,
              imageUrl1,
              imageUrl2,
              imageUrl3,
              imageUrl4,
              imageUrl5,
              imageUrl6,
              imageUrl7,
              imageUrl8,
              imageUrl9,
              imageUrl10,
              imageUrl11,
              imageUrl12,
              imageUrl13,
              imageUrl14,
              imageUrl15,
              imageUrl16,
              imageUrl17,
              imageUrl18,
              imageUrl19,
              imageUrl20,
              imageUrl21,
              imageUrl22,
              imageUrl23,
              imageUrl24,
              quantity,
              price,
              weight: parsedWeight,
              width: parsedWidth,
              height: parsedHeight,
              length: parsedLength,
            }
          });
        } else {
          unmatched.push({ csvRow: row, reason: 'No match found' });
        }
      }
      
      // Create import session
      const session = await storage.createCsvImportSession({
        sourceType,
        sourceUrl: sourceType === 'url' ? sourceUrl : undefined,
        status: 'READY_FOR_REVIEW',
        parsedData: JSON.stringify({ matched, conflicts, unmatched, dimensionConflicts }),
        totalRows: csvRows.length,
        matchedRows: matched.length,
        conflictRows: conflicts.length,
        createdBy: userId,
      });
      
      return res.json({
        sessionId: session.id,
        summary: {
          total: csvRows.length,
          matched: matched.length,
          conflicts: conflicts.length,
          unmatched: unmatched.length,
          dimensionConflicts: dimensionConflicts.length,
        },
        session,
      });
    } catch (error: any) {
      console.error("CSV import error:", error);
      return res.status(500).json({ error: "Ошибка импорта CSV: " + error.message });
    }
  });

  // GET all sessions
  app.get("/api/inventory/import-sessions", requireAuth, requireAdmin, async (req, res) => {
    try {
      const sessions = await storage.getAllCsvImportSessions();
      return res.json(sessions);
    } catch (error: any) {
      console.error("Get sessions error:", error);
      return res.status(500).json({ error: "Ошибка получения сессий" });
    }
  });

  // GET specific session
  app.get("/api/inventory/import-sessions/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const session = await storage.getCsvImportSession(id);
      if (!session) {
        return res.status(404).json({ error: "Сессия не найдена" });
      }
      return res.json(session);
    } catch (error: any) {
      console.error("Get session error:", error);
      return res.status(500).json({ error: "Ошибка получения сессии" });
    }
  });

  // POST resolve conflicts
  app.post("/api/inventory/import-sessions/:id/resolve", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { resolutions } = req.body; // Array of { csvRowIndex, selectedProductId }
      
      const session = await storage.getCsvImportSession(id);
      if (!session) {
        return res.status(404).json({ error: "Сессия не найдена" });
      }
      
      // Update session with resolutions
      const updatedSession = await storage.updateCsvImportSession(id, {
        resolutions: JSON.stringify(resolutions),
        status: 'RESOLVING',
      });
      
      return res.json(updatedSession);
    } catch (error: any) {
      console.error("Resolve conflicts error:", error);
      return res.status(500).json({ error: "Ошибка разрешения конфликтов" });
    }
  });

  // POST commit import
  app.post("/api/inventory/import-sessions/:id/commit", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { dimensionChoices } = req.body; // Array of { productId: string, useCSV: boolean }
      const userId = (req as any).userId;
      
      const session = await storage.getCsvImportSession(id);
      if (!session) {
        return res.status(404).json({ error: "Сессия не найдена" });
      }
      
      const parsedData = JSON.parse(session.parsedData as string);
      const itemsToUpdate: any[] = [];
      
      // Create a map of dimension choices for quick lookup
      const dimensionChoiceMap = new Map<string, boolean>();
      if (dimensionChoices && Array.isArray(dimensionChoices)) {
        dimensionChoices.forEach((choice: { productId: string; useCSV: boolean }) => {
          dimensionChoiceMap.set(choice.productId, choice.useCSV);
        });
      }
      
      // Collect matched items
      for (const match of parsedData.matched || []) {
        const productId = match.inventoryItem.productId;
        const useCSVDimensions = dimensionChoiceMap.get(productId);
        
        // If useCSV=false, exclude dimension fields from updates
        const updates = { ...match.updates };
        if (useCSVDimensions === false) {
          delete updates.weight;
          delete updates.width;
          delete updates.height;
          delete updates.length;
        }
        
        itemsToUpdate.push({
          productId,
          name: match.inventoryItem.name,
          ...updates,
        });
      }
      
      // Collect resolved conflicts
      const resolutions = session.resolutions ? JSON.parse(session.resolutions as string) : [];
      for (const resolution of resolutions) {
        const conflict = parsedData.conflicts[resolution.csvRowIndex];
        if (conflict) {
          const selectedItem = conflict.candidates.find((c: any) => c.productId === resolution.selectedProductId);
          if (selectedItem) {
            const productId = selectedItem.productId;
            const useCSVDimensions = dimensionChoiceMap.get(productId);
            
            // If useCSV=false, exclude dimension fields from updates
            const updates = { ...conflict.updates };
            if (useCSVDimensions === false) {
              delete updates.weight;
              delete updates.width;
              delete updates.height;
              delete updates.length;
            }
            
            itemsToUpdate.push({
              productId,
              name: selectedItem.name,
              ...updates,
            });
          }
        }
      }
      
      // Bulk update inventory
      const result = await storage.bulkUpdateInventoryFromCsv(itemsToUpdate, userId);
      
      // Update session status
      await storage.updateCsvImportSession(id, {
        status: 'COMMITTED',
      });
      
      // Log event
      await storage.createEventLog({
        userId,
        action: 'CSV_IMPORT_COMMITTED',
        details: `Импортировано ${result.updated} товаров из CSV`,
      });
      
      return res.json({
        message: `Успешно обновлено ${result.updated} товаров`,
        result,
      });
    } catch (error: any) {
      console.error("Commit import error:", error);
      
      // Mark session as failed
      const { id: sessionId } = req.params;
      await storage.updateCsvImportSession(sessionId, {
        status: 'FAILED',
        error: error.message,
      });
      
      return res.status(500).json({ error: "Ошибка применения импорта: " + error.message });
    }
  });

  // Order routes (all require auth)
  
  // Create new order
  app.post("/api/orders", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      
      // Validate request body
      const validation = insertOrderSchema.safeParse(req.body);
      if (!validation.success) {
        const error = fromZodError(validation.error);
        return res.status(400).json({ error: error.message });
      }
      
      const orderData = {
        ...validation.data,
        createdBy: userId,
      };
      
      const order = await storage.createOrder(orderData);
      
      return res.status(201).json(order);
    } catch (error: any) {
      console.error("Create order error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Get all orders (with optional status filter)
  app.get("/api/orders", requireAuth, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const filters = status ? { status } : undefined;
      
      const orders = await storage.getOrders(filters);
      
      return res.json(orders);
    } catch (error: any) {
      console.error("Get orders error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Get order by ID
  app.get("/api/orders/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      const order = await storage.getOrderById(id);
      
      if (!order) {
        return res.status(404).json({ error: "Заказ не найден" });
      }
      
      return res.json(order);
    } catch (error: any) {
      console.error("Get order by ID error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Update order status
  app.patch("/api/orders/:id/status", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, userId } = req.body;
      
      if (!status) {
        return res.status(400).json({ error: "Требуется статус" });
      }
      
      if (!userId) {
        return res.status(400).json({ error: "Требуется userId" });
      }
      
      const order = await storage.getOrderById(id);
      if (!order) {
        return res.status(404).json({ error: "Заказ не найден" });
      }
      
      const updatedOrder = await storage.updateOrderStatus(id, status, userId);
      
      return res.json(updatedOrder);
    } catch (error: any) {
      console.error("Update order status error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Update shipping label
  app.patch("/api/orders/:id/shipping-label", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { label } = req.body;
      
      if (!label) {
        return res.status(400).json({ error: "Требуется label" });
      }
      
      const order = await storage.getOrderById(id);
      if (!order) {
        return res.status(404).json({ error: "Заказ не найден" });
      }
      
      const updatedOrder = await storage.updateShippingLabel(id, label);
      
      return res.json(updatedOrder);
    } catch (error: any) {
      console.error("Update shipping label error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Update dispatch data
  app.patch("/api/orders/:id/dispatch", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { barcodes, userId } = req.body;
      
      if (!barcodes || !Array.isArray(barcodes)) {
        return res.status(400).json({ error: "Требуется массив barcodes" });
      }
      
      if (!userId) {
        return res.status(400).json({ error: "Требуется userId" });
      }
      
      const order = await storage.getOrderById(id);
      if (!order) {
        return res.status(404).json({ error: "Заказ не найден" });
      }
      
      const updatedOrder = await storage.updateDispatchData(id, barcodes, userId);
      
      return res.json(updatedOrder);
    } catch (error: any) {
      console.error("Update dispatch data error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Update packing data
  app.patch("/api/orders/:id/packing", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: "Требуется userId" });
      }
      
      const order = await storage.getOrderById(id);
      if (!order) {
        return res.status(404).json({ error: "Заказ не найден" });
      }
      
      const updatedOrder = await storage.updatePackingData(id, userId);
      
      return res.json(updatedOrder);
    } catch (error: any) {
      console.error("Update packing data error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Find order by SKU or barcode
  app.post("/api/orders/scan", requireAuth, async (req, res) => {
    try {
      const { code, status } = req.body;
      
      if (!code) {
        return res.status(400).json({ error: "Требуется code (SKU или barcode)" });
      }
      
      // Try to find by barcode first
      let order = await storage.findOrderByBarcode(code, status);
      
      if (order) {
        return res.json({ order, matchType: "barcode" });
      }
      
      // Try to find by SKU
      const orders = await storage.findOrdersBySku(code, status);
      
      if (orders.length === 0) {
        return res.status(404).json({ error: "Заказ не найден по данному коду" });
      }
      
      if (orders.length === 1) {
        return res.json({ order: orders[0], matchType: "sku" });
      }
      
      // Multiple orders with this SKU
      return res.json({ orders, matchType: "sku", multiple: true });
    } catch (error: any) {
      console.error("Scan order error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Load inventory from project CSV file (data/inventory.csv)
  app.post("/api/inventory/load-project-csv", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const filePath = path.join(process.cwd(), "data", "inventory.csv");

      console.log("[PROJECT CSV] Reading file:", filePath);

      // Read CSV file
      let fileContent: string;
      try {
        fileContent = await fs.readFile(filePath, "utf-8");
      } catch (error) {
        return res.status(404).json({ error: "CSV файл не найден. Создайте файл data/inventory.csv" });
      }

      if (!fileContent.trim()) {
        return res.status(400).json({ error: "CSV файл пуст" });
      }

      // Parse CSV using fast-csv
      const rows: any[] = [];
      await new Promise<void>((resolve, reject) => {
        Readable.from(fileContent)
          .pipe(parse({ headers: true, trim: true }))
          .on('data', (row) => rows.push(row))
          .on('end', () => resolve())
          .on('error', (error) => reject(error));
      });

      console.log("[PROJECT CSV] Parsed rows:", rows.length);

      if (rows.length === 0) {
        return res.status(400).json({ error: "CSV файл не содержит данных" });
      }

      // Convert CSV rows to inventory items
      const items = rows.map((row) => {
        const sku = row.SKU || row.sku || '';
        const location = extractLocationFromSKU(sku);
        
        // Calculate volume if dimensions are available
        const length = row.Length || row.length ? parseFloat(row.Length || row.length) : undefined;
        const width = row.Width || row.width ? parseFloat(row.Width || row.width) : undefined;
        const height = row.Height || row.height ? parseFloat(row.Height || row.height) : undefined;
        const volume = length && width && height ? length * width * height : undefined;

        return {
          productId: row['Product ID'] || row.productId || row.ProductID || null,
          name: row.Name || row.name || null,
          sku,
          location,
          quantity: parseInt(row.Quantity || row.quantity || '1'),
          barcode: row.Barcode || row.barcode || undefined,
          condition: row.Condition || row.condition || null,
          price: row.Price || row.price ? parseFloat(row.Price || row.price) : undefined,
          length,
          width,
          height,
          volume,
          weight: row.Weight || row.weight ? parseFloat(row.Weight || row.weight) : undefined,
          itemId: row['Item ID'] || row.itemId || row.ItemID || null,
          ebayUrl: row.URL || row.url || row.ebayUrl || null,
          ebaySellerName: row['eBay Seller'] || row.ebaySellerName || row.Seller || null,
          // Image URLs (1-24)
          imageUrl1: row['Image URL 1'] || row.imageUrl1 || null,
          imageUrl2: row['Image URL 2'] || row.imageUrl2 || null,
          imageUrl3: row['Image URL 3'] || row.imageUrl3 || null,
          imageUrl4: row['Image URL 4'] || row.imageUrl4 || null,
          imageUrl5: row['Image URL 5'] || row.imageUrl5 || null,
          imageUrl6: row['Image URL 6'] || row.imageUrl6 || null,
          imageUrl7: row['Image URL 7'] || row.imageUrl7 || null,
          imageUrl8: row['Image URL 8'] || row.imageUrl8 || null,
          imageUrl9: row['Image URL 9'] || row.imageUrl9 || null,
          imageUrl10: row['Image URL 10'] || row.imageUrl10 || null,
          imageUrl11: row['Image URL 11'] || row.imageUrl11 || null,
          imageUrl12: row['Image URL 12'] || row.imageUrl12 || null,
          imageUrl13: row['Image URL 13'] || row.imageUrl13 || null,
          imageUrl14: row['Image URL 14'] || row.imageUrl14 || null,
          imageUrl15: row['Image URL 15'] || row.imageUrl15 || null,
          imageUrl16: row['Image URL 16'] || row.imageUrl16 || null,
          imageUrl17: row['Image URL 17'] || row.imageUrl17 || null,
          imageUrl18: row['Image URL 18'] || row.imageUrl18 || null,
          imageUrl19: row['Image URL 19'] || row.imageUrl19 || null,
          imageUrl20: row['Image URL 20'] || row.imageUrl20 || null,
          imageUrl21: row['Image URL 21'] || row.imageUrl21 || null,
          imageUrl22: row['Image URL 22'] || row.imageUrl22 || null,
          imageUrl23: row['Image URL 23'] || row.imageUrl23 || null,
          imageUrl24: row['Image URL 24'] || row.imageUrl24 || null,
          createdBy: userId,
        };
      });

      // Bulk upsert items
      const result = await storage.bulkUpsertInventoryItems(items, {
        sourceType: 'file',
        sourceRef: 'data/inventory.csv',
        userId: userId,
      });

      const totalUpdated = result.updatedQuantityOnly + result.updatedPartial + result.updatedAllFields;

      // Log the event
      await storage.createEventLog({
        userId,
        action: "PROJECT_CSV_LOAD",
        details: `Загружено из data/inventory.csv: ${result.created} новых, ${totalUpdated} обновлено, ${result.errors} ошибок`,
      });

      console.log("[PROJECT CSV] Result:", result);

      return res.json({
        created: result.created,
        updated: totalUpdated,
        errors: result.errors,
        message: `Успешно загружено: ${result.created} новых товаров, обновлено: ${totalUpdated}`,
        stats: result, // Full detailed stats
      });
    } catch (error: any) {
      console.error("[PROJECT CSV] Error:", error);
      return res.status(500).json({ error: "Ошибка при загрузке CSV файла: " + error.message });
    }
  });

  // Scheduler endpoints
  app.get("/api/scheduler/settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getSchedulerSettings();
      return res.json(settings);
    } catch (error: any) {
      console.error("[SCHEDULER] Get settings error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/scheduler/settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { enabled, cronExpression } = req.body;
      
      // Validate cron expression if provided
      if (cronExpression) {
        const cron = await import('node-cron');
        if (!cron.validate(cronExpression)) {
          return res.status(400).json({ error: "Invalid cron expression" });
        }
      }
      
      const settings = await storage.updateSchedulerSettings({
        enabled,
        cronExpression,
      });
      
      // Restart scheduler to apply new settings
      const { restartScheduler } = await import('./scheduler');
      await restartScheduler();
      
      return res.json(settings);
    } catch (error: any) {
      console.error("[SCHEDULER] Update settings error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Import runs endpoints
  app.get("/api/import-runs/latest", requireAuth, async (req, res) => {
    try {
      const sourceType = req.query.sourceType as string | undefined;
      const run = await storage.getLatestImportRun(sourceType);
      return res.json(run);
    } catch (error: any) {
      console.error("[IMPORT RUNS] Get latest error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/import-runs/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const run = await storage.getImportRunById(id);
      if (!run) {
        return res.status(404).json({ error: "Import run not found" });
      }
      return res.json(run);
    } catch (error: any) {
      console.error("[IMPORT RUNS] Get by ID error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/scheduler/run", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { runScheduledImport } = await import('./scheduler');
      const result = await runScheduledImport();
      
      if (result.success) {
        return res.json(result);
      } else {
        return res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("[SCHEDULER] Manual run error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);

  // Setup WebSocket server for remote scanning
  setupWebSocket(httpServer);

  return httpServer;
}
