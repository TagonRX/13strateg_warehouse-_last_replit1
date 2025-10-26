import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "./auth";

async function createAdminUser() {
  console.log("Создание admin пользователя...");
  
  // Проверяем существует ли admin
  const existingAdmin = await db.select().from(users).where(eq(users.login, "admin")).limit(1);
  
  const hashedPassword = await hashPassword("admin123");
  
  if (existingAdmin.length === 0) {
    // Создаём нового admin
    await db.insert(users).values({
      name: "Администратор",
      login: "admin",
      password: hashedPassword,
      role: "admin",
    });
    console.log("✓ Admin пользователь создан!");
  } else {
    // Обновляем пароль существующего admin
    await db.update(users)
      .set({ password: hashedPassword })
      .where(eq(users.login, "admin"));
    console.log("✓ Пароль admin пользователя обновлён!");
  }
  
  console.log("");
  console.log("Данные для входа:");
  console.log("  Логин:  admin");
  console.log("  Пароль: admin123");
  console.log("");
  
  process.exit(0);
}

createAdminUser().catch((error) => {
  console.error("✗ Ошибка при создании admin:", error);
  process.exit(1);
});
