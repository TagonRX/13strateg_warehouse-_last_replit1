import { db } from "./db";
import { warehouseSettings } from "../shared/schema";
import { sql } from "drizzle-orm";

// Seed warehouse settings for all letters A-Z (grouped locations)
export async function seedWarehouseSettings() {
  const settings = [
    // A-B with TSKU=4, MAXQ=10
    { locationPattern: 'A0, A1, A2, A3, A4, A5, A6', tsku: 4, maxq: 10 },
    { locationPattern: 'B0, B1, B2, B3, B4, B5, B6', tsku: 4, maxq: 10 },
    // C-Z with TSKU=3, MAXQ=7
    ...['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'].map(letter => ({
      locationPattern: `${letter}0, ${letter}1, ${letter}2, ${letter}3, ${letter}4, ${letter}5, ${letter}6`,
      tsku: 3,
      maxq: 7,
    })),
  ];

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

  console.log(`✓ Seeded ${settings.length} grouped warehouse settings for letters A-Z`);
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
