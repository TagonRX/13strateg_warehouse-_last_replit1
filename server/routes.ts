import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertInventoryItemSchema, insertEventLogSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";

export async function registerRoutes(app: Express): Promise<Server> {
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

      // Simple password check (in production, use proper hashing)
      if (user.password !== password) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Log the login event
      await storage.createEventLog({
        userId: user.id,
        action: "LOGIN",
        details: `User ${user.name} logged in`,
      });

      return res.json({
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

  // Inventory routes
  app.get("/api/inventory", async (req, res) => {
    try {
      const items = await storage.getAllInventoryItems();
      return res.json(items);
    } catch (error: any) {
      console.error("Get inventory error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/inventory", async (req, res) => {
    try {
      const validation = insertInventoryItemSchema.safeParse(req.body);
      
      if (!validation.success) {
        const error = fromZodError(validation.error);
        return res.status(400).json({ error: error.message });
      }

      // Check if item with same productId already exists
      const existing = await storage.getInventoryItemByProductId(validation.data.productId);
      
      if (existing) {
        // Update existing item
        const quantityToAdd = validation.data.quantity ?? 1;
        const updated = await storage.updateInventoryItem(validation.data.productId, {
          quantity: existing.quantity + quantityToAdd,
          location: validation.data.location,
          sku: validation.data.sku,
          barcode: validation.data.barcode,
        });

        // Log the event
        if (validation.data.createdBy) {
          await storage.createEventLog({
            userId: validation.data.createdBy,
            action: "STOCK_IN_UPDATE",
            details: `Updated ${validation.data.name} (${validation.data.productId}): +${quantityToAdd}`,
          });
        }

        return res.json(updated);
      } else {
        // Create new item
        const item = await storage.createInventoryItem(validation.data);

        // Log the event
        if (validation.data.createdBy) {
          await storage.createEventLog({
            userId: validation.data.createdBy,
            action: "STOCK_IN",
            details: `Added ${validation.data.name} (${validation.data.productId}): ${validation.data.quantity}`,
          });
        }

        return res.status(201).json(item);
      }
    } catch (error: any) {
      console.error("Create inventory item error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/inventory/bulk-upload", async (req, res) => {
    try {
      const { items, userId } = req.body;
      
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: "Items must be an array" });
      }

      const result = await storage.bulkUpsertInventoryItems(items);

      // Log the event
      if (userId) {
        await storage.createEventLog({
          userId,
          action: "CSV_UPLOAD",
          details: `Bulk upload: ${result.success} new, ${result.updated} updated, ${result.errors} errors`,
        });
      }

      return res.json(result);
    } catch (error: any) {
      console.error("Bulk upload error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Warehouse loading analysis
  app.get("/api/warehouse/loading", async (req, res) => {
    try {
      const loading = await storage.getWarehouseLoadingByLocation();
      return res.json(loading);
    } catch (error: any) {
      console.error("Get warehouse loading error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // User management routes (admin only - validation should be done on frontend)
  app.get("/api/users", async (req, res) => {
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

  app.post("/api/users", async (req, res) => {
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

      const user = await storage.createUser(validation.data);
      
      // Don't send password to frontend
      const { password, ...safeUser } = user;
      
      return res.status(201).json(safeUser);
    } catch (error: any) {
      console.error("Create user error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteUser(id);
      return res.status(204).send();
    } catch (error: any) {
      console.error("Delete user error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Event logs (admin only)
  app.get("/api/logs", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const logs = await storage.getEventLogs(limit);
      return res.json(logs);
    } catch (error: any) {
      console.error("Get logs error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
