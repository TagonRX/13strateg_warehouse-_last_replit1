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
  let bestMatch = null;
  let bestScore = 0;
  const conflicts: any[] = [];
  
  for (const item of inventoryItems) {
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

      const result = await storage.bulkUpsertInventoryItems(sanitizedItems);

      // Log the event using authenticated user ID
      await storage.createEventLog({
        userId,
        action: "CSV_UPLOAD",
        details: `Bulk upload: ${result.success} new, ${result.updated} updated, ${result.errors} errors`,
      });

      return res.json(result);
    } catch (error: any) {
      console.error("Bulk upload error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
  });

  // Sync inventory from CSV file
  app.post("/api/inventory/sync-from-file", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const filePath = path.join(process.cwd(), "data", "inventory_sync.csv");

      console.log("[FILE SYNC] Reading file:", filePath);

      // Read CSV file
      let fileContent: string;
      try {
        fileContent = await fs.readFile(filePath, "utf-8");
      } catch (error) {
        return res.status(404).json({ error: "CSV файл не найден. Создайте data/inventory_sync.csv" });
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
      const currentItemsMap = new Map(allItems.map(item => [item.productId, item]));

      console.log("[FILE SYNC] Current inventory items:", allItems.length);

      // Track changes for archive
      const archiveChanges: string[] = [];
      archiveChanges.push("productId;itemName;action;field;oldValue;newValue;oldSku;oldLocation;oldQuantity;oldPrice;oldLength;oldWidth;oldHeight;oldVolume;oldWeight");

      // Track changes
      let updated = 0;
      let created = 0;
      let deleted = 0;
      const deletedItems: string[] = [];

      // Create/update items from CSV
      for (const csvItem of csvItems) {
        const productId = csvItem.productid || csvItem.product_id;
        const quantity = parseInt(csvItem.quantity) || 0;
        
        if (!productId || quantity <= 0) {
          continue; // Skip invalid items
        }

        const length = csvItem.length ? parseInt(csvItem.length) : undefined;
        const width = csvItem.width ? parseInt(csvItem.width) : undefined;
        const height = csvItem.height ? parseInt(csvItem.height) : undefined;
        const volume = length && width && height ? length * width * height : undefined;

        const itemData = {
          productId,
          name: csvItem.name || "",
          sku: csvItem.sku || csvItem.location || productId,
          location: csvItem.location || csvItem.sku || productId,
          quantity,
          barcode: csvItem.barcode || "",
          price: csvItem.price ? parseInt(csvItem.price) : undefined,
          length,
          width,
          height,
          volume,
          weight: csvItem.weight ? parseInt(csvItem.weight) : undefined,
          createdBy: userId,
        };

        if (currentItemsMap.has(productId)) {
          // Update existing item
          const existingItem = currentItemsMap.get(productId)!;
          
          // Compare fields and track changes for archive
          const fieldsToCompare = [
            { name: 'quantity', old: existingItem.quantity, new: itemData.quantity },
            { name: 'price', old: existingItem.price, new: itemData.price },
            { name: 'location', old: existingItem.location, new: itemData.location },
            { name: 'sku', old: existingItem.sku, new: itemData.sku },
            { name: 'barcode', old: existingItem.barcode, new: itemData.barcode },
            { name: 'length', old: existingItem.length, new: itemData.length },
            { name: 'width', old: existingItem.width, new: itemData.width },
            { name: 'height', old: existingItem.height, new: itemData.height },
            { name: 'volume', old: existingItem.volume, new: itemData.volume },
            { name: 'weight', old: existingItem.weight, new: itemData.weight },
          ];

          for (const field of fieldsToCompare) {
            if (field.old !== field.new) {
              // Record change for archive
              const archiveLine = [
                productId,
                existingItem.name,
                'UPDATE',
                field.name,
                field.old ?? '',
                field.new ?? '',
                existingItem.sku,
                existingItem.location,
                existingItem.quantity,
                existingItem.price ?? '',
                existingItem.length ?? '',
                existingItem.width ?? '',
                existingItem.height ?? '',
                existingItem.volume ?? '',
                existingItem.weight ?? ''
              ].join(';');
              archiveChanges.push(archiveLine);
            }
          }

          console.log(`[FILE SYNC] Updating ${productId}:`, {
            id: existingItem.id,
            oldQuantity: existingItem.quantity,
            newQuantity: itemData.quantity,
            oldPrice: existingItem.price,
            newPrice: itemData.price,
            dimensions: { length: itemData.length, width: itemData.width, height: itemData.height }
          });
          await storage.updateInventoryItemById(existingItem.id, itemData);
          updated++;
          currentItemsMap.delete(productId); // Mark as processed
        } else {
          // Create new item
          console.log(`[FILE SYNC] Creating ${productId}:`, itemData);
          
          // Record creation for archive
          const archiveLine = [
            productId,
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

      // Track items that would be deleted (not in CSV but in DB)
      // Deletion is DISABLED for safety, but we still record them in archive
      for (const [productId, item] of Array.from(currentItemsMap.entries())) {
        // Record deletion for archive (even though we don't actually delete)
        const archiveLine = [
          productId,
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
        deletedItems.push(`${item.name} (${item.productId})`);
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
      const fetchOptions: RequestInit = {
        redirect: 'error' // Prevent redirects to bypass SSRF protection
      };

      // Add Basic Auth header if username and password provided
      if (username && password && typeof username === 'string' && typeof password === 'string') {
        const authString = Buffer.from(`${username}:${password}`).toString('base64');
        fetchOptions.headers = {
          'Authorization': `Basic ${authString}`
        };
      }

      const response = await fetch(url, fetchOptions);
      
      if (!response.ok) {
        return res.status(400).json({ error: `Не удалось загрузить файл: ${response.statusText}` });
      }

      const csvText = await response.text();

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
      
      // If full=true, return all data; otherwise return preview only
      const shouldReturnFull = full === true || full === 'true';
      const dataRows: Record<string, string>[] = [];
      const previewRows: Record<string, string>[] = [];

      const rowLimit = shouldReturnFull ? lines.length : Math.min(6, lines.length);
      
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

      return res.json({
        success: true,
        headers,
        preview: shouldReturnFull ? dataRows.slice(0, 5) : previewRows,
        data: shouldReturnFull ? dataRows : undefined,
        totalRows: lines.length - 1 // excluding header
      });
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
      const { sourceType, sourceUrl } = req.body;
      const userId = (req as any).userId;
      
      let csvRows: any[];
      
      // Parse CSV based on source type
      if (sourceType === 'url') {
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
      
      // Process each CSV row
      for (const row of csvRows) {
        const csvName = row['Product Name'] || row['Title'] || '';
        const itemId = row['Item ID'] || row['ItemID'] || '';
        const ebayUrl = row['eBay URL'] || row['URL'] || '';
        const imageUrl = row['Image URL'] || row['ImageURL'] || '';
        const quantity = parseInt(row['Quantity'] || '1');
        const price = parseFloat(row['Price'] || '0');
        
        if (!csvName) {
          unmatched.push({ csvRow: row, reason: 'No product name' });
          continue;
        }
        
        const { match, score, conflicts: itemConflicts } = matchProductsByName(csvName, inventoryItems);
        
        if (match && itemConflicts.length === 0) {
          matched.push({
            csvRow: row,
            inventoryItem: match,
            score,
            updates: {
              itemId,
              ebayUrl,
              imageUrls: imageUrl ? [imageUrl] : [],
              quantity,
            }
          });
        } else if (match && itemConflicts.length > 0) {
          conflicts.push({
            csvRow: row,
            candidates: [match, ...itemConflicts].map(c => ({ ...c, score: compareTwoStrings(csvName.toLowerCase(), c.name.toLowerCase()) })),
            updates: {
              itemId,
              ebayUrl,
              imageUrls: imageUrl ? [imageUrl] : [],
              quantity,
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
        parsedData: JSON.stringify({ matched, conflicts, unmatched }),
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
      const userId = (req as any).userId;
      
      const session = await storage.getCsvImportSession(id);
      if (!session) {
        return res.status(404).json({ error: "Сессия не найдена" });
      }
      
      const parsedData = JSON.parse(session.parsedData as string);
      const itemsToUpdate: any[] = [];
      
      // Collect matched items
      for (const match of parsedData.matched || []) {
        itemsToUpdate.push({
          productId: match.inventoryItem.productId,
          name: match.inventoryItem.name,
          ...match.updates,
        });
      }
      
      // Collect resolved conflicts
      const resolutions = session.resolutions ? JSON.parse(session.resolutions as string) : [];
      for (const resolution of resolutions) {
        const conflict = parsedData.conflicts[resolution.csvRowIndex];
        if (conflict) {
          const selectedItem = conflict.candidates.find((c: any) => c.productId === resolution.selectedProductId);
          if (selectedItem) {
            itemsToUpdate.push({
              productId: selectedItem.productId,
              name: selectedItem.name,
              ...conflict.updates,
            });
          }
        }
      }
      
      // Bulk update inventory
      const result = await storage.bulkUpdateInventoryFromCsv(itemsToUpdate, userId);
      
      // Update session status
      await storage.updateCsvImportSession(id, {
        status: 'COMMITTED',
        committedAt: new Date(),
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
      await storage.updateCsvImportSession(id, {
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

  const httpServer = createServer(app);

  // Setup WebSocket server for remote scanning
  setupWebSocket(httpServer);

  return httpServer;
}
