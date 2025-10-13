import { db } from "./db";
import { warehouseSettings } from "../shared/schema";
import { sql } from "drizzle-orm";

// Seed warehouse settings for letters E-Z (grouped locations)
export async function seedWarehouseSettings() {
  const letters = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
  const tsku = 3;
  const maxq = 7;

  const settings = letters.map(letter => ({
    locationPattern: `${letter}1,${letter}2,${letter}3,${letter}4,${letter}5,${letter}6`,
    tsku,
    maxq,
  }));

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

  console.log(`✓ Seeded ${settings.length} grouped warehouse settings for letters E-Z`);
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
