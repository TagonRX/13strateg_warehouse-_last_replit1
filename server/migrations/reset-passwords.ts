import { db } from "../db";
import { users, migrations } from "@shared/schema";
import { eq } from "drizzle-orm";
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
      .limit(1);
    
    if (existingMigration.length > 0) {
      // Migration already executed - silent skip
      return;
    }
    
    console.log("=".repeat(60));
    console.log("[MIGRATION] 🔄 PASSWORD RESET MIGRATION STARTING");
    console.log("=".repeat(60));
    
    // Get all users
    const allUsers = await db.select().from(users);
    
    if (allUsers.length === 0) {
      console.log("[MIGRATION] No users found, skipping migration");
      // Still record that migration was attempted
      await db.insert(migrations).values({
        id: MIGRATION_ID,
        name: "Reset all user passwords to default",
      });
      return;
    }
    
    console.log(`[MIGRATION] Found ${allUsers.length} users to update`);
    
    // Hash the default password
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);
    
    // Update all users with new password (WITHOUT storing plaintext password!)
    for (const user of allUsers) {
      await db
        .update(users)
        .set({
          password: hashedPassword,
          requiresPasswordChange: true,
          defaultPassword: null, // Remove plaintext password for security
        })
        .where(eq(users.id, user.id));
      
      console.log(`[MIGRATION] ✓ Updated password for user: ${user.login}`);
    }
    
    // Record that migration has been executed
    await db.insert(migrations).values({
      id: MIGRATION_ID,
      name: "Reset all user passwords to default",
    });
    
    console.log("=".repeat(60));
    console.log("[MIGRATION] ✅ Password reset completed successfully!");
    console.log(`[MIGRATION] All ${allUsers.length} users can now login with: ${DEFAULT_PASSWORD}`);
    console.log("[MIGRATION] Users will be prompted to change password on first login");
    console.log("[MIGRATION] Migration recorded in database - will not run again");
    console.log("=".repeat(60));
    
  } catch (error) {
    console.error("[MIGRATION] ❌ Error during password reset migration:", error);
    throw error;
  }
}
