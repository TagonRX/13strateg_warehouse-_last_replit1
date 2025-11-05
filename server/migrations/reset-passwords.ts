import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;
const DEFAULT_PASSWORD = "123456";

/**
 * Migration to reset all user passwords to default password
 * This is a ONE-TIME migration to sync development and production databases
 * 
 * IMPORTANT: This migration runs ONLY ONCE when triggered manually.
 * To run this migration in production, the user must add "123456" to Replit Secrets
 * as TRIGGER_PASSWORD_RESET, then remove it after deployment.
 */
export async function resetAllPasswords(): Promise<void> {
  try {
    // Check if migration should run via environment trigger
    const triggerValue = process.env.TRIGGER_PASSWORD_RESET;
    
    // Migration runs only if TRIGGER_PASSWORD_RESET equals the default password
    if (triggerValue !== DEFAULT_PASSWORD) {
      // Silent skip - no logs needed for normal operation
      return;
    }
    
    console.log("=".repeat(60));
    console.log("[MIGRATION] ⚠️  PASSWORD RESET MIGRATION TRIGGERED ⚠️");
    console.log("=".repeat(60));
    console.log("[MIGRATION] Starting password reset migration...");
    
    // Get all users
    const allUsers = await db.select().from(users);
    
    if (allUsers.length === 0) {
      console.log("[MIGRATION] No users found, skipping migration");
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
    
    console.log("=".repeat(60));
    console.log("[MIGRATION] ✅ Password reset completed successfully!");
    console.log(`[MIGRATION] All ${allUsers.length} users can now login with: ${DEFAULT_PASSWORD}`);
    console.log("[MIGRATION] Users will be prompted to change password on first login");
    console.log("=".repeat(60));
    console.log("[MIGRATION] ⚠️  IMPORTANT: Remove TRIGGER_PASSWORD_RESET from Secrets!");
    console.log("[MIGRATION] Otherwise this migration will run on every restart!");
    console.log("=".repeat(60));
    
  } catch (error) {
    console.error("[MIGRATION] ❌ Error during password reset migration:", error);
    throw error;
  }
}
