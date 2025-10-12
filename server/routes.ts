import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertInventoryItemSchema, insertEventLogSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { verifyPassword, hashPassword, createSession, requireAuth, requireAdmin } from "./auth";

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

  app.post("/api/inventory/bulk-upload", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId; // From requireAuth middleware
      const { items } = req.body;
      
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: "Items must be an array" });
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

  // Event logs (admin only)
  app.get("/api/logs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const logs = await storage.getEventLogs(limit);
      return res.json(logs);
    } catch (error: any) {
      console.error("Get logs error:", error);
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

  return httpServer;
}
