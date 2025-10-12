import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "./auth";

async function updateAdminPassword() {
  console.log("Updating admin password...");
  
  const adminUser = await db.select().from(users).where(eq(users.login, "admin")).limit(1);
  
  if (adminUser.length === 0) {
    console.log("Admin user not found");
    process.exit(1);
  }

  const hashedPassword = await hashPassword("admin123");
  
  await db.update(users)
    .set({ password: hashedPassword })
    .where(eq(users.login, "admin"));

  console.log("Admin password updated successfully!");
  console.log("Login: admin");
  console.log("Password: admin123");
  
  process.exit(0);
}

updateAdminPassword().catch((error) => {
  console.error("Failed to update password:", error);
  process.exit(1);
});
