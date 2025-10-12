import { readFileSync } from "fs";
import { db } from "./db";
import { inventoryItems, users } from "@shared/schema";
import { eq } from "drizzle-orm";

interface JSONInventoryItem {
  id: number;
  sku: string;
  name: string;
  barcode: string | null;
  location: string | null;
  status: string;
  timestamp: string;
}

async function importInventory() {
  console.log("Starting inventory import...");
  
  // Create a default admin user if not exists
  const existingAdmin = await db.select().from(users).where(eq(users.login, "admin")).limit(1);
  
  let adminUser;
  if (existingAdmin.length === 0) {
    const result = await db.insert(users).values({
      name: "Администратор",
      login: "admin",
      password: "admin123", // In production, this should be hashed
      role: "admin",
    }).returning();
    adminUser = result[0];
    console.log("Created default admin user (login: admin, password: admin123)");
  } else {
    adminUser = existingAdmin[0];
  }

  // Read the JSON file
  const jsonData = readFileSync("attached_assets/data_1760292629775.json", "utf-8");
  const items: JSONInventoryItem[] = JSON.parse(jsonData);
  
  console.log(`Found ${items.length} items to import`);

  // Import in batches
  const batchSize = 1000;
  let imported = 0;
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    const values = batch.map(item => ({
      productId: String(item.id),
      name: item.name,
      sku: item.sku,
      location: item.location || item.sku, // Use SKU as location if location is null
      quantity: 1, // Default quantity
      barcode: item.barcode || undefined,
      status: item.status === "PENDING_BARCODE" ? "IN_STOCK" : item.status,
      createdBy: adminUser.id,
    }));

    await db.insert(inventoryItems).values(values);
    imported += batch.length;
    
    console.log(`Imported ${imported} / ${items.length} items...`);
  }

  console.log("Import complete!");
  process.exit(0);
}

importInventory().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
