import { db } from "../db";
import { users, migrations } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;
const DEFAULT_PASSWORD = "123456";
const MIGRATION_ID = "reset-passwords-2024";

/**
 * Migration to reset all user passwords to default password
 * This is a ONE-TIME migration that runs automatically on first deployment
 * 
 * Migration is tracked in the 'migrations' table to ensure it runs only once
 * across all environments (development and production).
 */
export async function resetAllPasswords(): Promise<void> {
  try {
    // Check if migration has already been executed
    const existingMigration = await db
      .select()
      .from(migrations)
      .where(eq(migrations.id, MIGRATION_ID))
      .then(rows => rows.length > 0)
      .catch(() => false); // Таблица может не существовать еще
    
    if (existingMigration) {
      console.log("✓ Password reset migration already executed");
      return;
    }
    
    // Hash the default password
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);
    
    // Reset all passwords
    const result = await db
      .update(users)
      .set({ 
        password: hashedPassword,
        defaultPassword: DEFAULT_PASSWORD,
        requiresPasswordChange: true,
      })
      .run();
    
    console.log(`✓ Reset passwords for users`);
    
    // Record migration execution
    await db.insert(migrations).values({
      id: MIGRATION_ID,
      name: "Reset all user passwords to default",
      executedAt: new Date().toISOString(),
    }).run();
    
    console.log("✓ Migration recorded in migrations table");
  } catch (error) {
    console.error("Error during password reset migration:", error);
    // Don't throw - let the application continue running
  }
}
