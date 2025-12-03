import { db } from "./db";
import { users } from "@shared/schema";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { sql } from "drizzle-orm";

const SALT_ROUNDS = 10;

/**
 * Инициализация БД: создание таблиц и первого пользователя admin
 */
export async function initializeDatabase(): Promise<void> {
  try {
    console.log("🔧 Initializing database...");
    
    // Создаём таблицы через raw SQL (т.к. drizzle-kit push не работает с DEFAULT функциями)
    const tablesSql = `
      CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        executed_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        login TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        default_password TEXT,
        requires_password_change INTEGER DEFAULT 0 NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inventory_items (
        id TEXT PRIMARY KEY,
        product_id TEXT,
        name TEXT,
        sku TEXT NOT NULL,
        location TEXT NOT NULL,
        quantity INTEGER DEFAULT 1 NOT NULL,
        expected_quantity INTEGER,
        zero_quantity_since TEXT,
        barcode TEXT,
        barcode_mappings TEXT,
        condition TEXT,
        length INTEGER,
        width INTEGER,
        height INTEGER,
        volume INTEGER,
        weight INTEGER,
        price INTEGER,
        item_id TEXT,
        ebay_url TEXT,
        image_urls TEXT,
        ebay_seller_name TEXT,
        image_url_1 TEXT, image_url_2 TEXT, image_url_3 TEXT, image_url_4 TEXT,
        image_url_5 TEXT, image_url_6 TEXT, image_url_7 TEXT, image_url_8 TEXT,
        image_url_9 TEXT, image_url_10 TEXT, image_url_11 TEXT, image_url_12 TEXT,
        image_url_13 TEXT, image_url_14 TEXT, image_url_15 TEXT, image_url_16 TEXT,
        image_url_17 TEXT, image_url_18 TEXT, image_url_19 TEXT, image_url_20 TEXT,
        image_url_21 TEXT, image_url_22 TEXT, image_url_23 TEXT, image_url_24 TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS event_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        product_id TEXT,
        item_name TEXT,
        sku TEXT,
        location TEXT,
        quantity INTEGER,
        price INTEGER,
        is_warning INTEGER DEFAULT 0 NOT NULL,
        without_test INTEGER DEFAULT 0 NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS worker_analytics (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        date TEXT NOT NULL,
        items_received INTEGER DEFAULT 0 NOT NULL,
        items_picked INTEGER DEFAULT 0 NOT NULL,
        items_packed INTEGER DEFAULT 0 NOT NULL,
        csv_errors INTEGER DEFAULT 0 NOT NULL
      );

      CREATE TABLE IF NOT EXISTS picking_lists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING' NOT NULL,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS picking_tasks (
        id TEXT PRIMARY KEY,
        list_id TEXT,
        item_id TEXT,
        sku TEXT NOT NULL,
        item_name TEXT,
        item_name_source TEXT,
        buyer_username TEXT,
        buyer_name TEXT,
        address_postal_code TEXT,
        seller_ebay_id TEXT,
        order_date TEXT,
        ebay_seller_name TEXT,
        required_quantity INTEGER DEFAULT 1 NOT NULL,
        picked_quantity INTEGER DEFAULT 0 NOT NULL,
        status TEXT DEFAULT 'PENDING' NOT NULL,
        picked_item_ids TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sku_errors (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        name TEXT NOT NULL,
        csv_sku TEXT NOT NULL,
        existing_sku TEXT NOT NULL,
        quantity INTEGER DEFAULT 1 NOT NULL,
        barcode TEXT,
        status TEXT DEFAULT 'PENDING' NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        resolved_at TEXT
      );

      CREATE TABLE IF NOT EXISTS warehouse_settings (
        id TEXT PRIMARY KEY,
        location_pattern TEXT NOT NULL UNIQUE,
        tsku INTEGER DEFAULT 4 NOT NULL,
        maxq INTEGER DEFAULT 10 NOT NULL,
        bypass_code TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS active_locations (
        id TEXT PRIMARY KEY,
        location TEXT NOT NULL UNIQUE,
        barcode TEXT,
        is_active INTEGER DEFAULT 1 NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS csv_sources (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        name TEXT NOT NULL,
        enabled INTEGER DEFAULT 1 NOT NULL,
        sort_order INTEGER DEFAULT 0 NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bulk_upload_sources (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        label TEXT NOT NULL,
        enabled INTEGER DEFAULT 1 NOT NULL,
        field_sync_settings TEXT,
        sort_order INTEGER DEFAULT 0 NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS global_settings (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pending_tests (
        id TEXT PRIMARY KEY,
        barcode TEXT NOT NULL UNIQUE,
        sku TEXT,
        product_id TEXT,
        name TEXT,
        first_scan_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        first_scan_by TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tested_items (
        id TEXT PRIMARY KEY,
        barcode TEXT NOT NULL,
        sku TEXT,
        product_id TEXT,
        name TEXT,
        condition TEXT NOT NULL,
        first_scan_at TEXT NOT NULL,
        first_scan_by TEXT NOT NULL,
        decision_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        decision_by TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS faulty_stock (
        id TEXT PRIMARY KEY,
        barcode TEXT NOT NULL,
        sku TEXT,
        product_id TEXT,
        name TEXT,
        condition TEXT NOT NULL,
        first_scan_at TEXT NOT NULL,
        first_scan_by TEXT NOT NULL,
        decision_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        decision_by TEXT NOT NULL,
        working_hours INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pending_placements (
        id TEXT PRIMARY KEY,
        barcode TEXT NOT NULL,
        sku TEXT NOT NULL,
        location TEXT NOT NULL,
        product_id TEXT,
        name TEXT,
        condition TEXT NOT NULL,
        quantity INTEGER DEFAULT 1 NOT NULL,
        price INTEGER,
        length INTEGER,
        width INTEGER,
        height INTEGER,
        volume INTEGER,
        weight INTEGER,
        stock_in_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        stock_in_by TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS csv_import_sessions (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_url TEXT,
        file_name TEXT,
        status TEXT DEFAULT 'PARSING' NOT NULL,
        error TEXT,
        parsed_data TEXT,
        conflicts TEXT,
        resolutions TEXT,
        total_rows INTEGER DEFAULT 0 NOT NULL,
        matched_rows INTEGER DEFAULT 0 NOT NULL,
        conflict_rows INTEGER DEFAULT 0 NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        committed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        order_number TEXT NOT NULL UNIQUE,
        buyer_username TEXT,
        buyer_name TEXT,
        address_postal_code TEXT,
        seller_ebay_id TEXT,
        customer_name TEXT,
        shipping_address TEXT,
        order_date TEXT,
        status TEXT DEFAULT 'PENDING' NOT NULL,
        shipping_label TEXT,
        items TEXT,
        dispatched_by TEXT,
        dispatched_at TEXT,
        dispatched_barcodes TEXT,
        packed_by TEXT,
        packed_at TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS archived_inventory_items (
        id TEXT PRIMARY KEY,
        original_id TEXT,
        product_id TEXT,
        name TEXT,
        sku TEXT NOT NULL,
        location TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        barcode TEXT,
        barcode_mappings TEXT,
        condition TEXT,
        length INTEGER,
        width INTEGER,
        height INTEGER,
        volume INTEGER,
        weight INTEGER,
        price INTEGER,
        item_id TEXT,
        ebay_url TEXT,
        image_urls TEXT,
        ebay_seller_name TEXT,
        image_url_1 TEXT, image_url_2 TEXT, image_url_3 TEXT, image_url_4 TEXT,
        image_url_5 TEXT, image_url_6 TEXT, image_url_7 TEXT, image_url_8 TEXT,
        image_url_9 TEXT, image_url_10 TEXT, image_url_11 TEXT, image_url_12 TEXT,
        image_url_13 TEXT, image_url_14 TEXT, image_url_15 TEXT, image_url_16 TEXT,
        image_url_17 TEXT, image_url_18 TEXT, image_url_19 TEXT, image_url_20 TEXT,
        image_url_21 TEXT, image_url_22 TEXT, image_url_23 TEXT, image_url_24 TEXT,
        archived_by TEXT,
        archived_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        original_created_at TEXT,
        original_updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS scheduler_settings (
        id TEXT PRIMARY KEY,
        enabled INTEGER DEFAULT 0 NOT NULL,
        cron_expression TEXT DEFAULT '0 6 * * *' NOT NULL,
        last_run_at TEXT,
        last_run_status TEXT,
        last_run_error TEXT,
        last_run_id TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS import_runs (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_ref TEXT,
        triggered_by TEXT,
        rows_total INTEGER DEFAULT 0 NOT NULL,
        rows_with_id INTEGER DEFAULT 0 NOT NULL,
        rows_without_id INTEGER DEFAULT 0 NOT NULL,
        created INTEGER DEFAULT 0 NOT NULL,
        updated_all_fields INTEGER DEFAULT 0 NOT NULL,
        updated_quantity_only INTEGER DEFAULT 0 NOT NULL,
        updated_partial INTEGER DEFAULT 0 NOT NULL,
        skipped_no_id INTEGER DEFAULT 0 NOT NULL,
        errors INTEGER DEFAULT 0 NOT NULL,
        total_quantity_change INTEGER DEFAULT 0 NOT NULL,
        error_details TEXT,
        status TEXT DEFAULT 'SUCCESS' NOT NULL,
        duration INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      -- SKU reservations (to compute ATP and prevent overstock)
      CREATE TABLE IF NOT EXISTS reservations (
        id TEXT PRIMARY KEY,
        order_id TEXT,
        sku TEXT NOT NULL,
        quantity INTEGER DEFAULT 1 NOT NULL,
        status TEXT DEFAULT 'ACTIVE' NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        cleared_at TEXT
      );

      -- eBay accounts (multiple stores)
      CREATE TABLE IF NOT EXISTS ebay_accounts (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        site_id TEXT,
        client_id TEXT NOT NULL,
        client_secret TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        access_token TEXT,
        access_token_expires_at TEXT,
        enabled INTEGER DEFAULT 1 NOT NULL,
        use_orders INTEGER DEFAULT 0 NOT NULL,
        use_inventory INTEGER DEFAULT 0 NOT NULL,
        last_orders_since TEXT,
        last_inventory_since TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      -- Idempotency index for external orders
      CREATE TABLE IF NOT EXISTS external_orders_index (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        external_order_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        imported_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );

      -- External inventory mapping
      CREATE TABLE IF NOT EXISTS external_inventory_index (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        external_item_id TEXT NOT NULL,
        sku TEXT,
        inventory_item_id TEXT,
        imported_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `;

    // Выполняем создание таблиц
    const statements = tablesSql.split(';').filter(s => s.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        await db.run(sql.raw(statement + ';'));
      }
    }

    console.log("✓ Tables created");

    // Проверяем есть ли админ
    const existingAdmin = await db.select().from(users).where(sql`login = 'admin'`).limit(1);
    
    if (existingAdmin.length === 0) {
      // Создаём админа
      const adminId = randomBytes(16).toString('hex');
      const defaultPassword = "123456";
      const hashedPassword = await bcrypt.hash(defaultPassword, SALT_ROUNDS);
      
      await db.insert(users).values({
        id: adminId,
        name: "Administrator",
        login: "admin",
        password: hashedPassword,
        role: "admin",
        defaultPassword: defaultPassword,
        requiresPasswordChange: false,
      });

      console.log("✓ Admin user created (login: admin, password: 123456)");
    } else {
      console.log("✓ Admin user already exists");
    }

    console.log("✅ Database initialized successfully");

    // Миграция: добавить столбцы use_orders/use_inventory, если таблица старая
    try {
      const tableInfo: any = await db.execute(sql`PRAGMA table_info(ebay_accounts)`);
      const cols = (tableInfo.rows || []).map((r: any) => r.name);
      if (!cols.includes('use_orders')) {
        await db.execute(sql`ALTER TABLE ebay_accounts ADD COLUMN use_orders INTEGER DEFAULT 0 NOT NULL`);
      }
      if (!cols.includes('use_inventory')) {
        await db.execute(sql`ALTER TABLE ebay_accounts ADD COLUMN use_inventory INTEGER DEFAULT 0 NOT NULL`);
      }
    } catch (e) {
      console.warn('Migration check for ebay_accounts flags failed:', e);
    }
  } catch (error) {
    console.error("❌ Failed to initialize database:", error);
    throw error;
  }
}
