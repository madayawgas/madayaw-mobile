import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL } from './schema';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Initializes and returns the local SQLite database singleton.
 * Configures PRAGMA journal_mode = WAL and foreign_keys = ON.
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const db = await SQLite.openDatabaseAsync('madayawgas.db');

      // Enable WAL mode for high concurrency and resilience against app kills
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await db.execAsync('PRAGMA busy_timeout = 5000;');

      // 1. PRE-MIGRATION: Ensure required columns exist on sync_queue and local_sales_orders
      try {
        const syncTableCheck = await db.getFirstAsync<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='sync_queue';"
        );
        if (syncTableCheck) {
          const columns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(sync_queue);");
          const colNames = new Set(columns.map((c) => c.name));
          if (!colNames.has('user_id')) {
            console.log('[Database] Migrating sync_queue: adding user_id column...');
            await db.execAsync('ALTER TABLE sync_queue ADD COLUMN user_id TEXT;');
          }
          if (!colNames.has('error_code')) {
            console.log('[Database] Migrating sync_queue: adding error_code column...');
            await db.execAsync('ALTER TABLE sync_queue ADD COLUMN error_code TEXT;');
          }
          if (!colNames.has('error_message')) {
            console.log('[Database] Migrating sync_queue: adding error_message column...');
            await db.execAsync('ALTER TABLE sync_queue ADD COLUMN error_message TEXT;');
          }
          if (!colNames.has('last_error')) {
            console.log('[Database] Migrating sync_queue: adding last_error column...');
            await db.execAsync('ALTER TABLE sync_queue ADD COLUMN last_error TEXT;');
          }
        }

        const ordersTableCheck = await db.getFirstAsync<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='local_sales_orders';"
        );
        if (ordersTableCheck) {
          const columns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(local_sales_orders);");
          const colNames = new Set(columns.map((c) => c.name));
          if (!colNames.has('error_code')) {
            console.log('[Database] Migrating local_sales_orders: adding error_code column...');
            await db.execAsync('ALTER TABLE local_sales_orders ADD COLUMN error_code TEXT;');
          }
          if (!colNames.has('error_message')) {
            console.log('[Database] Migrating local_sales_orders: adding error_message column...');
            await db.execAsync('ALTER TABLE local_sales_orders ADD COLUMN error_message TEXT;');
          }
        }
      } catch (migErr) {
        console.warn('[Database] Pre-migration check warning:', migErr);
      }

      // 2. Execute schema tables and indexes (including idx_sync_queue_user_status)
      await db.execAsync(SCHEMA_SQL);

      dbInstance = db;
      return db;
    } catch (err) {
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
}

/**
 * Resets all shift-specific tables in the database (useful when completing shift or testing)
 */
export async function resetShiftDatabase(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    DELETE FROM local_canister_ledger;
    DELETE FROM local_sales_items;
    DELETE FROM local_sales_orders;
    DELETE FROM local_active_trip;
    DELETE FROM local_vehicle_inventory;
    DELETE FROM local_receipt_sequences;
  `);
}

/**
 * Drops all local SQLite tables and recreates the fresh schema.
 * Clears all pending sync items, active trips, cached inventory, customers, and operational logs.
 */
export async function resetFullDatabase(): Promise<void> {
  const db = await getDatabase();
  try {
    // 1. Temporarily disable foreign keys so tables can be dropped in any order
    await db.execAsync('PRAGMA foreign_keys = OFF;');
    await db.execAsync(`
      DROP TABLE IF EXISTS local_canister_ledger;
      DROP TABLE IF EXISTS local_sales_items;
      DROP TABLE IF EXISTS local_sales_orders;
      DROP TABLE IF EXISTS local_customers;
      DROP TABLE IF EXISTS local_vehicle_inventory;
      DROP TABLE IF EXISTS local_active_trip;
      DROP TABLE IF EXISTS sync_queue;
      DROP TABLE IF EXISTS local_receipt_sequences;
      DROP TABLE IF EXISTS local_driver_shift;
      DROP TABLE IF EXISTS local_vehicle_telemetry;
      DROP TABLE IF EXISTS local_fuel_logs;
      DROP TABLE IF EXISTS local_apprehensions;
      DROP TABLE IF EXISTS local_incidents;
      DROP TABLE IF EXISTS local_service_zones;
    `);
  } finally {
    // 2. Always restore foreign keys
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }

  // 3. Recreate all 14 schema tables and indexes
  await db.execAsync(SCHEMA_SQL);
}

