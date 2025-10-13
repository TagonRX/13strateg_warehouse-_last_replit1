import { db } from "./db";
import { warehouseSettings } from "../shared/schema";
import { sql } from "drizzle-orm";

// Seed warehouse settings for letters E-Z
export async function seedWarehouseSettings() {
  const letters = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
  const locations = [1, 2, 3, 4, 5, 6];
  const tsku = 3;
  const maxq = 7;

  const settings = [];
  for (const letter of letters) {
    for (const loc of locations) {
      settings.push({
        locationPattern: `${letter}${loc}`,
        tsku,
        maxq,
      });
    }
  }

  // Insert with conflict resolution
  await db.insert(warehouseSettings)
    .values(settings)
    .onConflictDoUpdate({
      target: warehouseSettings.locationPattern,
      set: {
        tsku: sql`EXCLUDED.tsku`,
        maxq: sql`EXCLUDED.maxq`,
        updatedAt: sql`NOW()`,
      },
    });

  console.log(`✓ Seeded ${settings.length} warehouse settings for letters E-Z`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedWarehouseSettings()
    .then(() => {
      console.log("Warehouse settings seeded successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error seeding warehouse settings:", error);
      process.exit(1);
    });
}
