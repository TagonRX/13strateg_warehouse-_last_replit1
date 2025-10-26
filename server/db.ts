import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { neonConfig, Pool as NeonPool } from "@neondatabase/serverless";
import pg from "pg";
import ws from "ws";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Ensure the database is provisioned.");
}

// Определяем какой драйвер использовать
const isNeonDatabase = process.env.DATABASE_URL.includes('neon.tech') || 
                       process.env.DATABASE_URL.includes('pooler.supabase');

let db;

if (isNeonDatabase) {
  // Для Replit/Neon используем serverless драйвер с WebSocket
  neonConfig.webSocketConstructor = ws;
  const pool = new NeonPool({ connectionString: process.env.DATABASE_URL });
  db = drizzleNeon({ client: pool });
  console.log("🔌 Database: Neon Serverless (WebSocket)");
} else {
  // Для обычного PostgreSQL (Kubuntu) используем node-postgres
  const pool = new pg.Pool({ 
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  
  db = drizzlePostgres(pool);
  console.log("🔌 Database: PostgreSQL (node-postgres)");
}

export { db };
