import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertInventoryItemSchema, insertEventLogSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { verifyPassword, hashPassword, createSession, requireAuth, requireAdmin } from "./auth";
import { setupWebSocket } from "./websocket";
import fs from "fs/promises";
import path from "path";

export async function registerRoutes(app: Express): Promise<Server> {
  // Get current user (check token validity)
  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.json({
        id: user.id,
        name: user.name,
        login: user.login,
        role: user.role,
      });
    } catch (error: any) {
      console.error("Get current user error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Authentication routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { login, password } = req.body;
      
      if (!login || !password) {
        return res.status(400).json({ error: "Login and password are required" });
      }

      const user = await storage.getUserByLogin(login);
      
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Verify password using bcrypt
      const isValid = await verifyPassword(password, user.password);
      
      if (!isValid) {
        return res.status(401).json({ error: "Invalid credentials" });
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
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Inventory routes (require authentication)
  app.get("/api/inventory", requireAuth, async (req, res) => {
    try {
      const items = await storage.getAllInventoryItems();
      return res.json(items);
    } catch (error: any) {
      console.error("Get inventory error:", error);
      return res.status(500).json({ error: "Internal server error" });
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
        await storage.createEventLog({
          userId,
          action: "STOCK_IN_UPDATE",
          details: `Updated ${validation.data.name} (${validation.data.productId}): +${quantityToAdd}`,
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
        });

        return res.status(201).json(item);
      }
    } catch (error: any) {
      console.error("Create inventory item error:", error);
      return res.status(500).json({ error: "Internal server error" });
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
        return res.status(404).json({ error: "Item not found" });
      }

      // Update item
      const updated = await storage.updateInventoryItemById(id, updates);

      // Log the event
      await storage.createEventLog({
        userId,
        action: "INVENTORY_UPDATE",
        details: `Updated item ${existing.sku} (${id})`,
      });

      // Check if quantity is 0 and delete if so
      if (updated.quantity === 0) {
        await storage.deleteInventoryItem(id, userId);
        await storage.createEventLog({
          userId,
          action: "AUTO_DELETE",
          details: `Auto-deleted item ${existing.sku} (${id}) - quantity reached 0`,
        });
        return res.json({ deleted: true, item: updated });
      }

      return res.json(updated);
    } catch (error: any) {
      console.error("Update inventory item error:", error);
      return res.status(500).json({ error: "Internal server error" });
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
        return res.status(404).json({ error: "Item not found" });
      }

      // Delete item
      await storage.deleteInventoryItem(id, userId);

      // Log the event
      await storage.createEventLog({
        userId,
        action: "INVENTORY_DELETE",
        details: `Deleted item ${existing.sku} (${id})`,
      });

      return res.json({ success: true });
    } catch (error: any) {
      console.error("Delete inventory item error:", error);
      return res.status(500).json({ error: "Internal server error" });
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
        return res.status(400).json({ error: "Items must be an array" });
      }

      if (items.length === 0) {
        return res.status(400).json({ error: "No items to upload" });
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
      return res.status(500).json({ error: "Internal server error" });
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
        return res.status(404).json({ error: "CSV file not found. Please create data/inventory_sync.csv" });
      }

      const lines = fileContent.trim().split("\n");
      if (lines.length < 2) {
        return res.status(400).json({ error: "CSV file is empty or has no data rows" });
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
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Warehouse loading analysis (require authentication)
  app.get("/api/warehouse/loading", requireAuth, async (req, res) => {
    try {
      const loading = await storage.getWarehouseLoadingByLocation();
      return res.json(loading);
    } catch (error: any) {
      console.error("Get warehouse loading error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Warehouse Settings (Read: all users, Write: admin only)
  app.get("/api/warehouse/settings", requireAuth, async (req, res) => {
    try {
      const settings = await storage.getAllWarehouseSettings();
      return res.json(settings);
    } catch (error: any) {
      console.error("Get warehouse settings error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/warehouse/settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { locationPattern, tsku, maxq } = req.body;

      if (!locationPattern || !tsku || !maxq) {
        return res.status(400).json({ error: "locationPattern, tsku, and maxq are required" });
      }

      const setting = await storage.upsertWarehouseSetting({ locationPattern, tsku, maxq });
      return res.json(setting);
    } catch (error: any) {
      console.error("Upsert warehouse setting error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/warehouse/settings/:locationPattern", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { locationPattern } = req.params;
      await storage.deleteWarehouseSetting(locationPattern);
      return res.status(204).send();
    } catch (error: any) {
      console.error("Delete warehouse setting error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Active Locations (Admin only)
  app.get("/api/warehouse/active-locations", requireAuth, async (req, res) => {
    try {
      const locations = await storage.getAllActiveLocations();
      return res.json(locations);
    } catch (error: any) {
      console.error("Get active locations error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/warehouse/active-locations", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { locations } = req.body;

      if (!Array.isArray(locations)) {
        return res.status(400).json({ error: "locations must be an array" });
      }

      await storage.setActiveLocations(locations);
      const saved = await storage.getAllActiveLocations();
      return res.json(saved);
    } catch (error: any) {
      console.error("Set active locations error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/warehouse/active-locations", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.clearActiveLocations();
      return res.status(204).send();
    } catch (error: any) {
      console.error("Clear active locations error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Stock-Out (Picking) routes
  app.post("/api/inventory/pick", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { barcode } = req.body;

      if (!barcode) {
        return res.status(400).json({ error: "Barcode is required" });
      }

      const item = await storage.pickItemByBarcode(barcode, userId);

      if (!item) {
        return res.status(404).json({ error: "Item not found or already picked" });
      }

      return res.json(item);
    } catch (error: any) {
      console.error("Pick item error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/inventory/item/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { id } = req.params;

      const deleted = await storage.deleteInventoryItem(id, userId);

      if (!deleted) {
        return res.status(404).json({ error: "Item not found" });
      }

      return res.status(204).send();
    } catch (error: any) {
      console.error("Delete item error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/inventory/location/:location", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { location } = req.params;

      const count = await storage.deleteItemsByLocation(location, userId);

      if (count === 0) {
        return res.status(404).json({ error: "Location not found" });
      }

      return res.json({ deleted: count });
    } catch (error: any) {
      console.error("Delete location error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Daily Picking routes
  app.post("/api/picking/lists", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { name, tasks } = req.body;

      if (!name || !tasks || !Array.isArray(tasks)) {
        return res.status(400).json({ error: "Name and tasks are required" });
      }

      const result = await storage.createPickingList({
        name,
        userId,
        tasks,
      });

      return res.json(result);
    } catch (error: any) {
      console.error("Create picking list error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/picking/lists", requireAuth, async (req, res) => {
    try {
      const lists = await storage.getAllPickingLists();
      return res.json(lists);
    } catch (error: any) {
      console.error("Get picking lists error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/picking/lists/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await storage.getPickingListWithTasks(id);

      if (!result) {
        return res.status(404).json({ error: "Picking list not found" });
      }

      return res.json(result);
    } catch (error: any) {
      console.error("Get picking list error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/picking/scan", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { barcode, taskId } = req.body;

      if (!barcode || !taskId) {
        return res.status(400).json({ error: "Barcode and taskId are required" });
      }

      const result = await storage.scanBarcodeForPickingTask(barcode, taskId, userId);

      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }

      return res.json(result);
    } catch (error: any) {
      console.error("Scan barcode error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/picking/lists/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { id } = req.params;

      const deleted = await storage.deletePickingList(id, userId);

      if (!deleted) {
        return res.status(404).json({ error: "Picking list not found" });
      }

      return res.status(204).send();
    } catch (error: any) {
      console.error("Delete picking list error:", error);
      return res.status(500).json({ error: "Internal server error" });
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
      return res.status(500).json({ error: "Internal server error" });
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
        return res.status(400).json({ error: "User with this login already exists" });
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
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteUser(id);
      return res.status(204).send();
    } catch (error: any) {
      console.error("Delete user error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/users/:id/password", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { password } = req.body;

      if (!password || password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      const hashedPassword = await hashPassword(password);
      await storage.updateUserPassword(id, hashedPassword);
      
      return res.json({ message: "Password updated successfully" });
    } catch (error: any) {
      console.error("Update password error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // SKU Errors (admin only)
  app.get("/api/sku-errors", requireAuth, requireAdmin, async (req, res) => {
    try {
      const errors = await storage.getAllSkuErrors();
      return res.json(errors);
    } catch (error: any) {
      console.error("Get SKU errors error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/sku-errors/:id/resolve", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { correctedSku } = req.body;
      const userId = (req as any).userId;

      if (!correctedSku) {
        return res.status(400).json({ error: "Corrected SKU is required" });
      }

      await storage.resolveSkuError(id, correctedSku, userId);
      return res.json({ message: "SKU error resolved successfully" });
    } catch (error: any) {
      console.error("Resolve SKU error:", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  app.delete("/api/sku-errors/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteSkuError(id);
      return res.json({ message: "SKU error deleted successfully" });
    } catch (error: any) {
      console.error("Delete SKU error:", error);
      return res.status(500).json({ error: "Internal server error" });
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
      return res.status(500).json({ error: "Internal server error" });
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
      return res.status(500).json({ error: "Internal server error" });
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
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  const httpServer = createServer(app);

  // Setup WebSocket server for remote scanning
  setupWebSocket(httpServer);

  return httpServer;
}
