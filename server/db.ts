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

export const db = (() => {
  if (isNeonDatabase) {
    // Для Replit/Neon используем serverless драйвер с WebSocket
    neonConfig.webSocketConstructor = ws;
    const pool = new NeonPool({ connectionString: process.env.DATABASE_URL });
    console.log("🔌 Database: Neon Serverless (WebSocket)");
    return drizzleNeon({ client: pool });
  } else {
    // Для обычного PostgreSQL (Kubuntu) используем node-postgres
    const pool = new pg.Pool({ 
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    console.log("🔌 Database: PostgreSQL (node-postgres)");
    return drizzlePostgres(pool);
  }
})();
