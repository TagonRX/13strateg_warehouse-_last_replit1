import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function createAdminUser() {
  console.log("Создание admin пользователя...");
  
  // Проверяем DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error("✗ DATABASE_URL не найден в переменных окружения!");
    console.error("→ Убедитесь что файл .env существует");
    process.exit(1);
  }
  
  // Создаём подключение к PostgreSQL (БЕЗ WebSocket!)
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
  });
  
  try {
    await client.connect();
    const db = drizzle(client);
    
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
    
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error("✗ Ошибка при создании admin:", error);
    await client.end();
    process.exit(1);
  }
}

createAdminUser();
