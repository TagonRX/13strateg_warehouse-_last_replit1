import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertInventoryItemSchema, insertEventLogSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { verifyPassword, hashPassword, createSession, requireAuth, requireAdmin } from "./auth";
import { setupWebSocket } from "./websocket";
import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { promises as dns } from "dns";

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
      const userId = (req as any).userId; // From requireAuth middleware
      
      const validation = insertInventoryItemSchema.safeParse(req.body);
      
      if (!validation.success) {
        const error = fromZodError(validation.error);
        return res.status(400).json({ error: error.message });
      }

      // Check if item with same productId already exists
      const existing = validation.data.productId 
        ? await storage.getInventoryItemByProductId(validation.data.productId)
        : undefined;
      
      if (existing && validation.data.productId) {
        // Update existing item
        const quantityToAdd = validation.data.quantity ?? 1;
        const updated = await storage.updateInventoryItem(validation.data.productId, {
          quantity: existing.quantity + quantityToAdd,
          location: validation.data.location,
          sku: validation.data.sku,
          barcode: validation.data.barcode,
        });

        // Log the event using authenticated user ID
        // Use price from request if provided, otherwise use existing item's price
        await storage.createEventLog({
          userId,
          action: "STOCK_IN_UPDATE",
          details: `Updated ${validation.data.name} (${validation.data.productId}): +${quantityToAdd}`,
          productId: validation.data.productId || null,
          itemName: validation.data.name || null,
          sku: validation.data.sku,
          location: validation.data.location,
          quantity: quantityToAdd,
          price: validation.data.price !== undefined ? validation.data.price : existing.price,
        });

        return res.json(updated);
      } else {
        // Create new item with authenticated user ID
        const item = await storage.createInventoryItem({
          ...validation.data,
          createdBy: userId,
        });

        // Log the event using authenticated user ID
        await storage.createEventLog({
          userId,
          action: "STOCK_IN",
          details: `Added ${validation.data.name} (${validation.data.productId}): ${validation.data.quantity}`,
          productId: validation.data.productId || null,
          itemName: validation.data.name || null,
          sku: validation.data.sku,
          location: validation.data.location,
          quantity: validation.data.quantity || null,
          price: validation.data.price || null,
        });

        return res.status(201).json(item);
      }
    } catch (error: any) {
      console.error("Create inventory item error:", error);
      return res.status(500).json({ error: "Внутренняя ошибка сервера" });
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

        const itemData = {
          productId,
          name: csvItem.name || "",
          sku: csvItem.sku || csvItem.location || productId,
          location: csvItem.location || csvItem.sku || productId,
          quantity,
          barcode: csvItem.barcode || "",
          price: csvItem.price ? parseInt(csvItem.price) : undefined,
          createdBy: userId,
        };

        if (currentItemsMap.has(productId)) {
          // Update existing item
          const existingItem = currentItemsMap.get(productId)!;
          await storage.updateInventoryItem(existingItem.id, itemData);
          updated++;
          currentItemsMap.delete(productId); // Mark as processed
        } else {
          // Create new item
          await storage.createInventoryItem(itemData);
          created++;
        }
      }

      // Delete items not in CSV
      for (const [productId, item] of Array.from(currentItemsMap.entries())) {
        await storage.deleteInventoryItem(item.id, userId);
        deleted++;
        deletedItems.push(`${item.name} (${item.productId})`);

        // Log deletion
        await storage.createEventLog({
          userId,
          action: "ITEM_DELETED",
          details: `Deleted from file sync: ${item.name} (${item.productId}), quantity: ${item.quantity}`,
          productId: item.productId || null,
          itemName: item.name || null,
          sku: item.sku,
          location: item.location,
        });
      }

      // Log the sync event
      await storage.createEventLog({
        userId,
        action: "FILE_SYNC",
        details: `File sync: ${created} created, ${updated} updated, ${deleted} deleted`,
      });

      console.log("[FILE SYNC] Results:", { created, updated, deleted });

      return res.json({ 
        success: true, 
        created, 
        updated, 
        deleted,
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

  const httpServer = createServer(app);

  // Setup WebSocket server for remote scanning
  setupWebSocket(httpServer);

  return httpServer;
}
